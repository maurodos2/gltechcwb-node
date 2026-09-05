const Product = require('../models/Product');

async function decrementStockForOrder(order) {
  for (const item of order.items) {
    if (item.variantId) {
      const r = await Product.updateOne(
        { _id: item.product, 'variants._id': item.variantId, 'variants.stock': { $gte: item.quantity } },
        { $inc: { 'variants.$.stock': -item.quantity } }
      );
      if (r.modifiedCount === 0) {
        console.error('[estoque] Variante sem estoque suficiente:', item.name);
      }
    } else {
      const r = await Product.updateOne(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } }
      );
      if (r.modifiedCount === 0) {
        console.error('[estoque] Produto sem estoque suficiente:', item.name);
      }
    }
  }
}

async function restoreStockForOrder(order) {
  for (const item of order.items) {
    if (item.variantId) {
      await Product.updateOne(
        { _id: item.product, 'variants._id': item.variantId },
        { $inc: { 'variants.$.stock': item.quantity } }
      );
    } else {
      await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } });
    }
  }
}

module.exports = { decrementStockForOrder, restoreStockForOrder };