const express = require('express');
const router = express.Router();
const { sendMail } = require('../../lib/mail');

// Garante retorno em tempo máximo; evita spinner infinito se o SMTP travar
function avecTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Sem resposta do servidor SMTP em ${ms / 1000}s (verifique rede/porta).`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
    await avecTimeout(sendMail({ to, subject, html }), 35000);
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