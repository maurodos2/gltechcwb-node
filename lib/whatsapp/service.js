/**
 * Sessão do WhatsApp do bot (whatsapp-web.js, via QR code).
 *
 * Inicializa apenas se WHATSAPP_BOT_ENABLED=true (no boot via server.js ou no
 * botão "Iniciar" do painel /admin/whatsapp). A sessão é persistida com
 * LocalAuth em .wwebjs_auth/ para não precisar escanear o QR toda vez.
 *
 * O estado atual fica disponível para o painel admin (getState()).
 */
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const bot = require('./bot');

const HABILITADO = process.env.WHATSAPP_BOT_ENABLED === 'true';
const SESSION_DIR =
  process.env.WHATSAPP_SESSION_DATA || path.join(__dirname, '../../.wwebjs_auth');

let client = null;
let iniciando = false;

const state = {
  status: 'off', // off | iniciando | aguardando-qr | conectando | pronto | desconectado | erro
  qr: null,
  numero: '',
  ultimoErro: '',
  iniciadoEm: null,
};

function getState() {
  return { ...state };
}

async function sendMessage(waId, texto) {
  if (!client) return false;
  await client.sendMessage(waId, texto);
  return true;
}

async function sendMessageToGrupo(texto) {
  const grupo = process.env.WHATSAPP_HANDOFF_GROUP;
  if (!client || !grupo) return false;
  await client.sendMessage(grupo, texto);
  return true;
}

async function init() {
  if (!HABILITADO) {
    state.status = 'off';
    return null;
  }
  if (client) return client;
  if (iniciando) return null;

  iniciando = true;
  state.status = 'iniciando';

  const clientId = (process.env.WHATSAPP_BOT_SESSION || 'gltech').replace(/[^a-z0-9_-]/gi, '');

  const puppeteerOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  // Fallback para Chromium do sistema (Puppeteer/Chrome oficiais não têm
  // build arm64 garantido em servidores ARM — ex.: Oracle Ampere A1).
  if (process.env.PUPPETEER_EXECUTABLE_PATH) puppeteerOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;

  client = new Client({
    authStrategy: new LocalAuth({ clientId, dataPath: SESSION_DIR }),
    puppeteer: puppeteerOpts,
  });

  client.on('qr', (qr) => {
    state.status = 'aguardando-qr';
    state.qr = qr;
    state.ultimoErro = '';
    try {
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n[whatsapp] * Escaneie o QR acima com o WhatsApp do cliente: WhatsApp > Aparelhos conectados. *\n');
    } catch (e) {
      // sem terminal colorido, segue via painel admin
    }
  });

  client.on('authenticated', () => {
    state.status = 'conectando';
  });

  client.on('auth_failure', (motivo) => {
    state.status = 'desconectado';
    state.ultimoErro = String(motivo || 'Falha na autenticação');
    console.warn('[whatsapp] falha de autenticação:', motivo);
  });

  client.on('ready', () => {
    state.status = 'pronto';
    state.qr = null;
    state.ultimoErro = '';
    state.iniciadoEm = new Date();
    try {
      state.numero = (client.info && client.info.wid && client.info.wid._serialized) || '';
    } catch (e) {
      state.numero = '';
    }
    console.log(`[whatsapp] bot conectado (${state.numero})`);
  });

  client.on('disconnected', (motivo) => {
    state.status = 'desconectado';
    state.ultimoErro = `Desconectado: ${motivo || 'sem motivo'}`;
    console.warn('[whatsapp] desconectado:', motivo);
  });

  client.on('message', (msg) => {
    bot
      .handleMessage(msg, client)
      .catch((e) => console.error('[whatsapp] erro no handler:', e));
  });

  try {
    await client.initialize();
  } catch (e) {
    state.status = 'erro';
    state.ultimoErro = e.message || 'Falha ao iniciar';
    console.error('[whatsapp] falha ao iniciar:', e);
    client = null;
  } finally {
    iniciando = false;
  }
  return client;
}

async function shutdown() {
  if (client) {
    try {
      await client.destroy();
    } catch (e) {
      // ignora
    }
  }
  client = null;
  state.status = 'off';
  state.qr = null;
  state.ultimoErro = '';
}

async function logout() {
  await shutdown();
  // Deleta a sessão salva para forçar novo QR.
  try {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  } catch (e) {
    // ignora
  }
}

module.exports = { init, shutdown, logout, getState, sendMessage, sendMessageToGrupo, HABILITADO };