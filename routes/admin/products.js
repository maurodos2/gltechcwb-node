const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Product = require('../../models/Product');
const Category = require('../../models/Category');

// Upload simples de imagens para /public/uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../public/uploads')),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// GET /admin/products - listagem
router.get('/', async (req, res) => {
  const products = await Product.find()
    .populate('category', 'name')
    .sort({ createdAt: -1 });
  res.render('admin/products/list', { products });
});

// GET /admin/products/new - formulário de novo produto
router.get('/new', async (req, res) => {
  const categories = await Category.find({ active: true }).sort({ name: 1 });
  res.render('admin/products/form', { product: null, categories, error: null });
});

// POST /admin/products - criar produto
router.post('/', upload.array('images', 6), async (req, res) => {
  try {
    const { name, sku, barcode, price, promoPrice, stock, category, description, shortDescription, brand, active, type } =
      req.body;

    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);

    await Product.create({
      name,
      slug: slugify(name),
      sku,
      barcode: barcode || null,
      type: 'produto',
      price: Number(price),
      promoPrice: promoPrice ? Number(promoPrice) : null,
      stock: Number(stock) || 0,
      category,
      description,
      shortDescription,
      brand,
      images,
      active: active === 'on',
    });

    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    res.render('admin/products/form', {
      product: req.body,
      categories,
      error: 'Erro ao salvar produto: ' + err.message,
    });
  }
});

// GET /admin/products/:id/edit
router.get('/:id/edit', async (req, res) => {
  const [product, categories] = await Promise.all([
    Product.findById(req.params.id),
    Category.find({ active: true }).sort({ name: 1 }),
  ]);

  if (!product) return res.redirect('/admin/products');
  res.render('admin/products/form', { product, categories, error: null });
});

// PUT /admin/products/:id - atualizar produto
router.put('/:id', upload.array('images', 6), async (req, res) => {
  try {
    const { name, sku, barcode, price, promoPrice, stock, category, description, shortDescription, brand, active, type } =
      req.body;

    const update = {
      name,
      slug: slugify(name),
      sku,
      barcode: barcode || null,
      type: 'produto',
      price: Number(price),
      promoPrice: promoPrice ? Number(promoPrice) : null,
      stock: Number(stock) || 0,
      category,
      description,
      shortDescription,
      brand,
      active: active === 'on',
    };

    if (req.files && req.files.length > 0) {
      update.images = req.files.map((f) => `/uploads/${f.filename}`);
    }

    await Product.findByIdAndUpdate(req.params.id, update);
    res.redirect('/admin/products');
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/products/${req.params.id}/edit`);
  }
});

// DELETE /admin/products/:id
router.delete('/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.redirect('/admin/products');
});

module.exports = router;
