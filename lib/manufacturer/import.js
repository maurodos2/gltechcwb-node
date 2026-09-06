/**
 * Orquestra o "shop de fabricantes": dado um Product, detecta a marca,
 * resolve o modelo, consulta o fabricante e aplica (imagem R2 + descrição).
 *
 * Isso é uma ferramenta manual: só roda quando o admin chamar
 * (/admin/imports ou npm run import-manufacturer).
 */
const tplink = require('./tplink');
const intelbras = require('./intelbras');
const logitech = require('./logitech');
const memoriaSsd = require('./memoria-ssd');
const oneal = require('./oneal');
const kadosh = require('./kadosh');
const axios = require('axios');
const storage = require('../storage');

const MAX_IMAGENS_POR_PRODUTO = 8;
const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024; // 5MB, igual ao limite do upload admin
const TIMEOUT_MS = 20000;

// Detecta a marca a partir do Product (campo brand ou nome). Retorna um dos
// slugs de importador suportados, ou null se a marca ainda não tem importador.
function detectarMarca(produto) {
  const brand = String(produto.brand || '').trim().toLowerCase();
  const name = String(produto.name || '').toLowerCase();
  if (brand.includes('tplink') || brand.includes('tp-link') || brand === 'tp link') return 'tplink';
  if (brand.includes('intelbras')) return 'intelbras';
  if (brand.includes('logitech')) return 'logitech';
  if (brand.includes('adata') || brand.includes('patriot')) return 'memoria_ssd';
  if (brand.includes('oneal')) return 'oneal';
  if (brand.includes('kadosh')) return 'kadosh';
  if (brand) return null; // marca conhecida mas sem importador
  if (name.includes('tplink') || name.includes('tp-link')) return 'tplink';
  if (name.includes('intelbras')) return 'intelbras';
  if (name.includes('logitech')) return 'logitech';
  if (name.includes('adata') || name.includes('patriot')) return 'memoria_ssd';
  if (name.includes('oneal')) return 'oneal';
  if (name.includes('kadosh')) return 'kadosh';
  // Modelos da Linha Logitech (mesmo sem a palavra no nome)
  if (/\b(M1[78]\d|M2[20]\d|M28[0-9]|K12\d|K27\d|C2\d\d|B1\d\d|G3\d\d)\b/i.test(name)) return 'logitech';
  return null;
}

// Tenta extrair o número do modelo do nome do produto (ex.: TL-WA850RE).
function extrairModelo(produto) {
  const nome = String(produto.name || '');
  // Intelbras: código do produto no nome (ex.: 4080051) — usado como RefId
  const codigoIntelbras = nome.match(/\b(\d{6,8})\b/);
  if (codigoIntelbras) return codigoIntelbras[1];
  const m = nome.match(/\bTL[- ]?[A-Z0-9]{2,10}\b/i);
  if (m) return m[0].replace(/[- ]/g, '');
  const m2 = nome.match(/\bAC\d{2,4}\b/i);
  if (m2) return m2[0];
  // Logitech: modelos da linha (ex.: M185, K120, C270)
  const m3 = nome.match(/\b(M1[78]\d|M2[20]\d|M28[0-9]|K12\d|K27\d|C2\d\d|B1\d\d|G3\d\d)\b/i);
  if (m3) return m3[1].toUpperCase();
  // Kadosh: modelos de microfone (ex.: K3, K300)
  const mKad = nome.match(/\bK\d{1,3}\b/i);
  if (mKad) return mKad[0].toUpperCase();
  // Oneal: código do modelo (ex.: OB-408, OB-1315R → 408, 1315r)
  const mOneal = nome.match(/\bOB[- ]?(\d{3,4}[a-z]?)\b/i);
  if (mOneal) return mOneal[1].toLowerCase();
  // ADATA/Patriot: código da peça no nome (ex.: ASU650SS-480GT-R, PBE120GS25SSDR)
  const m4 = nome.match(/\b(ASU\d[A-Z0-9]*[- ]?[A-Z0-9]*|PBE\d[A-Z0-9]+)\b/i);
  if (m4) return m4[1].replace(/[- ]/g, '');
  return '';
}

const IMPORTADORES = {
  tplink: {
    marca: 'TP-Link',
    obter: tplink.obter,
    hosts: tplink.HOSTS_IMAGENS,
  },
  intelbras: {
    marca: 'Intelbras',
    obter: intelbras.obter,
    hosts: intelbras.HOSTS_IMAGENS,
  },
  logitech: {
    marca: 'Logitech',
    obter: logitech.obter,
    hosts: logitech.HOSTS_IMAGENS,
  },
  memoria_ssd: {
    marca: 'ADATA',
    obter: memoriaSsd.obter,
    hosts: memoriaSsd.HOSTS_IMAGENS,
  },
  oneal: {
    marca: 'Oneal',
    obter: oneal.obter,
    hosts: oneal.HOSTS_IMAGENS,
  },
  kadosh: {
    marca: 'Kadosh',
    obter: kadosh.obter,
    hosts: kadosh.HOSTS_IMAGENS,
  },
};

