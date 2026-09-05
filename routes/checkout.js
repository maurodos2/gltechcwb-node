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
    const { MercadoPagoConfig, Preference } = require('mercadopago');

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';
    const successUrl = `${siteUrl}/checkout/sucesso`;

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
        success: successUrl,
        failure: `${siteUrl}/checkout/falha`,
        pending: `${siteUrl}/checkout/pendente`,
      },
      // O MP só aceita auto_return quando o back_url de sucesso é https
      auto_return: successUrl.startsWith('https://') ? 'approved' : undefined,
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
    };

    let paymentRef;
    let initPoint;
    try {
      const result = await preference.create({ body: preferenceBody });
      paymentRef = result.id;
      initPoint = result.init_point;
    } catch (prefErr) {
      console.error('Erro ao criar pagamento no Mercado Pago:', prefErr.message);

      // Reverte o pedido e o estoque para não deixar pedido órfão
      await Order.findByIdAndDelete(order._id);
      for (const item of cart.items) {
        if (item.variantId) {
          await Product.updateOne(
            { _id: item.productId, 'variants._id': item.variantId },
            { $inc: { 'variants.$.stock': item.quantity } }
          );
        } else {
          await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
        }
      }

      return res.redirect('/checkout?error=pagamento_erro');
    }

    // Atualizar pedido com referência do gateway
    order.paymentProviderRef = paymentRef;
    await order.save();

    // Limpar carrinho
    req.session.cart = { items: [] };
    req.session.shipping = null;

    // Redirecionar para checkout do Mercado Pago
    res.redirect(initPoint);
  } catch (err) {
    console.error('Erro ao criar pagamento:', err);
    res.redirect('/checkout?error=pagamento_erro');
  }
});

// POST /checkout/pix — gerar QR Code Pix direto na loja
router.post('/pix', requireCustomerAuth, async (req, res) => {
  try {
    const cart = req.session.cart;
    if (!cart || !cart.items || !cart.items.length) {
      return res.json({ success: false, message: 'Carrinho vazio.' });
    }

    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) {
      return res.json({ success: false, message: 'Faça login para continuar.' });
    }

    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.json({ success: false, message: 'Produto não encontrado.' });
      }
      if (item.variantId) {
        const variant = product.variants.id(item.variantId);
        if (!variant || variant.stock < item.quantity) {
          return res.json({ success: false, message: 'Estoque insuficiente.' });
        }
      } else if (product.stock < item.quantity) {
        return res.json({ success: false, message: 'Estoque insuficiente.' });
      }
    }

    const itemsTotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingCost = req.session.shipping ? req.session.shipping.cost : 0;
    const total = Math.round((itemsTotal + shippingCost) * 100) / 100;

    let shippingAddress = {};
    if (req.session.shipping) {
      shippingAddress = {
        street: req.session.shipping.street,
        district: req.session.shipping.district,
        city: req.session.shipping.city,
        state: req.session.shipping.state,
        zipCode: req.session.shipping.zipCode,
      };
    }

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
      paymentMethod: 'pix',
    });

    await decrementStock(cart);

    const { MercadoPagoConfig, Payment } = require('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const payment = new Payment(client);

    const siteUrl = process.env.SITE_URL || 'http://localhost:3000';

    let paymentResult;
    try {
      paymentResult = await payment.create({
        body: {
          transaction_amount: total,
          description: `Pedido ${String(order._id).slice(-8).toUpperCase()} - GLTechCWB`,
          payment_method_id: 'pix',
          payer: { email: customer.email },
          external_reference: String(order._id),
          notification_url: `${siteUrl}/api/webhooks/mercadopago`,
        },
      });
      order.paymentProviderRef = String(paymentResult.id);
      await order.save();
    } catch (payErr) {
      console.error('[checkout] Erro ao gerar Pix:', payErr.message);
      await Order.findByIdAndDelete(order._id);
      await restoreStock(cart);
      return res.json({ success: false, message: 'Não foi possível gerar o Pix. Tente novamente.' });
    }

    const txData =
      (paymentResult.point_of_interaction && paymentResult.point_of_interaction.transaction_data) || {};
    const qrBase64 = txData.qr_code_base64 || paymentResult.qr_code_base64 || '';
    const qrText = txData.qr_code || paymentResult.qr_code || '';

    req.session.cart = { items: [] };
    req.session.shipping = null;

    return res.json({
      success: true,
      status: paymentResult.status,
      paymentId: String(paymentResult.id),
      expiresAt: paymentResult.date_of_expiration || null,
      orderId: String(order._id),
      qrBase64,
      qrText,
    });
  } catch (err) {
    console.error('[checkout] Erro ao gerar Pix:', err.message);
    res.json({ success: false, message: 'Erro interno ao gerar o Pix.' });
  }
});

// GET /checkout/pix-status — verifica se o Pix foi pago (usada pela loja)
router.get('/pix-status', requireCustomerAuth, async (req, res) => {
  const { paymentId } = req.query;
  if (!paymentId) {
    return res.json({ paid: false });
  }
  const order = await Order.findOne({ paymentProviderRef: String(paymentId) });
  res.json({
    paid: !!(order && order.status === 'paid'),
    status: order ? order.status : 'not_found',
  });
});

