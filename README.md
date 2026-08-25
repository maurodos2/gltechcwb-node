# GLTechCWB — Esqueleto Node.js

Esqueleto inicial para migrar a loja `gltechcwb.com` do Zoho Commerce para uma
stack própria: **Node.js + Express + MongoDB + EJS**, com painel admin básico.

## O que já está pronto

- **Modelos de dados** (`/models`): `Product` (com suporte a variações e specs
  livres), `Category`, `Admin` (autenticação do painel), `Order` (estrutura
  para quando o checkout for implementado).
- **API pública somente leitura** (`/routes/api`): `GET /api/products`,
  `GET /api/products/:slug`, `GET /api/categories` — para o futuro front-end
  público consumir.
- **Painel admin** (`/routes/admin` + `/views/admin`): login com sessão,
  dashboard com contadores e alerta de estoque baixo, CRUD completo de
  produtos (com upload de imagens) e categorias.
- **Autenticação simples por sessão**, senha com hash `bcrypt`, sessão
  persistida no MongoDB (`connect-mongo`).

## O que ainda falta (próximas etapas)

- Front-end público (vitrine, página de produto, carrinho, checkout).
- Integração de pagamento (Pix/cartão) — Mercado Pago, Pagar.me etc.
- Envio de e-mail transacional (confirmação de pedido).
- Migração de conteúdo real do Zoho (se houver produtos/páginas já
  cadastrados de verdade — hoje o site está com conteúdo de template).
- Deploy (Railway/Render/VPS) + apontamento de DNS no Cloudflare.

## Catálogo migrado do Zoho

A pasta `migracao/` contém o catálogo real extraído do Zoho
(`RelatorioListaPrecos.xlsm`, relatório de lista de preços): **120 itens**
(87 produtos físicos + 33 serviços técnicos), originalmente espalhados em
23 categorias no Zoho e consolidados aqui em **11 categorias** (10 de
produto + "Serviços Técnicos").

- `categorias.json` / `produtos.json` — dados já tratados, prontos para
  importar no MongoDB.
- `gerar_catalogo_json.py` — script que gerou esses JSONs a partir da
  planilha original (útil se precisar reprocessar com um relatório mais
  recente do Zoho).
- `mapeamento_categorias.py` — regra de consolidação: qual categoria do
  Zoho virou qual categoria nova. Editável se quiser reorganizar antes de
  reimportar.

**Pontos que precisam de revisão manual antes (ou depois) de importar:**
- `stock` de cada produto veio com valor **placeholder (10 unidades)** —
  o relatório de origem não trazia estoque real, apenas preço. Ajuste
  pelo painel admin depois de importar.
- `barcode` só foi preenchido quando havia um código de barras real (EAN);
  os 76 itens que só tinham o código genérico gerado pelo próprio Zoho
  ficaram com `barcode: null`.
- Os SKUs foram gerados automaticamente (ex: `PER-0007`) — troque pelos
  seus códigos internos se já tiver um padrão.

### Importar o catálogo

```bash
npm install
cp .env.example .env   # preencha MONGO_URI etc.
npm run seed            # cria o admin e (se quiser pular) categorias de exemplo
npm run import-catalog -- migracao/categorias.json migracao/produtos.json
```

O import é feito por **upsert** (por slug de categoria e SKU de produto):
rodar de novo não duplica nada, só atualiza.

## Como rodar localmente

### 1. Pré-requisitos
- Node.js 18+
- MongoDB rodando localmente, ou uma string de conexão do MongoDB Atlas
  (camada gratuita serve para começar).

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edite o `.env` e preencha `MONGO_URI`, `SESSION_SECRET`,
`SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`.

### 4. Criar o primeiro admin e categorias de exemplo
```bash
npm run seed
```

### 5. Rodar o servidor
```bash
npm run dev
```
Acesse:
- Painel admin: http://localhost:3000/admin
- API de produtos: http://localhost:3000/api/products

## Estrutura de pastas

```
config/       conexão com o banco e script de seed
middleware/   autenticação do admin
models/       schemas do MongoDB (Mongoose)
routes/
  admin/      rotas do painel (login, produtos, categorias, dashboard)
  api/        rotas públicas somente leitura, para o front-end consumir
views/
  admin/      telas EJS do painel administrativo
public/       CSS, JS estático e uploads de imagem
server.js     ponto de entrada da aplicação
```

## Notas de arquitetura

- O painel admin usa **EJS server-rendered** por simplicidade — sem build
  step, fácil de manter sozinho. Se no futuro quiser um admin mais rico
  (SPA), dá para trocar só as views mantendo a API de baixo intacta.
- Uploads de imagem vão para `public/uploads` em disco. Isso funciona bem
  em VPS com disco persistente; se for hospedar em ambiente serverless
  (ex: Vercel, Cloudflare Workers), será necessário trocar para um bucket
  externo (S3, Cloudflare R2 etc.) antes do deploy.
- `Product.hasVariants` + `Product.variants[]` permite modelar produtos com
  variações (ex: SSD 240GB/480GB) sem duplicar produto — o preço/estoque
  "base" do produto é usado apenas quando ele NÃO tem variações.
