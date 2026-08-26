const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 465,
    secure: process.env.SMTP_SECURE !== 'false',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendMail({ to, subject, html }) {
  const transport = getTransporter();
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;

  const info = await transport.sendMail({
    from,
    to,
    subject,
    html,
  });

  console.log('[mail] E-mail enviado:', info.messageId);
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

module.exports = { sendMail, sendOrderConfirmation };
