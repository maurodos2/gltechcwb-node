const express = require('express');
const router = express.Router();
const multer = require('multer');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const { uploadImage, deleteImage } = require('../../lib/storage');

// Imagens chegam em memória e são enviadas direto ao Cloudflare R2.
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB por imagem
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE.has(file.mimetype)) return cb(null, true);
    cb(new Error('Formato de imagem inválido. Use JPG, PNG, WebP ou GIF.'));
  },
});

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

    const images = [];
    for (const f of req.files || []) {
      images.push(await uploadImage(f.buffer, f.originalname, f.mimetype));
    }

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
      const images = [];
      for (const f of req.files) {
        images.push(await uploadImage(f.buffer, f.originalname, f.mimetype));
      }
      update.images = images;
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
  try {
    const product = await Product.findById(req.params.id);
    if (product && product.images && product.images.length) {
      for (const img of product.images) {
        try {
          await deleteImage(img);
        } catch (err) {
          console.error('[admin] Erro ao apagar imagem do R2:', err.message);
        }
      }
    }
    await Product.findByIdAndDelete(req.params.id);
  } catch (err) {
    console.error(err);
  }
  res.redirect('/admin/products');
});

// Erros de upload (tipo de arquivo ou tamanho) viram resposta clara em vez do 500 genérico
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /^Formato de imagem/.test(err.message || '')) {
    return res.status(400).send('Falha no upload: ' + err.message);
  }
  next(err);
});

module.exports = router;
