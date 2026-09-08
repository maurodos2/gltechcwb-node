/**
 * Respostas rápidas (FAQ) do bot do WhatsApp — tudo em pt-BR.
 *
 * As funções leem env/SiteSetting na hora da resposta, então alterações de
 * contato/preço de frete valem sem redeploy do bot.
 */
const { getCheckoutSettings } = require('../checkout-settings');

const SITE_URL = process.env.SITE_URL || 'https://www.gltechcwb.com';
const CONTATO =
  process.env.CONTACT_WHATSAPP || process.env.WHATSAPP_BOT_NUMBER || '5541999999999';

function menu() {
  return [
    '*GLTech CWB* — como posso ajudar? 😊',
    '',
    'Responda com o número ou escreva a sua dúvida:',
    '',
    '1️⃣ *Horário de atendimento*',
    '2️⃣ *Frete e prazo de entrega*',
    '3️⃣ *Formas de pagamento*',
    '4️⃣ *Acompanhar meu pedido*',
    '5️⃣ *Buscar produto do catálogo*',
    '6️⃣ *Falar com um atendente*',
    '',
    'Dica: tente *"rastrear pedido"*, *"quanto custa o frete"* ou *"buscar produto"*.',
  ].join('\n');
}

async function horario() {
  return [
    '*Horário de atendimento* ⏰',
    '',
    'Segunda a sexta: 9h às 18h',
    'Sábado: 9h às 13h',
    'Domingo e feriados: fechado',
    '',
    'Pedidos feitos após o horário são processados no próximo dia útil.',
    '',
    'Precisando de mais alguma coisa? Responda *6* pra falar com um atendente.',
  ].join('\n');
}

async function frete() {
  let extra = 'Prazo e valor calculados no checkout, pelo CEP.';
  try {
    const s = await getCheckoutSettings();
    const dados = s && s.raw ? s.raw : s;
    if (dados && dados.freteGratisAcimaDe) {
      extra = `Entregamos em todo o Brasil. Frete grátis para pedidos acima de ${formatarBRL(
        Number(dados.freteGratisAcimaDe)
      )}.`;
    }
  } catch (e) {
    // usa o texto padrão
  }
  return [
    '*Frete e prazo de entrega* 📦',
    '',
    extra,
    '',
    'Enviamos por Correios (PAC/SEDEX) e transportadora, com código de rastreio.',
    '',
    'Confirme o prazo pro seu CEP no checkout, ou fale com a gente pela opção *6*.',
  ].join('\n');
}

async function pagamento() {
  return [
    '*Formas de pagamento* 💳',
    '',
    '• *Pix* (aprovado na hora)',
    '• *Cartão de crédito* em até 12x (Mercado Pago)',
    '• *Boleto* bancário (prazo de compensação)',
    '',
    'Tudo pelo checkout com gerenciador Mercado Pago — seguro e com comprovante.',
    '',
    'Se precisar de boleto ou parcelamento especial, responda *6*.',
  ].join('\n');
}

async function localizacao() {
  return [
    '*Onde estamos / retirada* 📍',
    '',
    'Somos loja online com retirada em *Curitiba - PR* (combinado pelo WhatsApp).',
    '',
    `Atendimento e pedidos: wa.me/${CONTATO}`,
    'Site: ' + SITE_URL,
  ].join('\n');
}

async function garantia() {
  return [
    '*Troca, devolução e garantia* 🔧',
    '',
    '• Garantia de fábrica conforme o fabricante (preço a ver melhor no produto).',
    '• Defeito no recebimento: nos chame em até 7 dias.',
    '• Compra no site tem os 7 dias de arrependimento (CDC).',
    '',
    'Para resolver um caso específico, responda *6* que um atendente te ajuda.',
  ].join('\n');
}

async function atendimentoHumano() {
  return [
    'Certo, vou acionar nossa equipe 👤',
    '',
    'Assim que possível alguém te responde por aqui. Se for urgente, ligue ou mande WhatsApp pra nossa central:',
    '',
    `📱 wa.me/${CONTATO}`,
  ].join('\n');
}

function semPedido() {
  return [
    'Não encontrei *pedidos* pra esse número 😕',
    '',
    'Se você comprou com outro número/CPF ou por outro e-mail, diga *6* que o atendente localiza.',
    'Também dá pra ver seus pedidos acessando a conta no site: ' + SITE_URL + '/conta/pedidos',
  ].join('\n');
}

function semResultadoBusca(q) {
  return [
    `Não achei nada pra *"${q}"* no catálogo 😕`,
    '',
    'Tente outro nome ou código (ex.: "mouse M185", "BX8071512100").',
    'Ou responda *6* pra um atendente procurar por você.',
  ].join('\n');
}

function naoEntendi() {
  return [
    'Não entendi 😅 pode reformular?',
    '',
    'Você pode:',
    '• *"Horário"*',
    '• *"Frete"*',
    '• *"Pagamento"*',
    '• *"Rastrear pedido"*',
    '• *"Buscar <produto>"*',
    '• *"Atendente"*',
    '',
    'Ou responda *1 a 6* pelo menu abaixo:',
    '',
    menu(),
  ].join('\n');
}

function formatarBRL(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { menu, horario, frete, pagamento, localizacao, garantia, atendimentoHumano, semPedido, semResultadoBusca, naoEntendi };