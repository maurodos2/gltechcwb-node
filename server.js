require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./config/db');
const { requireAdminAuth, attachAdminToLocals, attachCustomerToLocals } = require('./middleware/auth');
const Category = require('./models/Category');

const app = express();

const isProd = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);

// ---- Helpers disponíveis nas views ----
app.locals.formatPrice = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

app.locals.effectivePrice = (product) => {
  if (product.hasVariants) return null;
  return product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
};

app.locals.minVariantPrice = (product) => {
  if (!product.hasVariants || !product.variants.length) return null;
  return Math.min(
    ...product.variants.map((v) => (v.promoPrice && v.promoPrice > 0 ? v.promoPrice : v.price))
  );
};

app.locals.whatsappUrl = (number, text) => {
  if (!number) return '';
  const digits = String(number).replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text || '')}`;
};

// Serializa dados para inserir em <script> sem risco de quebra/XSS (</script>)
app.locals.safeJson = (data) => JSON.stringify(data)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

// Injeta JSON-LD com proteção extra contra quebra do tag <script>
app.locals.safeLdJson = (jsonString) => String(jsonString || '')
  .replace(/<\/script>/gi, '<\\/script>')
  .replace(/<\!--/gi, '<\\!--');

// SEO: meta descriptions dinâmicas, JSON-LD e template padrão de descrição
const seo = require('./lib/seo');
app.locals.seo = seo;
app.locals.productMetaDescription = seo.productMetaDescription;
app.locals.standardDescriptionHtml = seo.standardDescriptionHtml;

// Assets minificados em produção (gerados por `npm run build:assets`).
// Em desenvolvimento serve os arquivos originais (sem .min) p/ facilitar debug.
app.locals.asset = (relPath) => {
  if (!isProd) return relPath;
  return `/dist/${path.basename(relPath).replace(/\.(js|css)$/, '.min.$1')}`;
};

app.locals.isProd = () => isProd;

// ---- Middlewares base ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.disable('x-powered-by');

// Headers de segurança (CSP desabilitada: as views usam <script> inline)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false, // imagens do R2 são de outro domínio
  })
);

// Limites de tamanho de corpo explícitos
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(methodOverride('_method')); // permite PUT/DELETE via ?_method= em forms HTML
app.use(
  express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: false })
);

// Remove parâmetros de tracking do Google/redes sociais da URL com 301 (SEO:
// srsltid, gclid, fbclid, twclid, utm_* etc.). O servidor não os usa e eles
// gerariam URL duplicada/ruído no Search Console. Mantém os params da loja
// (q, ordem, page, _method).
const TRACKING_PARAMS = /^(srsltid|gclid|gclsrc|dclid|fbclid|twclid|msclkid|igshid|utm_[a-z_]+)$/i;
app.use((req, res, next) => {
  if (req.method !== 'GET' || !req._parsedUrl || !req._parsedUrl.query) return next();
  const clean = req._parsedUrl.query
    .split('&')
    .filter((pair) => {
      const key = pair.split('=')[0];
      return key && !TRACKING_PARAMS.test(key);
    })
    .join('&');
  const original = req._parsedUrl.query;
  if (clean === original) return next();
  const qs = clean ? `?${clean}` : '';
  res.redirect(301, req.path + qs);
});

// Normalização de URL para SEO: 301 de variantes com barra final para a forma
// canônica (sem barra), preservando a query. Evita "Cópia, canônica diferente"
// no Google (ex.: /categoria/x/ vs /categoria/x).
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) return next();
  if (req.path === '/' || !req.path.endsWith('/')) return next();
  const suffix = req.originalUrl.substring(req.path.length); // query preservada
  res.redirect(301, req.path.slice(0, -1) + suffix);
});

// Verificação de origem (CSRF em camadas): compara o Origin com o domínio do app
// (SITE_URL) e com o Host. Webhooks do Mercado Pago ficam de fora.
// IMPORTANTE: por padrão NÃO bloqueia (apena registra) enquanto investigamos um
// bloqueio falso de login do dono da loja; a defesa real de CSRF é o cookie
// SameSite=Lax + HttpOnly. Reativar em BLOCK quando o caso estiver esclarecido.
// Proteção cross-origin (estratégia do AGENTS.md → Backlog):
//  - BLOCK_CROSS_ORIGIN BLoqueia (403) requisições com Origin/Referer de outro
//    domínio — mitigação de CSRF em requisições de navegação (GET/POST) onde
//    `SameSite` não protege (ex.: navegadores legados, metodo-override via POST).
//    Ficou false durante o período de observação pós-migração p/ OCI; reativado
//    em true após 0 eventos em security_events (consulta via shell na VM em
//    2026-09-15), conforme a regra do AGENTS.md (~1 semana sem eventos).
//  - Antes de bloquear registra EM security_events (grava em NODE_ENV=production).
const BLOCK_CROSS_ORIGIN = true;
const appApex = (() => {
  try {
    return new URL(process.env.SITE_URL).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return null;
  }
})();
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next();
  if (process.env.NODE_ENV !== 'production') return next();
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return next();

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return next();

  let suspect = false;
  try {
    const apex = (h) => h.toLowerCase().replace(/^www\./, '');
    const oh = apex(new URL(origin).hostname);
    const host = apex(req.get('host').split(':')[0]);
    const allowed = [appApex, host].filter(Boolean);
    const ok = allowed.some((h) => oh === h || oh.endsWith('.' + h));
    suspect = !ok;
  } catch (e) {
    return next();
  }
  if (!suspect) return next();

  const evento = {
    ts: new Date(),
    method: req.method,
    url: req.originalUrl,
    origin: req.headers.origin || '',
    referer: req.headers.referer || '',
    host: req.get('host') || '',
    ip: req.ip || '',
    ua: (req.get('user-agent') || '').slice(0, 120),
  };
  console.warn(`[seguranca] Origem suspeita: ${JSON.stringify(evento)}`);
  if (mongoose) {
    mongoose.connection.db
      .collection('security_events')
      .insertOne(evento)
      .catch((e) => console.warn('[seguranca] falha ao registrar evento:', e.message));
  }
  if (BLOCK_CROSS_ORIGIN) {
    return res.status(403).send('Requisição rejeitada.');
  }
  next();
});

// Rate limit global para a API pública
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300, // 300 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
});
app.use('/api', apiLimiter);

// Rate limit para login (admin e cliente) contra força bruta.
// Conta apenas POSTs (tentativas reais); carregar a página de login não conta.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 tentativas por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST',
  message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
});

// Rate limit para operações de checkout (evita criar pedidos/pagamentos em loop)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 operações por minuto por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas operações. Aguarde um momento.' },
});
app.use(['/checkout/pay', '/checkout/pix', '/checkout/frete'], checkoutLimiter);

app.use(
  session({
    name: 'gltech.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-troque-isso',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
    },
  })
);

app.use(attachAdminToLocals);
app.use(attachCustomerToLocals);

// URL canônica do site público (base para <link rel="canonical"> e sitemap)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) return next();
  res.locals.canonicalUrl = `${req.protocol}://${req.get('host')}${req.path}`;
  next();
});

