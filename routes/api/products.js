const express = require('express');
const router = express.Router();
const Product = require('../../models/Product');

// GET /api/products?category=slug&q=texto&page=1&limit=20
router.get('/', async (req, res) => {
  try {
    const { category, q, page = 1, limit = 20 } = req.query;
    const filter = { active: true };

    if (category) {
      const Category = require('../../models/Category');
      const cat = await Category.findOne({ slug: category });
      if (cat) filter.category = cat._id;
    }

    if (q) {
      filter.$text = { $search: q };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Product.countDocuments(filter),
    ]);

    res.json({
      data: products,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, active: true }).populate(
      'category',
      'name slug'
    );

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

module.exports = router;
