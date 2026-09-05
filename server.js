require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo');
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
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny', index: false }));

// Verificação de origem (CSRF ativo): rejeita POST/PUT/DELETE de fora do próprio domínio.
// Webhooks do Mercado Pago (HTTP POST sem Origin de verificação) ficam de fora.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/webhooks')) return next();
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const origin = req.headers.origin || req.headers.referer;
    if (origin) {
      try {
        const hostname = new URL(origin).hostname;
        const host = req.get('host').split(':')[0];
        if (hostname === host) return next();
      } catch (e) {
        /* origem malformada é ignorada */
      }
      return res.status(403).send('Requisição rejeitada.');
    }
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

// Rate limit para login (admin e cliente) contra força bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 tentativas por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
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

// ---- 404 ----
app.use((req, res) => {
  res.status(404).send('Página não encontrada.');
});

// ---- Erros não tratados ----
app.use((err, req, res, next) => {
  console.error('[server] Erro:', err);
  if (res.headersSent) return next(err);
  res.status(500).send('Erro interno do servidor.');
});

// ---- Inicialização ----
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] Rodando em http://localhost:${PORT}`);
  });
});
