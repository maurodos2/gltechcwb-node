const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const { requireCustomerAuth } = require('../middleware/auth');

// GET /checkout — página de checkout
router.get('/', requireCustomerAuth, async (req, res) => {
  const cart = req.session.cart;
  if (!cart || !cart.items || !cart.items.length) {
    return res.redirect('/carrinho');
  }

  const Customer = require('../models/Customer');
  const customer = await Customer.findById(req.session.customerId);

  res.render('shop/checkout', {
    title: 'Finalizar compra',
    cart,
    customer,
    shipping: req.session.shipping || null,
  });
});

// POST /checkout/frete — calcular e salvar frete
router.post('/frete', requireCustomerAuth, async (req, res) => {
  const { zipCode } = req.body;
  if (!zipCode) return res.redirect('/checkout');

  try {
    const axios = require('axios');
    const cep = zipCode.replace(/\D/g, '');

    const viaCepRes = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
    const cepData = viaCepRes.data;

    if (cepData.erro) {
      return res.render('shop/checkout', {
        title: 'Finalizar compra',
        cart: req.session.cart,
        customer: await require('../models/Customer').findById(req.session.customerId),
        shipping: null,
        error: 'CEP não encontrado.',
      });
    }

    const cart = req.session.cart;
    const totalValue = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const totalWeight = cart.items.reduce((sum, item) => sum + (item.weightKg || 0.5) * item.quantity, 0);
    const weight = Math.max(0.3, totalWeight);

    const baseRegion = getRegion(cepData.uf);
    const baseCost = { sul: 15, sudeste: 12, centroOeste: 18, norte: 25, nordeste: 22 };
    let shippingCost = (baseCost[baseRegion] || 15) + (weight * 2);
    const deliveryDays = { sul: 3, sudeste: 4, centroOeste: 5, norte: 7, nordeste: 6 }[baseRegion] || 5;

    if (totalValue >= 300) shippingCost = 0;
    shippingCost = Math.round(shippingCost * 100) / 100;

    req.session.shipping = {
      zipCode: cep,
      street: cepData.logradouro,
      district: cepData.bairro,
      city: cepData.localidade,
      state: cepData.uf,
      cost: shippingCost,
      deliveryDays,
      freeShipping: totalValue >= 300,
    };

    res.redirect('/checkout');
  } catch (err) {
    console.error(err);
    res.redirect('/checkout');
  }
});

// POST /checkout/pay — criar pagamento no Mercado Pago
router.post('/pay', requireCustomerAuth, async (req, res) => {
  try {
    const cart = req.session.cart;
    if (!cart || !cart.items || !cart.items.length) {
      return res.redirect('/carrinho');
    }

    const { paymentMethod, addressId } = req.body;
    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);

    if (!customer) return res.redirect('/conta/login');

    // Determinar endereço de entrega
    let shippingAddress = {};
    if (addressId) {
      const addr = customer.addresses.id(addressId);
      if (addr) {
        shippingAddress = {
          street: addr.street,
          number: addr.number,
          complement: addr.complement,
          district: addr.district,
          city: addr.city,
          state: addr.state,
          zipCode: addr.zipCode,
        };
      }
    } else if (req.session.shipping) {
      shippingAddress = {
        street: req.session.shipping.street,
        district: req.session.shipping.district,
        city: req.session.shipping.city,
        state: req.session.shipping.state,
        zipCode: req.session.shipping.zipCode,
      };
    }

    // Validar estoque antes de criar o pedido
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.redirect('/carrinho?error=produto_nao_encontrado');
      }

      if (item.variantId) {
        const variant = product.variants.id(item.variantId);
        if (!variant || variant.stock < item.quantity) {
          return res.redirect('/carrinho?error=estoque_insuficiente');
        }
      } else {
        if (product.stock < item.quantity) {
          return res.redirect('/carrinho?error=estoque_insuficiente');
        }
      }
    }

    const itemsTotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingCost = req.session.shipping ? req.session.shipping.cost : 0;
    const total = itemsTotal + shippingCost;

    // Criar pedido
    const order = await Order.create({
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      shippingAddress,
      items: cart.items.map((item) => ({
        product: item.productId,
        variantId: item.variantId || null,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      itemsTotal,
      shippingCost,
      total,
      status: 'pending_payment',
      paymentMethod: paymentMethod || 'pix',
    });

    // Decrementar estoque
    for (const item of cart.items) {
      const update = { $inc: { stock: -item.quantity } };
      if (item.variantId) {
        await Product.updateOne(
          { _id: item.productId, 'variants._id': item.variantId },
          { $inc: { 'variants.$.stock': -item.quantity } }
        );
      } else {
        await Product.updateOne({ _id: item.productId }, update);
      }
    }

    // Integração Mercado Pago
    const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const preferenceBody = {
      items: cart.items.map((item) => ({
        title: item.name,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        currency_id: 'BRL',
      })),
      payer: {
        name: customer.name,
        email: customer.email,
      },
      external_reference: String(order._id),
      back_urls: {
        success: `${process.env.SITE_URL || 'http://localhost:3000'}/checkout/sucesso`,
        failure: `${process.env.SITE_URL || 'http://localhost:3000'}/checkout/falha`,
        pending: `${process.env.SITE_URL || 'http://localhost:3000'}/checkout/pendente`,
      },
      auto_return: 'approved',
      notification_url: `${process.env.SITE_URL || 'http://localhost:3000'}/api/webhooks/mercadopago`,
    };

    const result = await preference.create({ body: preferenceBody });

    // Atualizar pedido com referência do gateway
    order.paymentProviderRef = result.id;
    await order.save();

    // Limpar carrinho
    req.session.cart = { items: [] };
    req.session.shipping = null;

    // Redirecionar para checkout do Mercado Pago
    res.redirect(result.init_point);
  } catch (err) {
    console.error('Erro ao criar pagamento:', err);
    res.redirect('/checkout?error=pagamento_erro');
  }
});

// GET /checkout/sucesso — página de sucesso
router.get('/sucesso', (req, res) => {
  res.render('shop/order-success', {
    title: 'Pedido realizado!',
    payment_id: req.query.payment_id,
    status: req.query.status,
  });
});

// GET /checkout/falha — página de falha
router.get('/falha', (req, res) => {
  res.render('shop/order-fail', {
    title: 'Pagamento não realizado',
  });
});

// GET /checkout/pendente — página de pendente
router.get('/pendente', (req, res) => {
  res.render('shop/order-pending', {
    title: 'Pagamento pendente',
  });
});

function getRegion(uf) {
  const regions = {
    sul: ['PR', 'SC', 'RS'],
    sudeste: ['SP', 'RJ', 'MG', 'ES'],
    centroOeste: ['GO', 'MS', 'MT', 'DF'],
    norte: ['AM', 'PA', 'AP', 'RR', 'RO', 'AC', 'TO'],
    nordeste: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'],
  };
  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(uf)) return region;
  }
  return 'sudeste';
}

module.exports = router;
