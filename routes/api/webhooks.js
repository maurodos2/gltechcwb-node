const express = require('express');
const router = express.Router();
const Order = require('../../models/Order');
const { WebhookSignatureValidator, InvalidWebhookSignatureError } = require('mercadopago');

// POST /api/webhooks/mercadopago — notificação do Mercado Pago
router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;

    // Valida a origem da notificação via assinatura HMAC (header x-signature).
    // O secret deve ser o gerado pelo painel (Suas integrações > Webhooks).
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) {
      try {
        WebhookSignatureValidator.validate({
          xSignature: req.headers['x-signature'],
          xRequestId: req.headers['x-request-id'],
          dataId: req.query['data.id'],
          secret,
          toleranceSeconds: 300,
        });
      } catch (sigErr) {
        if (sigErr instanceof InvalidWebhookSignatureError) {
          console.error('[webhook] Assinatura inválida:', sigErr.reason);
          return res.status(401).send('Assinatura inválida.');
        }
        throw sigErr;
      }
    } else {
      console.warn('[webhook] WEBHOOK_SECRET não configurado; notificação aceita sem validação de assinatura.');
    }

    if (type === 'payment') {
      const paymentId = data?.id;

      if (paymentId) {
        // Buscar detalhes do pagamento no Mercado Pago
        const { MercadoPagoConfig, Payment } = require('mercadopago');
        const client = new MercadoPagoConfig({
          accessToken: process.env.MP_ACCESS_TOKEN,
        });

        const payment = new Payment(client);
        const paymentData = await payment.get({ id: paymentId });

        const orderId = paymentData.external_reference;
        if (orderId) {
          const order = await Order.findById(orderId);
          if (order) {
            order.paymentProviderRef = String(paymentId);

            if (paymentData.status === 'approved') {
              order.status = 'paid';
            } else if (paymentData.status === 'pending') {
              order.status = 'pending_payment';
            } else if (paymentData.status === 'rejected') {
              order.status = 'cancelled';
            } else if (paymentData.status === 'refunded') {
              order.status = 'cancelled';
            }

            await order.save();

            // Enviar e-mail de confirmação (quando pagamento aprovado)
            if (order.status === 'paid') {
              try {
                const mailService = require('../../../lib/mail');
                await mailService.sendOrderConfirmation(order);
              } catch (mailErr) {
                console.error('Erro ao enviar e-mail:', mailErr);
              }
            }
          }
        }
      }
    }

    // Sempre retornar 200 para o Mercado Pago não tentar novamente
    res.status(200).send('OK');
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.status(200).send('OK');
  }
});

module.exports = router;
