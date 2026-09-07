/**
 * Importador Intel (processadores boxed).
 *
 * Fonte principal: Pauta Distribuidora (pauta.com.br) — distribuidora B2B de
 * quem a loja compra — que publica as fotos oficiais da caixa (Intel) dos
 * processadores. Para modelos que o site público da Pauta não lista (ex. o
 * i3-12100F, variante sem vídeo), usa a foto oficial da caixa espelhada por um
 * revendedor "Intel Oficial".
 *
 * FONTES guarda imagem(gen) por modelo (chave normalizada sem hífen/minúsculas).
 * Para novos processadores, basta adicionar a entrada com o modelo na chave.
 */
const HOSTS_IMAGENS = new Set(['pauta.com.br', 'www.gigantec.com.br']);

const FONTES = {
  'i312100': {
    url: 'https://pauta.com.br/processador-intel-core-i3-12100-33ghz-turbo-43ghz-12mb-cache-lga1700-12-geracao-bx8071512100-4',
    nome: 'Processador Intel Core i3-12100 Box (BX8071512100)',
    imagens: [
      'https://pauta.com.br/images/thumbs/0710227.png',
      'https://pauta.com.br/images/thumbs/0710228.png',
      'https://pauta.com.br/images/thumbs/0710229.png',
    ],
  },
  'i312100f': {
    url: 'https://www.gigantec.com.br/processador-intel-core-i3-12100f-12-gerac-o-3-30-ghz-4-3ghz-max-turbo-cache-12mb-lga-1700-s-video-integrado-bx8071512100f.html',
    nome: 'Processador Intel Core i3-12100F Box (BX8071512100F)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/2/1/21832_1.jpg',
      'https://www.gigantec.com.br/media/catalog/product/2/1/21832_2.jpg',
    ],
  },
};

async function obter(modelo, nome = '') {
  const chave = String(modelo).toLowerCase().replace(/[^a-z0-9]/g, '');
  const fonte = FONTES[chave];
  if (!fonte) return null;
  return {
    url: fonte.url,
    nome: fonte.nome,
    descricao: '',
    imagemPrincipal: fonte.imagens[0],
    galeria: fonte.imagens.slice(1),
  };
}

module.exports = { obter, HOSTS_IMAGENS };