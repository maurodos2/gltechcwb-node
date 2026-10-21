require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const storage = require('../lib/storage');

const URLS_PATH = path.join(__dirname, '..', 'migracao', 'urls-pauta.txt');
const MARGEM = 0.35;
const MAX_IMAGENS = 6;
const CATEGORIAS = {
  periferico: 'perifericos',
  armazenamento: 'armazenamento-e-memoria',
  computador: 'computadores-e-dispositivos-portateis-sistemas-prontos',
  seguranca: 'seguranca-e-monitoramento',
  pilha: 'pilhas-e-baterias',
  hardware: 'hardware-componentes-internos',
  monitor: 'monitores',
  projetor: 'projetores',
  telefonia: 'telefonia-e-comunicacao',
  rede: 'infraestrutura-e-redes',
};
const NOMES_CATEGORIAS = {
  perifericos: 'Periféricos',
  'armazenamento-e-memoria': 'Armazenamento e Memória',
  'computadores-e-dispositivos-portateis-sistemas-prontos': 'Computadores e Dispositivos Portáteis (Sistemas Prontos)',
  'seguranca-e-monitoramento': 'Segurança e Monitoramento',
  'pilhas-e-baterias': 'Pilhas e Baterias',
  'hardware-componentes-internos': 'Hardware / Componentes Internos',
  monitores: 'Monitores',
  projetores: 'Projetores',
  'telefonia-e-comunicacao': 'Telefonia e Comunicação',
  'infraestrutura-e-redes': 'Infraestrutura e Redes',
};

// Valores observados na tabela regional da Pauta. Quando PR estava indisponível,
// foi usado SC conforme orientação do usuário.
const PRECOS = {
  '23027': { uf: 'PR', custo: 129.33 },
  '49025': { uf: 'SC', custo: 6498.64 },
  '49938': { uf: 'SC', custo: 5088.60 },
  '41835': { uf: 'SC', custo: 137.43 },
  '43205': { uf: 'PR', custo: 45.31 },
  '43206': { uf: 'PR', custo: 44.65 },
  '31181': { uf: 'PR', custo: 70.05 },
  '38324': { uf: 'PR', custo: 65.07 },
  '44139': { uf: 'SC', custo: 68.28 },
  '35695': { uf: 'PR', custo: 184.36 },
  '30010': { uf: 'PR', custo: 66.21 },
  '44298': { uf: 'SC', custo: 186.23 },
  '50552': { uf: 'PR', custo: 13.70 },
  '50323': { uf: 'PR', custo: 3146.45 },
  '34641': { uf: 'PR', custo: 256.98 },
  '41292': { uf: 'PR', custo: 481.78 },
  '43271': { uf: 'PR', custo: 456.30 },
  '43272': { uf: 'PR', custo: 653.74 },
  '47695': { uf: 'PR', custo: 233.26 },
  '47604': { uf: 'PR', custo: 422.84 },
  '36850': { uf: 'PR', custo: 570.41 },
  '39261': { uf: 'PR', custo: 166.56 },
  '39263': { uf: 'PR', custo: 244.53 },
  '39264': { uf: 'PR', custo: 492.36 },
  '49074': { uf: 'SC', custo: 3620.27 },
  '48224': { uf: 'PR', custo: 90.23 },
  '50227': { uf: 'PR', custo: 2644.43 },
  '49981': { uf: 'PR', custo: 211.47 },
  '48225': { uf: 'SC', custo: 3789.28 },
  '50935': { uf: 'PR', custo: 3337.26 },
  '50192': { uf: 'PR', custo: 2513.45 },
  '47010': { uf: 'PR', custo: 1076.95 },
  '49859': { uf: 'PR', custo: 803.12 },
  '49942': { uf: 'PR', custo: 677.22 },
  '49935': { uf: 'PR', custo: 4318.38 },
  '51211': { uf: 'SC', custo: 720.85 },
  '39846': { uf: 'PR', custo: 560.10 },
  '41274': { uf: 'PR', custo: 1696.54 },
  '43266': { uf: 'PR', custo: 550.14 },
  '45972': { uf: 'SC', custo: 367.87 },
  '46254': { uf: 'SC', custo: 383.30 },
  '46434': { uf: 'PR', custo: 460.01 },
  '48754': { uf: 'PR', custo: 468.12 },
  '50531': { uf: 'SC', custo: 478.95 },
  '50908': { uf: 'SC', custo: 225.00 },
  '50019': { uf: 'SC', custo: 269.00 },
  '48623': { uf: 'SC', custo: 95.32 },
  '48176': { uf: 'SC', custo: 149.00 },
  '47816': { uf: 'SC', custo: 309.00 },
  '48155': { uf: 'SC', custo: 229.00 },
  '50520': { uf: 'SC', custo: 483.07 },
  '50667': { uf: 'SC', custo: 649.00 },
  '44187': { uf: 'SC', custo: 389.00 },
  '44403': { uf: 'SC', custo: 1464.45 },
};

