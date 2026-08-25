const express = require('express');
const router = express.Router();
const Category = require('../../models/Category');

// GET /api/categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ active: true }).sort({ order: 1, name: 1 });
    res.json({ data: categories });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

module.exports = router;
