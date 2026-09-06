# AGENTS.md

E-commerce `gltechcwb` — Express + MongoDB (Mongoose) + EJS. Storefront pt-BR: loja pública, painel admin, checkout com Mercado Pago (Pix/cartão). **Não há testes, lint nem typecheck** — validação é rodar o servidor e exercitar as rotas.

## Comandos

- `npm run dev` — nodemon em `server.js` (porta 3000).
- `npm run seed` — cria o 1º admin a partir de `SEED_ADMIN_EMAIL/PASSWORD` do `.env` (idempotente). Necessário antes de `/admin` fazer login.
- `npm run import-catalog -- migracao/categorias.json migracao/produtos.json` — upsert idempotente de catálogo por `slug` (categoria) e `sku` (produto). Hardcoda `type: 'produto'`.
- `npm run import-manufacturer -- SKU [SKU...]` — ferramenta manual: pesquisa o site oficial do fabricante, baixa imagens (para o R2) e descrição (só se vazia). Mesma engine do painel `/admin/imports`. Pode repetir sem duplicar.
- `npm run remove-services` — apaga todos os `type: 'servico'` e a categoria "Serviços Técnicos". Rodar para limpar serviços.

Ordem típica de setup local: `npm install` → copiar `.env.example` para `.env` → `npm run seed` → `npm run import-catalog -- migracao/categorias.json migracao/produtos.json`.

## Ambiente

- `.env` obrigatório (`config/db.js` faz `process.exit(1)` sem `MONGO_URI`). O `.env` real aponta para o Atlas e contém segredos; `.env` e `atlas-credentials.env` são gitignored — nunca commitar, logar ou exibir seus valores.
- `SEED_ADMIN_*` só são usados pelo seed. `WEBHOOK_SECRET` está em `.env.example`/`render.yaml` mas **não é validado** em código.
- Node 20 fixado em `engines` + `render.yaml` (fix de compatibilidade TLS com Atlas).

## Convenções

- Tudo voltado ao usuário é **pt-BR**: views, mensagens de log, comentários, README. Manter.
- Formulários HTML usam `method-override` via `?_method=PUT|DELETE` (configurado em `server.js`).
- Helpers globais de view ficam em `app.locals` (em `server.js`): `formatPrice`, `effectivePrice`, `minVariantPrice`, `whatsappUrl`. Não redifinir nas views.
- O middleware que carrega `navCategories` pula paths `/admin` e `/api`.
- Webhooks do Mercado Pago validam assinatura HMAC (`x-signature`) via SDK oficial; `WEBHOOK_SECRET` deve ser o **secret gerado no painel MP** (Suas integrações > Webhooks), não um valor inventado.

## Arquitetura

- `server.js` é o ponto único de montagem: qualquer rota nova precisa ser `app.use(...)` lá.
- `routes/api/*` são a API pública JSON; `routes/admin/*` são protegidos por `requireAdminAuth` (exceto `auth.js`, montado antes do guard); `requirements` de cliente usam `requireCustomerAuth`.
- `lib/` tem `mail.js` (SMTP Zoho/nodemailer) e `storage.js` (upload de imagens no Cloudflare R2 via S3 SDK; `R2_*` no `.env`, upload em memória no admin). Mercado Pago e frete estão embutidos em `routes/checkout.js` e `routes/api/shipping.js`.
- Frete usa ViaCEP + tabela simulada (não é a API dos Correios ainda).
- Imagens de produto: `Product.images` guarda URLs completas do R2 (`R2_PUBLIC_BASE_URL/produtos/...`); `public/uploads` não é mais usado para novos uploads.
- `migracao/` contém scripts Python que **geram** `categorias.json`/`produtos.json`; não editar os JSONs como fonte.
- `connect-mongo@6` exige a linha de interop no topo de `server.js` (`require('connect-mongo').default || require('connect-mongo')`) — não mexer.
- Model `Product`: `type` só aceita `'produto'` (serviços foram removidos); suporta `variants`, `promoPrice`, `hasVariants`, `barcode`, `specs`, texto-search indexado.

## Backlog / Pendências

- **CSRF origin check:** hoje em `server.js` está `BLOCK_CROSS_ORIGIN = false` (apenas registra em `security_events` no Mongo). Reativar para `true` quando ~1 semana sem eventos "suspeitos" de usuários reais (a lógica já tolera `www`/subdomínio/proxy que reescreve Host). `security_events` só grava em `NODE_ENV=production`.
- **Shop de fabricantes:** ferramenta **manual** implementada (botão em `/admin/imports` + `npm run import-manufacturer`, com `--modelo "X"` para produto sem código no nome) com os importadores **TP-Link** (scraping do site oficial; live) e **Intelbras** (API pública da loja VTEX `intelbras.vtexcommercestable.com.br/api/catalog_system/pub/products/search` + fallback no site institucional via `sitemap.xml`, para produtos fora da loja/descontinuados — foto oficial sem descrição) e **Logitech** (`sitemap.xml` resolve o slug do produto pelo modelo; página pt-BR espelhada via hreflang com `og:description` em português + fotos originais em `resource.logitech.com` sem o prefixo de transform — `og:image` global é ignorada) e **memória/SSD** (ADATA: fotos oficiais no JSON da página Next.js em `webapi3.adata.com`; Patriot: foto oficial no `og:image` do CDN `patriot-cms-media...`). **Sem importador** (informado no relatório): **Kingston** (bloqueia bots, HTTP 403), **Crucial** (fotos só por JS) e **WD Green** (descontinuado, 404). Áudio: **Oneal** (foto oficial do produto nas listagens; modelos descontinuados OB-408/OB-1315R têm só a foto da listagem, sem descrição) e **Kadosh** (WooCommerce oficial da Kadosh Music; sitemap resolve slug por modelo; `og:image` + `og:description` pt-BR; CDN Hostinger responde 429 quando o IP excede rajada de requisições — o importador espera ~6s entre pedidos e faz backoff no 429). `Product.manufacturerRef` guarda modelo/URL/fonte. Para novas marcas: criar importador em `lib/manufacturer/<marca>.js` implementando o contrato `obter(modelo)` → `{ url, nome, descricao, imagemPrincipal, galeria, filtrarPorModelo }` + exportar `HOSTS_IMAGENS`; registrar em `lib/manufacturer/import.js` (`IMPORTADORES`) e, se preciso, estender `detectarMarca`/`extrairModelo`. Decisão de design: dados vindos de fontes oficiais acessíveis via HTTP — TP-Link aceita busca por modelo; Intelbras é via API VTEX (busca no site é JS).