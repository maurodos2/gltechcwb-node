const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const seo = require('../lib/seo');

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

    const siteUrl = `${req.protocol}://${req.get('host')}`;
    const { effectivePrice, minVariantPrice, formatPrice } = req.app.locals;
    const withPrice = (p) => {
      const price = p.hasVariants ? minVariantPrice(p) : effectivePrice(p);
      const inStock = p.onDemand
        ? true
        : !p.hasVariants
          ? p.stock > 0
          : p.variants.some((v) => v.stock > 0);
      return { ...p.toObject ? p.toObject() : p, __price: price, __inStock: inStock, __priceFormatted: price != null ? formatPrice(price) : null };
    };

    res.render('shop/index', {
      title: '',
      categories,
      featured,
      latest: newest,
      productCount,
      categoryCount: categories.length,
      metaDescription: 'Loja de informática em Curitiba. Hardware, periféricos, componentes e acessórios com preço justo, garantia e envio para todo o Brasil. Compre em até 12x.',
      ldHomeJson: JSON.stringify(seo.homeJsonLd({
        siteUrl,
        phone: res.locals.contactPhone || process.env.CONTACT_PHONE || '',
        email: process.env.CONTACT_EMAIL || '',
        storeLocal: res.locals.storeLocal,
        featured: featured.map(withPrice),
        latest: newest.map(withPrice),
      })),
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

    const { effectivePrice, minVariantPrice, formatPrice } = req.app.locals;
    const pageUrl = `${req.protocol}://${req.get('host')}${req.path}`;
    const inStock = product.onDemand
      ? true
      : !product.hasVariants
        ? product.stock > 0
        : product.variants.some((v) => v.stock > 0);
    const price = product.hasVariants
      ? minVariantPrice(product)
      : effectivePrice(product);

    const ldJson = JSON.stringify(
      seo.productJsonLd(product, { price, pageUrl, inStock })
    );

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
    const crumbsJson = JSON.stringify(seo.breadcrumbJsonLd(crumbs));

    const metaDescription =
      product.seoDescription ||
      product.shortDescription ||
      seo.productMetaDescription(product, { price, formatPrice });

    res.render('shop/product', {
      title: product.seoTitle || product.name,
      canonicalUrl: pageUrl,
      metaDescription,
      product,
      related,
      ldJson,
      crumbsJson,
    });
  } catch (err) {
    next(err);
  }
});


// GET /contato — NAP completo + mapa + horário (SEO local; mantém consistência
// com o JSON-LD ElectronicsStore da home e com o Google Business Profile).
router.get('/contato', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  const local = res.locals.storeLocal || {};
  const q = encodeURIComponent(
    [local.street, local.neighborhood, local.city, local.state].filter(Boolean).join(', ')
  );
  const hasGeo = local.geoLat && local.geoLng;
  const mapsUrl = hasGeo
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${local.geoLat},${local.geoLng}`)}&hl=pt-BR`
    : `https://www.google.com/maps/search/?api=1&query=${q}&hl=pt-BR`;
  const mapsEmbed = hasGeo
    ? `https://maps.google.com/maps?q=${encodeURIComponent(`${local.geoLat},${local.geoLng}`)}&z=16&output=embed&hl=pt-BR`
    : `https://maps.google.com/maps?q=${q}&z=16&output=embed&hl=pt-BR`;

  res.render('shop/contact', {
    title: 'Contato',
    metaDescription: seo.contactMetaDescription({
      phone: res.locals.contactPhone || '',
      email: process.env.CONTACT_EMAIL || '',
    }),
    contactJsonLd: JSON.stringify(seo.contactJsonLd({
      siteUrl: `${base}/`,
      phone: res.locals.contactPhone || '',
      email: process.env.CONTACT_EMAIL || '',
      storeLocal: local,
    })),
    mapsUrl,
    mapsEmbed,
  });
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

  const metaDescription = (pageDescription && pageDescription.length >= 60)
    ? pageDescription
    : seo.catalogMetaDescription({
        categoryName: currentCategory ? currentCategory.name : '',
        total,
        q,
      });

  res.render('shop/catalog', {
    title: pageTitle,
    canonicalUrl: `${req.protocol}://${req.get('host')}${baseUrl}${q ? `?q=${encodeURIComponent(q)}` : ''}`,
    metaDescription,
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
