const express = require('express');
const router = express.Router();
const Product = require('../../models/Product');

// GET /api/cart — retorna o carrinho da sessão
router.get('/', (req, res) => {
  const cart = req.session.cart || { items: [] };
  res.json(cart);
});

// POST /api/cart/add — adiciona item ao carrinho
router.post('/add', async (req, res) => {
  try {
    const { productId, variantId, quantity } = req.body;
    const qty = Math.max(1, parseInt(quantity, 10) || 1);

    const product = await Product.findOne({ _id: productId, active: true });
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    if (!req.session.cart) {
      req.session.cart = { items: [] };
    }

    const cart = req.session.cart;

    // Determinar preço e estoque
    let unitPrice;
    let stockAvailable;
    let itemName = product.name;
    let itemSku = product.sku;
    let variantKey = null;

    if (variantId && product.hasVariants) {
      const variant = product.variants.id(variantId);
      if (!variant) return res.status(400).json({ error: 'Variação não encontrada.' });
      unitPrice = variant.promoPrice && variant.promoPrice > 0 ? variant.promoPrice : variant.price;
      stockAvailable = variant.stock;
      itemName = product.name + ' — ' + variant.name;
      itemSku = variant.sku;
      variantKey = String(variantId);
    } else {
      unitPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
      stockAvailable = product.stock;
    }

    // Verificar se já existe no carrinho
    const key = String(productId) + (variantKey ? ':' + variantKey : '');
    const existing = cart.items.find(
      (i) => String(i.productId) + (i.variantId ? ':' + i.variantId : '') === key
    );

    if (existing) {
      const newQty = existing.quantity + qty;
      if (newQty > stockAvailable) {
        return res.status(400).json({ error: 'Estoque insuficiente. Disponível: ' + stockAvailable });
      }
      existing.quantity = newQty;
      existing.unitPrice = unitPrice;
    } else {
      if (qty > stockAvailable) {
        return res.status(400).json({ error: 'Estoque insuficiente. Disponível: ' + stockAvailable });
      }
      cart.items.push({
        productId: String(productId),
        variantId: variantKey || null,
        name: itemName,
        sku: itemSku,
        unitPrice,
        quantity: qty,
        image: product.images && product.images.length ? product.images[0] : null,
      });
    }

    const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    res.json({ success: true, totalItems, cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao adicionar item ao carrinho.' });
  }
});

// POST /api/cart/update — atualiza quantidade de um item
router.post('/update', (req, res) => {
  const { index, quantity } = req.body;
  const cart = req.session.cart;

  if (!cart || !cart.items[index]) {
    return res.status(400).json({ error: 'Item não encontrado no carrinho.' });
  }

  const qty = parseInt(quantity, 10);
  if (qty <= 0) {
    cart.items.splice(index, 1);
  } else {
    cart.items[index].quantity = qty;
  }

  const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  res.json({ success: true, totalItems, cart });
});

// POST /api/cart/remove — remove um item do carrinho
router.post('/remove', (req, res) => {
  const { index } = req.body;
  const cart = req.session.cart;

  if (!cart || !cart.items[index]) {
    return res.status(400).json({ error: 'Item não encontrado no carrinho.' });
  }

  cart.items.splice(index, 1);
  const totalItems = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  res.json({ success: true, totalItems, cart });
});

// POST /api/cart/clear — esvazia o carrinho
router.post('/clear', (req, res) => {
  req.session.cart = { items: [] };
  res.json({ success: true, totalItems: 0, cart: req.session.cart });
});

module.exports = router;
