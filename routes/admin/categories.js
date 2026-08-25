const express = require('express');
const router = express.Router();
const Category = require('../../models/Category');

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// GET /admin/categories
router.get('/', async (req, res) => {
  const categories = await Category.find().sort({ order: 1, name: 1 });
  res.render('admin/categories/list', { categories });
});

// GET /admin/categories/new
router.get('/new', (req, res) => {
  res.render('admin/categories/form', { category: null, error: null });
});

// POST /admin/categories
router.post('/', async (req, res) => {
  try {
    const { name, description, order, active } = req.body;
    await Category.create({
      name,
      slug: slugify(name),
      description,
      order: Number(order) || 0,
      active: active === 'on',
    });
    res.redirect('/admin/categories');
  } catch (err) {
    res.render('admin/categories/form', {
      category: req.body,
      error: 'Erro ao salvar categoria: ' + err.message,
    });
  }
});

// GET /admin/categories/:id/edit
router.get('/:id/edit', async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.redirect('/admin/categories');
  res.render('admin/categories/form', { category, error: null });
});

// PUT /admin/categories/:id
router.put('/:id', async (req, res) => {
  const { name, description, order, active } = req.body;
  await Category.findByIdAndUpdate(req.params.id, {
    name,
    slug: slugify(name),
    description,
    order: Number(order) || 0,
    active: active === 'on',
  });
  res.redirect('/admin/categories');
});

// DELETE /admin/categories/:id
router.delete('/:id', async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.redirect('/admin/categories');
});

module.exports = router;
