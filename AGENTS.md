# AGENTS.md

E-commerce `gltechcwb` — Express + MongoDB (Mongoose) + EJS. Storefront pt-BR: loja pública, painel admin, checkout com Mercado Pago (Pix/cartão). **Não há testes, lint nem typecheck** — validação é rodar o servidor e exercitar as rotas.

## Comandos

- `npm run dev` — nodemon em `server.js` (porta 3000).
- `npm run seed` — cria o 1º admin a partir de `SEED_ADMIN_EMAIL/PASSWORD` do `.env` (idempotente). Necessário antes de `/admin` fazer login.
- `npm run import-catalog -- migracao/categorias.json migracao/produtos.json` — upsert idempotente de catálogo por `slug` (categoria) e `sku` (produto). Hardcoda `type: 'produto'`.
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