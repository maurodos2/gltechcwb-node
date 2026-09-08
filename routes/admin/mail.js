const express = require('express');
const router = express.Router();
const dns = require('dns').promises;
const net = require('net');
const { sendMail } = require('../../lib/mail');

// Testa abertura de conexão TCP em uma porta (diagnóstico de saída do servidor)
function testaPorta(host, port, ms = 10000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const fim = (r) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => fim({ port, ok: false, erro: 'timeout' }), ms);
    socket.setTimeout(ms);
    socket.once('connect', () => fim({ port, ok: true, erro: null }));
    socket.once('timeout', () => fim({ port, ok: false, erro: 'timeout' }));
    socket.once('error', (e) => fim({ port, ok: false, erro: e.code || e.message }));
    socket.connect({ host, port });
  });
}

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

// GET /admin/mail — formulário para teste de envio via SMTP (Zoho) + diagnóstico de saída
router.get('/', async (req, res) => {
  const msg = String(req.query.msg || '');
  const smtpHost = process.env.SMTP_HOST || 'smtp.zoho.com';

  let diagnostico = null;
  try {
    const [ips, portas, ipExterno] = await Promise.all([
      dns.resolve4(smtpHost).catch(() => []),
      Promise.all([587, 465, 25].map((p) => testaPorta(smtpHost, p))),
      fetch('https://api.ipify.org?format=json')
        .then((r) => r.json())
        .then((j) => j.ip || '')
        .catch(() => ''),
    ]);
    diagnostico = { ips: ips.slice(0, 4), portas, ipExterno };
  } catch (e) {
    console.error('[mail] Falha no diagnóstico:', e);
  }

  res.render('admin/mail', {
    msg,
    configurado: !!process.env.SMTP_USER,
    smtpHost,
    smtpPort: process.env.SMTP_PORT || '587',
    smtpSecure: process.env.SMTP_SECURE === undefined ? 'padrão' : process.env.SMTP_SECURE,
    from: process.env.EMAIL_FROM || process.env.SMTP_USER || '',
    diagnostico,
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