// Dados compartilhados pelo site público (menu de categorias, contato)
app.use(async (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api')) return next();
  try {
    res.locals.navCategories = await Category.find({ active: true }).sort({ order: 1, name: 1 });
  } catch (err) {
    res.locals.navCategories = [];
  }
  res.locals.contactWhatsapp = process.env.CONTACT_WHATSAPP || '';
  res.locals.contactEmail = process.env.CONTACT_EMAIL || '';
  // Dados de contato/endereço da loja física (SEO local / JSON-LD LocalBusiness).
  // Sobrescrever com env vars se desejar; defaults = dados reais da loja.
  res.locals.contactPhone = process.env.CONTACT_PHONE || '+554130301240';
  res.locals.storeLocal = {
    street: process.env.STORE_ADDRESS_STREET || 'Rua Acyr Guimarães, 195 - Apto 171',
    neighborhood: process.env.STORE_ADDRESS_NEIGHBORHOOD || 'Água Verde',
    city: process.env.STORE_ADDRESS_CITY || 'Curitiba',
    state: process.env.STORE_ADDRESS_STATE || 'PR',
    postalCode: process.env.STORE_ADDRESS_POSTAL_CODE || '80240-230',
    country: 'BR',
    geoLat: process.env.STORE_ADDRESS_LAT || '-25.4476240',
    geoLng: process.env.STORE_ADDRESS_LNG || '-49.2890019',
    openingHours: process.env.STORE_OPENING_HOURS || 'Mo-Fr 08:00-18:00',
  };
  next();
});

// ---- Rotas públicas de API ----
app.use('/api/products', require('./routes/api/products'));
app.use('/api/categories', require('./routes/api/categories'));
app.use('/api/cart', require('./routes/api/cart'));
app.use('/api/shipping', require('./routes/api/shipping'));
app.use('/api/webhooks', require('./routes/api/webhooks'));
app.use('/api/barcode', require('./routes/api/barcode'));

// ---- Site público (vitrine) ----
app.use('/', require('./routes/shop'));

// ---- Conta do cliente ----
app.use('/conta/login', loginLimiter);
app.use('/conta/register', loginLimiter);
app.use('/conta', require('./routes/customer'));

// ---- Checkout ----
app.use('/checkout', require('./routes/checkout'));

// ---- Rotas do admin ----
app.use('/admin/login', loginLimiter);
app.use('/admin', require('./routes/admin/auth')); // login/logout ficam fora do requireAdminAuth
app.use('/admin', requireAdminAuth, require('./routes/admin/dashboard'));
app.use('/admin/products', requireAdminAuth, require('./routes/admin/products'));
app.use('/admin/categories', requireAdminAuth, require('./routes/admin/categories'));
app.use('/admin/orders', requireAdminAuth, require('./routes/admin/orders'));
app.use('/admin/checkout', requireAdminAuth, require('./routes/admin/checkout'));
app.use('/admin/imports', requireAdminAuth, require('./routes/admin/imports'));
app.use('/admin/whatsapp', requireAdminAuth, require('./routes/admin/whatsapp'));
app.use('/admin/mail', requireAdminAuth, require('./routes/admin/mail'));
app.use('/admin/transcricao', requireAdminAuth, require('./routes/admin/whisper'));

// ---- 404 ----
app.use((req, res) => {
  res.status(404).render('shop/404', {
    title: 'Página não encontrada',
    navActive: '',
  });
});

// ---- Erros não tratados ----
app.use((err, req, res, next) => {
  console.error('[server] Erro:', err);
  if (res.headersSent) return next(err);
  res.status(500).send('Erro interno do servidor.');
});

// ---- Inicialização ----
const PORT = process.env.PORT || 3000;

connectDB().then(async () => {
  app.listen(PORT, () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });

  if (process.env.WHATSAPP_BOT_ENABLED === 'true') {
    require('./lib/whatsapp/service')
      .init()
      .catch((e) => console.error('[whatsapp] falha ao iniciar bot:', e));
  }
});