function normalizar(texto) {
  return String(texto || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function slugify(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function categoriaPara(nome) {
  const texto = String(nome || '').toLowerCase();
  if (/hdd|disco r[ií]gido|\bssd\b|mem[oó]ria/.test(texto)) return CATEGORIAS.armazenamento;
  if (/catraca|controle de acesso|c[aâ]mera|cftv/.test(texto)) return CATEGORIAS.seguranca;
  if (/pilha|bateria/.test(texto)) return CATEGORIAS.pilha;
  if (/monitor/.test(texto)) return CATEGORIAS.monitor;
  if (/projetor/.test(texto)) return CATEGORIAS.projetor;
  if (/smartphone|celular|telefone/.test(texto)) return CATEGORIAS.telefonia;
  if (/access point|ponto de acesso|\bpoe\b|\bwi-?fi\b/.test(texto)) return CATEGORIAS.rede;
  if (/placa\s*(?:de\s*)?(?:video|m[aã]e)/.test(texto)) return CATEGORIAS.hardware;
  if (/notebook|\bpc\b|computador|desktop/.test(texto)) return CATEGORIAS.computador;
  return CATEGORIAS.periferico;
}

function normalizarSpecs(specs) {
  const resultado = {};
  for (const [chave, valor] of Object.entries(specs || {})) {
    const chaveNormalizada = String(chave).replace(/\./g, '_').replace(/^\$/, '_');
    if (['prototype', 'constructor', '__proto__'].includes(chaveNormalizada)) continue;
    resultado[chaveNormalizada] = String(valor);
  }
  return resultado;
}

function extrairProduto(url, html) {
  const $ = cheerio.load(html);
  const nome = $('h1').first().text().trim();
  const info = $('.product-info').text().replace(/\s+/g, ' ').trim();
  const textoSku = info.match(/SKU\s*:\s*([A-Z0-9-]+)/i);
  const codigoPauta = textoSku && textoSku[1];
  const marcaMatch = info.match(/Marca\s*:\s*([A-Z0-9 ._-]*?)(?=\s+(?:Código|SKU)\s*:)/i);
  const marca = marcaMatch ? marcaMatch[1].trim() : '';
  const descricao = $('.full-desc-Pro').first().text().replace(/\s+/g, ' ').trim();
  const specs = {};

  $('.product-features tr').each((_, row) => {
    const cells = $(row).find('th, td');
    if (cells.length < 2) return;
    const chave = $(cells[0]).text().replace(/\s+/g, ' ').trim();
    const valor = $(cells[cells.length - 1]).text().replace(/\s+/g, ' ').trim();
    if (chave && valor) specs[chave] = valor;
  });

  const imagemOriginal = $('meta[property="og:image"]').attr('content') || '';
  const imagem = imagemOriginal ? new URL(imagemOriginal, url).toString().replace(/^http:/, 'https:') : '';
  const modelo = specs.Modelo || specs['Part Number'] || '';
  const partNumber = specs['Part Number'] || modelo;
  const ean = String(specs.EAN || '').replace(/\D/g, '');

  if (!nome || !codigoPauta || !partNumber || !imagem) {
    throw new Error(`Dados obrigatórios ausentes em ${url}`);
  }

  const preco = PRECOS[codigoPauta];
  if (!preco) throw new Error(`Preço regional não mapeado para o SKU Pauta ${codigoPauta}`);

  return {
    url,
    nome,
    marca,
    codigoPauta,
    modelo,
    partNumber,
    ean,
    descricao,
    specs,
    imagem,
    categoriaSlug: categoriaPara(nome),
    ufCusto: preco.uf,
    custo: preco.custo,
    precoVenda: Math.round(preco.custo * (1 + MARGEM) * 100) / 100,
  };
}

async function carregarProdutos(urlsInformadas = []) {
  const urls = urlsInformadas.length
    ? urlsInformadas
    : fs.readFileSync(URLS_PATH, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const vistos = new Set();
  const produtos = [];

  for (const url of urls) {
    if (vistos.has(url)) throw new Error(`URL repetida: ${url}`);
    vistos.add(url);
    const { data } = await axios.get(url, {
      timeout: 25000,
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html' },
    });
    produtos.push(extrairProduto(url, data));
  }

  return produtos;
}

function encontrarExistente(produto, existentes) {
  if (produto.ean.length === 13) {
    const porEan = existentes.find((x) => String(x.barcode || '') === produto.ean);
    if (porEan) return porEan;
  }

  const identificador = normalizar(produto.partNumber || produto.modelo);
  if (identificador.length < 4) return null;
  const skuImportado = normalizar(`PAU-${slugify(produto.partNumber || produto.modelo).toUpperCase()}`);

  return existentes.find((x) => {
    const campos = [
      x.sku,
      x.manufacturerRef && x.manufacturerRef.model,
      x.barcode,
    ].map(normalizar).filter(Boolean);
    return campos.includes(identificador) || campos.includes(skuImportado);
  });
}

async function enviarImagem(produto) {
  const url = new URL(produto.imagem);
  if (url.hostname !== 'pauta.com.br') throw new Error(`Host de imagem não permitido: ${url.hostname}`);
  const { data, headers } = await axios.get(produto.imagem, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: 5 * 1024 * 1024,
  });
  const mime = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error(`Formato inválido para ${produto.nome}: ${mime}`);
  return storage.uploadImage(Buffer.from(data), `${produto.codigoPauta}.${mime.split('/')[1]}`, mime);
}

async function validarBanco(produtos) {
  await connectDB();
  try {
    const slugs = [...new Set(produtos.map((p) => p.categoriaSlug))];
    const categorias = await Category.find({ slug: { $in: slugs } }).lean();
    const categoriaPorSlug = new Map(categorias.map((x) => [x.slug, x]));
    const faltantes = slugs.filter((slug) => !categoriaPorSlug.has(slug));
    const semNome = faltantes.filter((slug) => !NOMES_CATEGORIAS[slug]);
    if (semNome.length) throw new Error(`Nome não mapeado para categorias: ${semNome.join(', ')}`);
    if (faltantes.length) console.log(`Categorias que serão criadas na execução: ${faltantes.join(', ')}`);

    const existentes = await Product.find({ type: 'produto' }).lean();
    const matches = produtos.map((p) => ({ produto: p, existente: encontrarExistente(p, existentes) }));
    const ids = matches.filter((x) => x.existente).map((x) => String(x.existente._id));
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidos.length) {
      const conflitantes = matches.filter((x) => x.existente && repetidos.includes(String(x.existente._id)));
      throw new Error(`Correspondências ambíguas: ${conflitantes.map((x) => `${x.produto.codigoPauta} -> ${x.existente.sku}`).join('; ')}`);
    }

    const skusExistentes = new Set(existentes.map((x) => x.sku));
    const colisaoSku = matches.filter((x) => !x.existente && skusExistentes.has(`PAU-${slugify(x.produto.partNumber).toUpperCase()}`));
    if (colisaoSku.length) throw new Error(`Colisão de SKU interno: ${colisaoSku.map((x) => x.produto.partNumber).join(', ')}`);

    const novos = matches.filter((x) => !x.existente).length;
    const atualizacoes = matches.length - novos;
    const manterImagens = matches.filter((x) => x.existente && (x.existente.images || []).some(Boolean)).length;
    console.log(`Pré-validação Mongo: ${matches.length} URLs, ${novos} novos, ${atualizacoes} atualizações, ${manterImagens} galerias existentes preservadas.`);
    return matches;
  } finally {
    await mongoose.disconnect();
  }
}

async function executar(produtos) {
  await connectDB();
  const categoriaPorSlug = new Map();
  for (const slug of new Set(produtos.map((p) => p.categoriaSlug))) {
    const nome = NOMES_CATEGORIAS[slug];
    if (!nome) throw new Error(`Nome não mapeado para a categoria: ${slug}`);
    const categoria = await Category.findOneAndUpdate(
      { slug },
      { $setOnInsert: { name: nome, slug, active: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    categoriaPorSlug.set(slug, categoria);
  }

  const existentes = await Product.find({ type: 'produto' });
  const combinacoes = produtos.map((p) => ({ produto: p, existente: encontrarExistente(p, existentes) }));
  const idsAlvo = combinacoes.filter((x) => x.existente).map((x) => String(x.existente._id));
  if (new Set(idsAlvo).size !== idsAlvo.length) throw new Error('Mais de uma URL corresponde ao mesmo produto existente.');
  const skusExistentes = new Set(existentes.map((x) => x.sku));
  for (const item of combinacoes) {
    const skuGerado = `PAU-${slugify(item.produto.partNumber).toUpperCase()}`;
    if (!item.existente && skusExistentes.has(skuGerado)) throw new Error(`SKU interno já usado por outro produto: ${skuGerado}`);
  }
  const tocados = combinacoes.filter((x) => x.existente).map((x) => x.existente);
  const backupPath = path.join(os.tmpdir(), `pauta-products-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(tocados.map((x) => x.toObject({ flattenMaps: true })), null, 2));
  console.log(`Backup dos produtos atualizados: ${backupPath}`);

  const imagensEnviadas = [];
  try {
    for (const item of combinacoes) {
      const imagensExistentes = item.existente && Array.isArray(item.existente.images)
        ? item.existente.images.filter(Boolean)
        : [];
      if (imagensExistentes.length) {
        item.imagens = imagensExistentes;
      } else {
        item.imagemR2 = await enviarImagem(item.produto);
        item.imagens = [item.imagemR2];
        imagensEnviadas.push(item.imagemR2);
      }
    }
  } catch (erro) {
    for (const url of imagensEnviadas) {
      try { await storage.deleteImage(url); } catch (_) {}
    }
    throw erro;
  }

  const resultados = [];
  for (const item of combinacoes) {
    const p = item.produto;
    const atual = item.existente;
    const imagens = [...new Set(item.imagens || [])].slice(0, MAX_IMAGENS);
    const skuGerado = `PAU-${slugify(p.partNumber).toUpperCase()}`;
    const sku = atual ? atual.sku : skuGerado;
    const slug = atual ? atual.slug : `${slugify(p.nome).slice(0, 90)}-${p.codigoPauta.toLowerCase()}`;
    const descricao = p.descricao || `${p.nome}. ${Object.entries(p.specs).filter(([k]) => !/garantia com a pauta/i.test(k)).map(([k, v]) => `${k}: ${v}`).join('. ')}`;
    const payload = {
      name: p.nome,
      slug,
      sku,
      type: 'produto',
      category: categoriaPorSlug.get(p.categoriaSlug)._id,
      brand: p.marca,
      price: p.precoVenda,
      cost: p.custo,
      promoPrice: null,
      stock: atual ? atual.stock : 0,
      onDemand: true,
      barcode: p.ean.length === 13 ? p.ean : (atual && atual.barcode) || null,
      description: descricao,
      shortDescription: descricao.slice(0, 280),
      images: imagens,
      specs: normalizarSpecs(p.specs),
      manufacturerRef: { model: p.partNumber, url: p.url, importedAt: new Date() },
      active: true,
    };

    if (atual) {
      await Product.findByIdAndUpdate(atual._id, payload, { runValidators: true });
      resultados.push({ action: 'updated', sku, name: p.nome });
    } else {
      await Product.create(payload);
      resultados.push({ action: 'created', sku, name: p.nome });
    }
  }

  await mongoose.disconnect();
  return { backupPath, resultados };
}

async function main() {
  const args = process.argv.slice(2);
  const executarAgora = args.includes('--execute');
  const modoPrevia = args.includes('--dry-run');
  if (executarAgora === modoPrevia) {
    throw new Error('Use exatamente um modo: --dry-run ou --execute.');
  }

  const urls = args.filter((arg) => !arg.startsWith('--'));
  const produtos = await carregarProdutos(urls);
  console.log(`Produtos lidos: ${produtos.length}`);
  for (const p of produtos) {
    console.log(`${p.codigoPauta}\t${p.marca}\t${p.partNumber}\t${p.ufCusto} custo=${p.custo.toFixed(2)} venda=${p.precoVenda.toFixed(2)}\t${p.categoriaSlug}\t${p.imagem ? 'imagem ok' : 'sem imagem'}\t${p.nome}`);
  }

  if (!executarAgora) {
    await validarBanco(produtos);
    return;
  }
  const resultado = await executar(produtos);
  console.log(`\nBackup dos produtos atualizados: ${resultado.backupPath}`);
  console.log(JSON.stringify(resultado.resultados, null, 2));
}

main().catch(async (erro) => {
  console.error('[import-pauta-urls] erro:', erro.message);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});