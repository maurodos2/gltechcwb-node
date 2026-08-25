const express = require('express');
const router = express.Router();
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Order = require('../../models/Order');

// GET /admin
router.get('/', async (req, res) => {
  const [productCount, categoryCount, orderCount, lowStock] = await Promise.all([
    Product.countDocuments(),
    Category.countDocuments(),
    Order.countDocuments(),
    Product.find({ stock: { $lte: 3 }, active: true }).limit(5),
  ]);

  res.render('admin/dashboard', {
    productCount,
    categoryCount,
    orderCount,
    lowStock,
  });
});

module.exports = router;
