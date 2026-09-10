/**
 * Lógica do bot de atendimento do WhatsApp.
 *
 * Transporte agnóstico: handleMessage recebe um "msg" no formato do
 * whatsapp-web.js e um "client" (que só precisa de sendMessage/to) — se um dia
 * migrar para a Meta Cloud API, é trocar o caller.
 *
 * Fluxos: FAQ (menu numérico ou por palavras), rastreio de pedido pelo número,
 * busca de produto no catálogo (com escolha 1..N e envio da foto) e handoff
 * para atendente humano.
 */
const { MessageMedia } = require('whatsapp-web.js');
const Conversation = require('../../models/Conversation');
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const faq = require('./faq');

const SITE_URL = process.env.SITE_URL || 'https://www.gltechcwb.com';
const HANDOFF_GROUP = process.env.WHATSAPP_HANDOFF_GROUP || '';

// Idade máxima das mensagens que o bot atende (segundos). Mensagens mais antigas
// são descartadas — o WhatsApp reprocessa o backlog recebido enquanto o bot estava
// offline ao reconectar e, sem este filtro, o bot "dispararia" respostas para todos.
const IDADE_MAX_MSG_SEC = parseInt(process.env.WHATSAPP_MAX_MSG_AGE_SEC || '120', 10);
// Intervalo mínimo entre respostas automáticas para a mesma conversa.
const COOLDOWN_MS = parseInt(process.env.WHATSAPP_COOLDOWN_MS || '3000', 10);

const ultimaResposta = new Map();
function emCooldown(waId) {
  const ult = ultimaResposta.get(waId) || 0;
  if (Date.now() - ult < COOLDOWN_MS) return true;
  ultimaResposta.set(waId, Date.now());
  return false;
}

