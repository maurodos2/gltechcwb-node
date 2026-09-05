const express = require('express');
const router = express.Router();
const Order = require('../../models/Order');

// GET /admin/orders — listagem de pedidos
router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 20;

  const [orders, total] = await Promise.all([
    Order.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage),
    Order.countDocuments(),
  ]);

  res.render('admin/orders/list', {
    orders,
    cleaned: req.query.cleaned !== undefined ? Number(req.query.cleaned) : null,
    pagination: {
      total,
      page,
      pages: Math.ceil(total / perPage),
    },
  });
});

// POST /admin/orders/clean — excluir pedidos não concluídos (aguardando pagamento/cancelados)
router.post('/clean', async (req, res) => {
  const result = await Order.deleteMany({ status: { $in: ['pending_payment', 'cancelled'] } });
  res.redirect('/admin/orders?cleaned=' + result.deletedCount);
});

// GET /admin/orders/:id — detalhe do pedido
router.get('/:id', async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.redirect('/admin/orders');
  res.render('admin/orders/detail', { order });
});

// POST /admin/orders/:id/status — atualizar status
router.post('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) return res.redirect('/admin/orders/' + req.params.id);

  await Order.findByIdAndUpdate(req.params.id, { status });
  res.redirect('/admin/orders/' + req.params.id);
});

module.exports = router;
