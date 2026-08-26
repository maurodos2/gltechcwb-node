# GLTechCWB — E-Commerce

Loja virtual GLTechCWB: **Node.js + Express + MongoDB + EJS**, com painel admin, carrinho, checkout e pagamento via Mercado Pago.

## Funcionalidades

- **Catálogo de produtos** — busca, filtros, paginação, variações e promoções
- **Carrinho de compras** — sessão do cliente, adicionar/remover/atualizar quantidades
- **Checkout** — cadastro do cliente, cálculo de frete (ViaCEP/Correios), pagamento (Pix + Cartão via Mercado Pago)
- **Painel admin** — CRUD de produtos/categorias, gestão de pedidos, dashboard
- **E-mails transacionais** — confirmação de pedido via Zoho Mail SMTP

## O que ainda falta

- Deploy (Render) + apontamento de DNS no Cloudflare
- Otimização de imagens para produção (S3/R2)

## Como rodar localmente

### 1. Pré-requisitos
- Node.js 18+
- MongoDB rodando localmente, ou uma string de conexão do MongoDB Atlas

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
cp .env.example .env
```
Edite o `.env` e preencha `MONGO_URI`, `SESSION_SECRET`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`,
`SMTP_*` e outras variáveis conforme necessário.

### 4. Criar o primeiro admin
```bash
npm run seed
```

### 5. Importar o catálogo (opcional)
```bash
npm run import-catalog -- migracao/categorias.json migracao/produtos.json
```

### 6. Rodar o servidor
```bash
npm run dev
```
Acesse:
- Loja: http://localhost:3000
- Painel admin: http://localhost:3000/admin
- API de produtos: http://localhost:3000/api/products

## Estrutura de pastas

```
config/       conexão com o banco, seed e importação do catálogo
middleware/   autenticação do admin e do cliente
models/       schemas do MongoDB (Mongoose): Product, Category, Admin, Customer, Order
routes/
  admin/      rotas do painel (login, produtos, categorias, pedidos, dashboard)
  api/        rotas públicas: produtos, categorias, carrinho, frete, webhooks
  shop.js     rotas públicas da loja (vitrine, produto, carrinho, checkout)
views/
  admin/      telas EJS do painel administrativo
  shop/       telas EJS da loja pública
  customer/   telas de login/registro do cliente
  emails/     templates de e-mail transacionais
public/       CSS, JS estático e uploads de imagem
lib/          serviços: Mercado Pago, e-mail (nodemailer), frete
server.js     ponto de entrada da aplicação
```

## Stack técnica

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js >= 18 |
| Framework | Express.js |
| Banco | MongoDB (Atlas ou local) via Mongoose |
| Template Engine | EJS (server-side rendering) |
| Autenticação | express-session + bcryptjs |
| Pagamento | Mercado Pago SDK (Pix + Cartão) |
| E-mail | nodemailer + Zoho Mail SMTP |
| Frete | ViaCEP + API dos Correios |
| Deploy | Render |
| DNS | Cloudflare |