// Baixa uma imagem de um host permitido (do importador) e devolve
// { buffer, mime, nome }.
async function baixarImagem(url, hosts) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch (e) {
    return null;
  }
  if (!hosts || !hosts.has(host)) return null;

  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: TIMEOUT_MS,
    maxContentLength: LIMITE_BYTES_IMAGEM,
  });
  const buf = Buffer.from(resp.data);
  let mime = String(resp.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i) || [])[1];

  // Alguns CDNs entregam imagem como text/plain — usa a extensão como fallback.
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) {
    if (!ext || !/^(jpe?g|png|webp|gif)$/i.test(ext)) return null;
    if (!['', 'text/plain', 'application/octet-stream', 'binary/octet-stream'].includes(mime)) return null;
    mime = ext.toLowerCase() === 'jpg' || ext.toLowerCase() === 'jpeg'
      ? 'image/jpeg'
      : `image/${ext.toLowerCase()}`;
  }
  if (buf.length > LIMITE_BYTES_IMAGEM) return null;

  const nome = url.split('/').pop().split('?')[0] || 'produto.jpg';
  return { buffer: buf, mime, nome };
}

// Importa imagens (e descrição, se vazia) de UM produto.
// options.modelo permite forçar/ajustar o modelo quando o nome não contém.
// Retorna { status, ... } para exibição na interface.
async function importarProduto(produto, options = {}) {
  const slug = detectarMarca(produto);
  if (!slug) {
    return { status: 'sem-importador', motivo: 'Marca sem importador de fabricante' };
  }
  const importador = IMPORTADORES[slug];

  const modelo = (options && options.modelo ? options.modelo : extrairModelo(produto)).trim();
  if (!modelo) {
    return { status: 'sem-modelo', motivo: 'Sem modelo identificável no nome — informe manualmente' };
  }

  const dados = await importador.obter(modelo, produto.name || '');
  if (!dados) {
    return { status: 'nao-encontrado', motivo: `Site do fabricante não encontrou o modelo "${modelo}"` };
  }
  const urlProduto = dados.url || '';

  // Baixa imagens (principal + galeria) e joga no R2
  let galeria = dados.galeria || [];
  if (dados.filtrarPorModelo) {
    // TP-Link: a galeria traz banners/miniaturas — mantém só as que citam o modelo
    const token = modelo.toLowerCase().replace(/[^a-z0-9]/g, '');
    galeria = galeria.filter((u) => {
      try {
        return new URL(u).pathname.toLowerCase().replace(/[^a-z0-9]/g, '').includes(token);
      } catch (e) {
        return false;
      }
    });
  }
  const fontes = [dados.imagemPrincipal, ...galeria]
    .filter(Boolean)
    .filter((u, i, arr) => arr.indexOf(u) === i)
    .slice(0, 4);
  if (!fontes.length) {
    return { status: 'sem-imagem', url: urlProduto, motivo: 'Página oficial sem imagem utilizável' };
  }

  const novasUrls = [];
  for (const fonte of fontes) {
    try {
      const img = await baixarImagem(fonte, importador.hosts);
      if (!img) continue;
      const url = await storage.uploadImage(img.buffer, img.nome, img.mime);
      novasUrls.push(url);
    } catch (e) {
      console.warn(`  [import-manufacturer] falha ao baixar ${fonte}: ${e.message}`);
    }
  }

  if (!novasUrls.length) {
    return { status: 'erro-upload', url: urlProduto, motivo: 'Não foi possível baixar/subir nenhuma imagem' };
  }

  const existentes = new Set((produto.images || []).filter(Boolean));
  const todas = [...novasUrls];
  for (const u of existentes) if (!todas.includes(u)) todas.push(u);
  produto.images = todas.slice(0, MAX_IMAGENS_POR_PRODUTO);

  if (!produto.description && dados.descricao) produto.description = dados.descricao;
  if (!produto.shortDescription && dados.descricao) {
    produto.shortDescription = dados.descricao.slice(0, 280);
  }
  if (!produto.brand) produto.brand = dados.marca || importador.marca;

  produto.manufacturerRef = {
    model: modelo,
    url: urlProduto || dados.url || '',
    importedAt: new Date(),
  };

  try {
    await produto.save();
  } catch (e) {
    return { status: 'erro-save', motivo: `Falha ao salvar: ${e.message}` };
  }

  return {
    status: 'ok',
    url: urlProduto || dados.url,
    imagensAdicionadas: novasUrls.length,
    descricaoAdicionada: Boolean(dados.descricao),
    totalImagens: produto.images.length,
  };
}

module.exports = { detectarMarca, extrairModelo, importarProduto, baixarImagem, IMPORTADORES };