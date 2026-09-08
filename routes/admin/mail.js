const express = require('express');
const router = express.Router();
const { sendMail } = require('../../lib/mail');

// GET /admin/mail — formulário para teste de envio via SMTP (Zoho)
router.get('/', (req, res) => {
  const msg = String(req.query.msg || '');
  res.render('admin/mail', {
    msg,
    configurado: !!process.env.SMTP_USER,
    smtpHost: process.env.SMTP_HOST || 'smtp.zoho.com',
    smtpPort: process.env.SMTP_PORT || '465',
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
  });
});

// POST /admin/mail/test — dispara e-mail de teste e retorna ao painel
router.post('/test', async (req, res) => {
  const to = String(req.body.to || '').trim();
  const subject = String(req.body.subject || '').trim() || 'Teste de e-mail — GLTechCWB';
  const mensagem = String(req.body.mensagem || '').trim();

  if (!to) {
    return res.redirect('/admin/mail?msg=' + encodeURIComponent('Informe o destinatário.'));
  }

  try {
    const html = `<p>${mensagem.split('\n').join('<br>')}</p>`;
    await sendMail({ to, subject, html });
    res.redirect(
      '/admin/mail?msg=' +
        encodeURIComponent(`E-mail enviado para ${to}. Confira caixa de entrada e spam.`)
    );
  } catch (e) {
    console.error('[mail] Falha no teste de envio:', e);
    res.redirect('/admin/mail?msg=' + encodeURIComponent('Falha no envio: ' + e.message));
  }
});

module.exports = router;