const STATUS_PT = {
  pending_payment: 'Aguardando pagamento',
  paid: 'Pago',
  processing: 'Em processamento',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

function normalizar(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function soDigitos(t) {
  return String(t || '').replace(/\D/g, '');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preco(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarData(d) {
  const x = new Date(d);
  return x.toLocaleDateString('pt-BR');
}

function produtoPreco(p) {
  if (p.hasVariants && p.variants && p.variants.length) {
    const vals = p.variants.map((v) => (v.promoPrice && v.promoPrice > 0 ? v.promoPrice : v.price));
    const min = Math.min(...vals);
    return preco(min) + ' (a partir de)';
  }
  return p.promoPrice && p.promoPrice > 0 ? preco(p.promoPrice) : preco(p.price);
}

// Intenções por palavras-chave (sem acento)
const INTENTS = {
  horario: /horar|funcionament|atend|abert|fechad|segunda|quando voc|trocador|loja fisic|loja presenv/i,
  frete: /frete|enviar|envio|entrega|prazo|chegad|correio|sedex|\bpac\b|rastre|quando chega|retirad|pickup|vitrine|transport/i,
  pagamento: /pagament|pagar|pix|cartao|cartaozinho|boleto|parcel|forma de pag|aceit|dinheiro|transferencia|mercado pago/i,
  localizacao: /endereco|onde fic|aonde|local|retirad|pickup|cwb|curitiba/i,
  garantia: /garantia|troca|devoluc|defeito|quebrad|estrag|cancel/i,
  rastreio: /rastre|meu pedido|pedido|encomend|compra|onde ta|situacao do|numero do pedido|meus pedidos|nota fiscal/i,
  atendente: /atendente|humano|pessoa|falar com algu|agente|suporte humano|central|liga|falar com voc|preciso de ajuda|falar no.whats|ligar/i,
};

const INTENTS_ORDER = ['horario', 'frete', 'pagamento', 'localizacao', 'garantia', 'rastreio', 'atendente'];

function detectarIntencao(t) {
  for (const k of INTENTS_ORDER) {
    if (INTENTS[k].test(t)) return k;
  }
  return null;
}

// Conversa: busca pelo waId ou cria nova. Persiste mensagens com cap.
async function obterConversa(waId, phone) {
  let conv = await Conversation.findOne({ waId }).exec();
  if (!conv) {
    conv = new Conversation({ waId, phone, status: 'bot' });
    await conv.save();
  } else if (conv.phone !== phone && phone) {
    conv.phone = phone;
  }
  return conv;
}

function registrarMensagem(conv, role, text) {
  conv.messages.push({ role, text: String(text).slice(0, 4000) });
  if (conv.messages.length > 200) {
    conv.messages = conv.messages.slice(-200);
  }
  conv.lastMessageAt = new Date();
}

async function enviar(conv, client, waId, texto) {
  await client.sendMessage(waId, texto);
  registrarMensagem(conv, 'bot', texto);
}

async function buscarProdutos(q) {
  const qn = normalizar(q);
  if (!qn) return [];
  // 1) busca indexada (text index, ignora acentos/diacríticos)
  let hits = await Product.find({
    active: true,
    $text: { $search: qn },
  })
    .select('name slug sku barcode price promoPrice hasVariants variants')
    .limit(8)
    .lean();
  // 2) fallback: varre catálogo e casa sem acento no próprio código
  if (!hits.length) {
    const cands = await Product.find({ active: true })
      .select('name slug sku barcode price promoPrice hasVariants variants')
      .limit(300)
      .lean();
    hits = cands.filter((p) => {
      const alvo = normalizar([p.name, p.sku, p.barcode].join(' '));
      return alvo.includes(qn);
    }).slice(0, 8);
  }
  return hits;
}

async function enviarDetalheProduto(conv, client, waId, p) {
  const link = `${SITE_URL}/produto/${p.slug}`;
  const texto = [
    `*${p.name}*`,
    `💵 ${produtoPreco(p)}`,
    `Código: ${p.sku}`,
    `🔗 ${link}`,
  ].join('\n');
  const img = (p.images && p.images[0]) || '';
  if (img) {
    try {
      const media = await MessageMedia.fromUrl(img);
      await client.sendMessage(waId, media, { caption: texto });
      registrarMensagem(conv, 'bot', texto);
      return;
    } catch (e) {
      // cai para texto puro
    }
  }
  await enviar(conv, client, waId, texto);
}

async function fluxoRastreio(conv, client, waId, phone) {
  const cod = soDigitos(phone || waId);
  const semCod = cod.replace(/^55/, '');
  const alvo = semCod || cod;
  const pedidos = await Order.find({
    'customer.phone': { $regex: escapeRegex(alvo.slice(-9)) },
  })
    .sort({ createdAt: -1 })
    .limit(3)
    .lean();

  if (!pedidos.length) {
    registrarMensagem(conv, 'user', '(solicitou rastreio)');
    await enviar(conv, client, waId, await faq.semPedido());
    return;
  }

  const linhas = pedidos.map((o, i) => {
    const itens = (o.items || []).reduce((s, it) => s + it.quantity, 0);
    return [
      `${i + 1}) *${STATUS_PT[o.status] || o.status}*`,
      `   Pedido #${String(o._id).slice(-7)} · ${formatarData(o.createdAt)}`,
      `   ${itens} item(ns) · Total ${preco(o.total)}`,
    ].join('\n');
  });

  const msg = [
    `*Seus pedidos recentes* 📋`,
    '',
    ...linhas,
    '',
    'Dúvida sobre um pedido específico? Responda *6* que o atendente consulta o detalhe.',
  ].join('\n');
  await enviar(conv, client, waId, msg);
}

async function fluxoCatalogo(conv, client, msg, waId, query) {
  const produtos = await buscarProdutos(query);
  if (!produtos.length) {
    await enviar(conv, client, waId, await faq.semResultadoBusca(query));
    conv.context = null;
    return;
  }

  const linhas = produtos.map((p, i) => `${i + 1}) *${p.name}* — ${produtoPreco(p)}`);
  await enviar(
    conv,
    client,
    waId,
    [
      `Encontrei ${produtos.length} produto(s) 🔎`,
      '',
      ...linhas,
      '',
      'Responda o *número* do produto pra ver detalhes, ou *0* pra cancelar.',
    ].join('\n')
  );
  conv.context = { tipo: 'catalogo', ids: produtos.map((p) => p._id.toString()) };
}

async function fluxoHandoff(conv, client, waId, msg) {
  conv.status = 'human';
  conv.handoffGroup = conv.handoffGroup || HANDOFF_GROUP;
  await enviar(conv, client, waId, await faq.atendimentoHumano());
  const grupo = conv.handoffGroup;
  if (grupo) {
    const ultimas = (conv.messages.slice(-6) || [])
      .map((m) => `${m.role === 'user' ? '👤 Cliente' : '🤖 Bot'}: ${m.text}`)
      .join('\n');
    try {
      await client.sendMessage(
        grupo,
        [`🔔 *Atendimento humano solicitado*`, `Número: ${waId}`, '', ultimas || 'Sem histórico.'].join('\n')
      );
    } catch (e) {
      console.error('[whatsapp] falha ao avisar grupo de handoff:', e.message);
    }
  }
}

async function handleMessage(msg, client) {
  // Só conversas privadas (1:1); ignora grupos/menções do bot.
  if (msg.from.endsWith('@g.us')) return;
  const waId = msg.from;
  const phone = soDigitos(msg.from.split('@')[0]);

  // Ignora backlog reprocessado ao reconectar (mensagens mais antigas que o limite).
  // Sem timestamp válido, trata como suspeita (offline/replay) e descarta.
  const agoraMs = Date.now();
  const tsMs = msg.timestamp && Number(msg.timestamp) > 0 ? Number(msg.timestamp) * 1000 : 0;
  if (agoraMs - tsMs > IDADE_MAX_MSG_SEC * 1000) return;

  // Antes de qualquer resposta, respeita o cooldown da conversa (evita rajada/loop).
  if (emCooldown(waId)) return;

  const conv = await obterConversa(waId, phone);
  const corpo = String(msg.body || '').trim();
  const t = normalizar(corpo);

  // Caso especial: cliente assumido por humano (bot mudo). Volta ao bot se pedir menu.
  if (conv.status === 'human') {
    registrarMensagem(conv, 'user', corpo);
    if (/^(menu|oi|ola|eai|bom dia|boa tarde|boa noite|inicio|ajuda|help|1|2|3|4|5|6)$/.test(t)) {
      conv.status = 'bot';
    } else if (conv.handoffGroup) {
      try {
        await client.sendMessage(conv.handoffGroup, `👤 *Cliente:* ${corpo}`);
      } catch (e) {
        // se o grupo caiu, segue silencioso
      }
    }
    await conv.save();
    return;
  }

  // 1) seleção em andamento (busca de produto)
  if (conv.context && conv.context.tipo === 'catalogo') {
    const escolha = corpo.match(/^([0-9]+)$/);
    if (escolha) {
      const idx = Number(escolha[1]);
      if (idx === 0) {
        conv.context = null;
        await enviar(conv, client, waId, 'Deixa pra lá então 😊 Precisa de algo? Responda *menu*.');
      } else {
        const id = conv.context.ids[idx - 1];
        if (id) {
          const produto = await Product.findById(id)
            .select('name slug sku barcode price promoPrice hasVariants variants images')
            .lean();
          conv.context = null;
          if (produto) {
            registrarMensagem(conv, 'user', corpo);
            await enviarDetalheProduto(conv, client, waId, produto);
          } else {
            await enviar(conv, client, waId, 'Não consegui abrir esse produto 😕 tenta de novo digitando outro.');
          }
        } else {
          await enviar(conv, client, waId, `Digite um número de 1 a ${conv.context.ids.length}, ou *0*.`);
        }
      }
      await conv.save();
      return;
    }
    // mudou de ideia: trata como nova mensagem
    conv.context = null;
  }

  // 2) "catalogo": qualquer busca envolvendo produto/preço
  if (t.startsWith('busca') || t.startsWith('procur') || t.startsWith('catalogo') || t.includes('produto') || t.includes('quero comprar') || t.includes('custa quanto') || t.includes('tem ') || t.includes('preco do')) {
    const query = corpo.replace(/^(busca|procur|procurar|catalogo|produto|produtos|quero comprar|custa quanto)\s*(o|a|de|pra)?\s*/i, '').trim();
    if (query) {
      registrarMensagem(conv, 'user', corpo);
      await fluxoCatalogo(conv, client, msg, waId, query);
      await conv.save();
      return;
    }
    // sem termo: pede o que buscar
    await enviar(conv, client, waId, 'Me diz *qual produto* você procura (nome ou código, ex.: "mouse M185").');
    await conv.save();
    return;
  }

  // 3) menu numérico
  if (/^[1-6]$/.test(corpo)) {
    registrarMensagem(conv, 'user', corpo);
    const map = {
      1: faq.horario,
      2: faq.frete,
      3: faq.pagamento,
      4: async () => { await fluxoRastreio(conv, client, waId, phone); return null; },
      5: async () => {
        await enviar(conv, client, waId, 'Me diz *qual produto* você procura (nome ou código).');
        return null;
      },
      6: async () => { await fluxoHandoff(conv, client, waId, msg); return null; },
    };
    const fn = map[Number(corpo)];
    const resposta = await fn();
    if (resposta) await enviar(conv, client, waId, resposta);
    conv.context = null;
    await conv.save();
    return;
  }

  // 4) saudações → menu
  if (/^(oi|ola|eai|e aí|bom dia|boa tarde|boa noite|hello|hi|menu|inicio|start|ajuda)\b/.test(t) && corpo.length < 40) {
    registrarMensagem(conv, 'user', corpo);
    await enviar(conv, client, waId, faq.menu());
    await conv.save();
    return;
  }

  // 5) faq/handoff por palavras (só registra a mensagem do cliente se há texto)
  const intent = detectarIntencao(t);
  if (corpo) registrarMensagem(conv, 'user', corpo);
  if (intent) {
    switch (intent) {
      case 'horario':
        await enviar(conv, client, waId, await faq.horario());
        break;
      case 'frete':
        await enviar(conv, client, waId, await faq.frete());
        break;
      case 'pagamento':
        await enviar(conv, client, waId, await faq.pagamento());
        break;
      case 'localizacao':
        await enviar(conv, client, waId, await faq.localizacao());
        break;
      case 'garantia':
        await enviar(conv, client, waId, await faq.garantia());
        break;
      case 'rastreio':
        await fluxoRastreio(conv, client, waId, phone);
        break;
      case 'atendente':
        await fluxoHandoff(conv, client, waId, msg);
        break;
    }
    if (intent !== 'atendente') conv.context = null;
    await conv.save();
    return;
  }

  // 6) mídia / "sem texto": só responde se a pessoa já nos escreveu texto antes.
  // Replay de mídias antigas (backlog ao reconectar) chega como corpo vazio — se
  // nunca houve texto do cliente, não responde (foi o que causou a rajada).
  if (msg.hasMedia || corpo === '') {
    const temTextoUsuario = conv.messages.some((m) => m.role === 'user' && m.text && m.text.trim());
    if (!corpo && !temTextoUsuario) return;
    await enviar(
      conv,
      client,
      waId,
      'Recebi sua mídia, mas por aqui eu só leio texto 😅\n\nEscreve pra mim o que você precisa (ex.: *"frete"*, *"rastrear pedido"*, *"atendente"*).'
    );
    await conv.save();
    return;
  }

  // 7) fallback
  await enviar(conv, client, waId, faq.naoEntendi());
  await conv.save();
}

module.exports = { handleMessage, detectarIntencao, buscarProdutos };