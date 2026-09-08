const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

const PER_PAGE = 12;

// Redirecionamentos 301 de URLs do site antigo (removido) para as páginas atuais.
const LEGACY_REDIRECTS = [
  { from: '/index.html', to: '/' },
  { from: '/home', to: '/' },
  { from: '/loja', to: '/produtos' },
];
LEGACY_REDIRECTS.forEach(({ from, to }) => {
  router.get(from, (req, res) => res.redirect(301, to));
});
// /Sobre-Nós (e variantes sem acento/maísculas) — regex casa também a forma
// percent-encodada que o Google envia (Express compara o path em bruto).
router.get(/^\/Sobre-N/i, (req, res) => res.redirect(301, '/'));

const SORTS = {
  recentes: { createdAt: -1 },
  'nome-asc': { name: 1 },
  'preco-asc': { price: 1 },
  'preco-desc': { price: -1 },
};

router.get('/', async (req, res, next) => {
  try {
    const [categories, featured, latest, productCount] = await Promise.all([
      Category.find({ active: true }).sort({ order: 1, name: 1 }),
      Product.find({ active: true, featured: true })
        .populate('category', 'name slug')
        .limit(8),
      Product.countDocuments({ active: true }),
    ]);

    const featuredIds = featured.map((p) => p._id);
    const remaining = Math.max(0, 8 - featured.length);
    const newest = await Product.find({ active: true, _id: { $nin: featuredIds } })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .limit(remaining);

    res.render('shop/index', {
      title: '',
      categories,
      featured,
      latest: newest,
      productCount,
      categoryCount: categories.length,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [categories, products] = await Promise.all([
      Category.find({ active: true }).select('slug updatedAt'),
      Product.find({ active: true }).select('slug updatedAt'),
    ]);

    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const lastmod = (d) => (d && typeof d.toISOString === 'function' ? d.toISOString().slice(0, 10) : '');
    const urlEntries = [
      { loc: `${siteUrl}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${siteUrl}/produtos`, changefreq: 'daily', priority: '0.9' },
      ...categories.map((c) => ({
        loc: `${siteUrl}/categoria/${c.slug}`,
        lastmod: lastmod(c.updatedAt),
        changefreq: 'weekly',
        priority: '0.8',
      })),
      ...products.map((p) => ({
        loc: `${siteUrl}/produto/${p.slug}`,
        lastmod: lastmod(p.updatedAt),
        changefreq: 'weekly',
        priority: '0.7',
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries
      .map((u) => {
        let entry = `  <url>\n    <loc>${u.loc}</loc>\n`;
        if (u.lastmod) entry += `    <lastmod>${u.lastmod}</lastmod>\n`;
        entry += `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`;
        return entry;
      })
      .join('\n')}\n</urlset>`;

    res.type('application/xml').send(xml);
  } catch (err) {
    next(err);
  }
});

router.get('/produtos', async (req, res, next) => {
  try {
    const rendered = await renderCatalog(req, res, null);
    if (!rendered) next();
  } catch (err) {
    next(err);
  }
});

router.get('/categoria/:slug', async (req, res, next) => {
  try {
    const rendered = await renderCatalog(req, res, req.params.slug);
    if (!rendered) next();
  } catch (err) {
    next(err);
  }
});

router.get('/produto/:slug', async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, active: true }).populate(
      'category',
      'name slug'
    );

    if (!product) return next();

    const related = await Product.find({
      active: true,
      category: product.category ? product.category._id : null,
      _id: { $ne: product._id },
    })
      .populate('category', 'name slug')
      .sort({ createdAt: -1 })
      .limit(4);

    const { effectivePrice, minVariantPrice } = req.app.locals;
    const pageUrl = `${req.protocol}://${req.get('host')}${req.path}`;
    const inStock = !product.hasVariants
      ? product.stock > 0
      : product.variants.some((v) => v.stock > 0);
    const price = product.hasVariants
      ? minVariantPrice(product)
      : effectivePrice(product);

    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.shortDescription || product.seoDescription || product.name,
      sku: product.sku,
      offers: {
        '@type': 'Offer',
        url: pageUrl,
        priceCurrency: 'BRL',
        price,
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      },
    };
    if (product.brand) ld.brand = { '@type': 'Brand', name: product.brand };
    if (product.images && product.images.length) ld.image = product.images[0];

    const crumbs = [
      { position: 1, name: 'Início', item: pageUrl.split('/produto')[0] + '/' },
      { position: 2, name: 'Produtos', item: `${pageUrl.split('/produto')[0]}/produtos` },
    ];
    if (product.category) {
      crumbs.push({
        position: 3,
        name: product.category.name,
        item: `${pageUrl.split('/produto')[0]}/categoria/${product.category.slug}`,
      });
    }
    crumbs.push({ position: crumbs.length + 1, name: product.name, item: pageUrl });
    const crumbsJson = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c) => ({
        '@type': 'ListItem',
        position: c.position,
        name: c.name,
        item: c.item,
      })),
    });

    res.render('shop/product', {
      title: product.seoTitle || product.name,
      product,
      related,
      ldJson: JSON.stringify(ld),
      crumbsJson,
    });
  } catch (err) {
    next(err);
  }
});

// GET /carrinho — página do carrinho
router.get('/carrinho', (req, res) => {
  const cart = req.session.cart || { items: [] };
  res.render('shop/cart', {
    title: 'Carrinho de compras',
    cart,
  });
});

async function renderCatalog(req, res, categorySlug) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const sortKey = SORTS[req.query.ordem] ? req.query.ordem : 'recentes';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  let currentCategory = null;
  const filter = { active: true };

  if (categorySlug) {
    currentCategory = await Category.findOne({ slug: categorySlug, active: true });
    if (!currentCategory) {
      res.status(404);
      return false;
    }
    filter.category = currentCategory._id;
  }

  if (q) {
    filter.$text = { $search: q };
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate('category', 'name slug')
      .sort(SORTS[sortKey])
      .skip((page - 1) * PER_PAGE)
      .limit(PER_PAGE),
    Product.countDocuments(filter),
  ]);

  let pageTitle;
  let pageDescription;
  if (currentCategory) {
    pageTitle = currentCategory.name;
    pageDescription = currentCategory.description;
  } else if (q) {
    pageTitle = `Resultados para "${q}"`;
    pageDescription = '';
  } else {
    pageTitle = 'Todos os produtos';
    pageDescription = 'Confira o catálogo completo da GLTechCWB.';
  }

  const baseUrl = currentCategory ? `/categoria/${currentCategory.slug}` : '/produtos';

  res.render('shop/catalog', {
    title: pageTitle,
    metaDescription: pageDescription || undefined,
    navActive: 'catalog',
    searchValue: q,
    categories: res.locals.navCategories || [],
    currentCategory,
    pageTitle,
    pageDescription,
    products,
    q,
    sortKey,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / PER_PAGE),
    },
    baseUrl,
  });

  return true;
}

module.exports = router;
