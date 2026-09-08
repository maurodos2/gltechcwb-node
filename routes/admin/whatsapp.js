const express = require('express');
const router = express.Router();
const qrcode = require('qrcode');
const service = require('../../lib/whatsapp/service');

// GET /admin/whatsapp — status do bot, QR (quando ainda não vinculado) e envio de teste
router.get('/', async (req, res) => {
  const estado = service.getState();
  let qrDataUrl = null;
  if (estado.qr) {
    try {
      qrDataUrl = await qrcode.toDataURL(estado.qr, { width: 240, margin: 1 });
    } catch (e) {
      qrDataUrl = null;
    }
  }
  const msg = String(req.query.msg || '');

  res.render('admin/whatsapp', {
    estado,
    qrDataUrl,
    habilitado: service.HABILITADO,
    grupo: process.env.WHATSAPP_HANDOFF_GROUP || '',
    msg,
  });
});

// POST /admin/whatsapp/start — inicia/encerra o bot (ativa mesmo sem env=true?) → inicia se desligado
router.post('/start', async (req, res) => {
  await service.init();
  res.redirect('/admin/whatsapp');
});

// POST /admin/whatsapp/logout — desloga e apaga a sessão (novo QR)
router.post('/logout', async (req, res) => {
  await service.logout();
  res.redirect('/admin/whatsapp');
});

// POST /admin/whatsapp/send — mensagem de teste
router.post('/send', async (req, res) => {
  const numero = (req.body.numero || '').replace(/\D/g, '');
  const texto = String(req.body.texto || '').trim();
  let resultado = null;
  if (numero && texto && service.getState().status === 'pronto') {
    try {
      await service.sendMessage(`${numero}@c.us`, texto);
      resultado = { ok: true, msg: 'Mensagem enviada!' };
    } catch (e) {
      resultado = { ok: false, msg: 'Falha: ' + e.message };
    }
  } else {
    resultado = { ok: false, msg: 'Confira número e texto (bot precisa estar conectado).' };
  }
  res.redirect(`/admin/whatsapp?msg=${encodeURIComponent(resultado.msg)}`);
});

module.exports = router;