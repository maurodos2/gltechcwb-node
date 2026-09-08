const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

let transporter = null;

// Provedor ativo: Resend (API HTTPS, usado em produção) ou SMTP (Zoho, dev/tests).
// Com RESEND_API_KEY setada, o envio vai pela API (porta 443 — confiável em clouds).
function temResend() {
  return !!process.env.RESEND_API_KEY;
}

function getTransporter() {
  if (transporter) return transporter;

  const smtpPort = parseInt(process.env.SMTP_PORT, 10);
  // Se não definido, assume 587 + STARTTLS (a 465 não atravessa clouds/hosting).
  const smtpSecure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE !== 'false' : false;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: smtpPort || 587,
    secure: smtpSecure,
    requireTLS: true, // força STARTTLS na 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  return transporter;
}

// Envio via Resend (REST sobre HTTPS). O remetente (from) precisa ser domínio/e-mail
// verificado na conta Resend.
async function enviaResend({ from, to, subject, html, text }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text: text || undefined,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  console.log('[mail] Enviado via Resend:', data.id);
  return data;
}

async function sendMail({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || '';
  if (!from) throw new Error('Sem remetente configurado (EMAIL_FROM ou SMTP_USER).');

  if (temResend()) {
    return enviaResend({ from, to, subject, html, text });
  }

  const transport = getTransporter();
  const info = await transport.sendMail({ from, to, subject, html });

  console.log('[mail] E-mail enviado (SMTP):', info.messageId);
  return info;
}

async function sendOrderConfirmation(order) {
  const templatePath = path.join(__dirname, '../views/emails/order-confirmation.ejs');

  let html;
  if (fs.existsSync(templatePath)) {
    html = await ejs.renderFile(templatePath, {
      order,
      formatPrice: (v) =>
        Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    });
  } else {
    html = `
      <h1>Pedido #${order._id} confirmado!</h1>
      <p>Olá, ${order.customer.name}!</p>
      <p>Seu pedido foi recebido e está sendo processado.</p>
      <p><strong>Total: ${order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></p>
      <p>Obrigado por comprar na GLTechCWB!</p>
    `;
  }

  return sendMail({
    to: order.customer.email,
    subject: `Pedido #${String(order._id).slice(-8).toUpperCase()} confirmado — GLTechCWB`,
    html,
  });
}

module.exports = { sendMail, sendOrderConfirmation, temResend };
