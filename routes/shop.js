const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');

const PER_PAGE = 12;

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

    res.render('shop/product', {
      title: product.seoTitle || product.name,
      product,
      related,
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
