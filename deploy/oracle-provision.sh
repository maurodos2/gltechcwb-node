#!/usr/bin/env bash
#
# Provisiona a VM Oracle Cloud (Ubuntu 24.04 arm64 — Ampere A1) para a
# GLTechCWB + bot WhatsApp. Idempotente: pode rodar mais de uma vez.
#
# Uso (na VM, como root):
#   sudo bash oracle-provision.sh
#
# Depois copie o .env e a sessão do bot do seu PC:
#   scp .env ubuntu@IP:/opt/gltech/.env
#   scp -r .wwebjs_auth ubuntu@IP:/opt/gltech/   (opcional: evita novo QR)
#
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/maurodos2/gltechcwb-node.git}"
DOMAIN="${DOMAIN:-gltechcwb.com}"
APP_DIR="/opt/gltech"
EMAIL_ADMIN="${EMAIL_ADMIN:-negocios@gltechcwb.com}"

echo "==> [1/7] Pacotes base + Chromium (para o bot)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  curl ca-certificates gnupg git ufw jq \
  fonts-liberation libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
  libgtk-3-0t64 xvfb

echo "==> [2/7] Node.js 20 (LTS)"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v; npm -v

echo "==> [3/7] Repositório"
mkdir -p "$APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

echo "==> [4/7] Dependências (o puppeteer baixa o Chrome arm64 durante o install)"
cd "$APP_DIR"
npm ci --omit=dev || npm install --omit=dev

# Se existir um chromium do sistema (fallback), registra para o bot usá-lo.
CHROME_BIN="$(command -v chromium-browser || command -v chromium || true)"
if [ -n "$CHROME_BIN" ] && ! grep -q '^PUPPETEER_EXECUTABLE_PATH=' "$APP_DIR/.env" 2>/dev/null; then
  echo "PUPPETEER_EXECUTABLE_PATH=$CHROME_BIN" >> "$APP_DIR/.env"
fi

echo "==> [5/7] PM2 (manutenção do processo + boot automático)"
npm install -g pm2
if pm2 describe gltech >/dev/null 2>&1; then
  pm2 restart gltech
else
  pm2 start server.js --name gltech --cwd "$APP_DIR"
fi
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo "==> [6/7] Caddy (HTTPS automático com Let's Encrypt)"
if ! command -v caddy >/dev/null 2>&1; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y caddy
fi
cp "$APP_DIR/deploy/Caddyfile.example" /etc/caddy/Caddyfile
sed -i "s/__DOMAIN__/$DOMAIN/g; s/__EMAIL__/$EMAIL_ADMIN/g" /etc/caddy/Caddyfile
systemctl enable --now caddy
caddy reload --config /etc/caddy/Caddyfile

echo "==> [7/7] Firewall (22, 80, 443)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
yes | ufw enable || true

echo ""
echo "Provisionamento concluído."
echo "1) Confira o .env em $APP_DIR/.env (MONGO_URI, WHATSAPP_BOT_ENABLED=true, etc.)."
echo "2) Se não transferiu a sessão, escaneie o QR em https://$DOMAIN/admin/whatsapp"
echo "3) Aponte o DNS: A record de $DOMAIN (e www) para o IP público desta VM."