// POST /checkout/pay-card — pagamento com cartão dentro da própria loja (Checkout Bricks)
router.post('/pay-card', requireCustomerAuth, async (req, res) => {
  try {
    const cart = req.session.cart;
    if (!cart || !cart.items || !cart.items.length) {
      return res.json({ success: false, message: 'Carrinho vazio.' });
    }

    const { token, installments } = req.body;
    if (!token) {
      return res.json({ success: false, message: 'Token de pagamento ausente.' });
    }

    const Customer = require('../models/Customer');
    const customer = await Customer.findById(req.session.customerId);
    if (!customer) {
      return res.json({ success: false, message: 'Faça login para continuar.' });
    }

    // Validar estoque antes de criar o pedido
    for (const item of cart.items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.json({ success: false, message: 'Produto não encontrado.' });
      }
      if (item.variantId) {
        const variant = product.variants.id(item.variantId);
        if (!variant || variant.stock < item.quantity) {
          return res.json({ success: false, message: 'Estoque insuficiente.' });
        }
      } else if (product.stock < item.quantity) {
        return res.json({ success: false, message: 'Estoque insuficiente.' });
      }
    }

    const itemsTotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const shippingCost = req.session.shipping ? req.session.shipping.cost : 0;
    const total = itemsTotal + shippingCost;

    let shippingAddress = {};
    if (req.session.shipping) {
      shippingAddress = {
        street: req.session.shipping.street,
        district: req.session.shipping.district,
        city: req.session.shipping.city,
        state: req.session.shipping.state,
        zipCode: req.session.shipping.zipCode,
      };
    }

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
      paymentMethod: 'credit_card',
    });

    // Decrementar estoque (será revertido se o pagamento falhar)
    await decrementStock(cart);

    // Processar pagamento no Mercado Pago
    const { MercadoPagoConfig, Payment } = require('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
    const payment = new Payment(client);

    let paymentResult;
    try {
      paymentResult = await payment.create({
        body: {
          transaction_amount: total,
          description: `Pedido ${String(order._id).slice(-8).toUpperCase()} - GLTechCWB`,
          installments: Number(installments) || 1,
          token,
          payer: { email: customer.email },
          external_reference: String(order._id),
        },
      });
      order.paymentProviderRef = String(paymentResult.id);
    } catch (payErr) {
      console.error('[checkout] Erro ao processar cartão:', payErr.message);
      await Order.findByIdAndDelete(order._id);
      await restoreStock(cart);
      return res.json({ success: false, message: 'Não foi possível processar o cartão. Tente novamente.' });
    }

    if (paymentResult.status === 'approved') {
      order.status = 'paid';
    } else if (paymentResult.status === 'rejected') {
      order.status = 'cancelled';
    }
    await order.save();

    req.session.cart = { items: [] };
    req.session.shipping = null;

    if (order.status === 'paid') {
      try {
        const { sendOrderConfirmation } = require('../../lib/mail');
        await sendOrderConfirmation(order);
      } catch (mailErr) {
        console.error('[checkout] Erro ao enviar e-mail pós-cartão:', mailErr.message);
      }
    }

    if (order.status === 'paid' || order.status === 'pending_payment') {
      return res.json({ success: true, status: order.status, redirect: '/checkout/sucesso' });
    }

    return res.json({ success: false, message: 'Pagamento não aprovado. Tente novamente.' });
  } catch (err) {
    console.error('[checkout] Erro em pay-card:', err.message);
    res.json({ success: false, message: 'Erro interno ao processar pagamento.' });
  }
});

// GET /checkout/sucesso — página de sucesso + atualização do pedido
router.get('/sucesso', async (req, res) => {
  const { payment_id } = req.query;

  // Ao retornar do Mercado Pago, verifica o status do pagamento e atualiza o pedido.
  if (payment_id) {
    try {
      const { MercadoPagoConfig, Payment } = require('mercadopago');
      const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const payment = new Payment(client);
      const data = await payment.get({ id: payment_id });

      const orderId = data.external_reference;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.status === 'pending_payment') {
          if (data.status === 'approved') {
            order.status = 'paid';
          } else if (data.status === 'cancelled' || data.status === 'rejected') {
            order.status = 'cancelled';
          }
          order.paymentProviderRef = String(payment_id);
          await order.save();

          if (order.status === 'paid') {
            try {
              const { sendOrderConfirmation } = require('../../lib/mail');
              await sendOrderConfirmation(order);
            } catch (mailErr) {
              console.error('[checkout] Erro ao enviar e-mail pós-pagamento:', mailErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[checkout] Erro ao verificar pagamento no retorno:', err.message);
    }
  }

  res.render('shop/order-success', {
    title: 'Pedido realizado!',
    payment_id: payment_id || null,
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

async function decrementStock(cart) {
  for (const item of cart.items) {
    if (item.variantId) {
      await Product.updateOne(
        { _id: item.productId, 'variants._id': item.variantId },
        { $inc: { 'variants.$.stock': -item.quantity } }
      );
    } else {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: -item.quantity } });
    }
  }
}

async function restoreStock(cart) {
  for (const item of cart.items) {
    if (item.variantId) {
      await Product.updateOne(
        { _id: item.productId, 'variants._id': item.variantId },
        { $inc: { 'variants.$.stock': item.quantity } }
      );
    } else {
      await Product.updateOne({ _id: item.productId }, { $inc: { stock: item.quantity } });
    }
  }
}

module.exports = router;
