/**
 * Importa o catálogo de dropshipping da Agis (distribuidora) para a loja.
 *
 * Fonte: tabela de preços baixada do portal Agis (CSV com ID/descrição/link/preço).
 * Para cada item da linha selecionada: baixa a página de produto (HTML estático
 * do Magento), extrai nome, descrição, specs e a foto principal, sobe a imagem
 * no R2 e grava o Product com:
 *   - onDemand = true (sob encomenda — sem estoque físico, checkout liberado)
 *   - price    = custo × MARKUP (2.0)
 *   - cost     = preço da tabela Agis (Preço_ES)
 *
 * Uso:
 *   node config/import-agis.js [--linha nobreak|monitor|leitor|impressora|headset|rede|memoria|tudo] [--apenas-csv]
 *
 * Idempotente: upsert por SKU e por slug. Só baixa a página/foto quando o
 * produto ainda não existe ou quando --forcar é passado.
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Category = require('../models/Category');
const Product = require('../models/Product');
const storage = require('../lib/storage');
const axios = require('axios');
const cheerio = require('cheerio');

const CSV = process.env.AGIS_CSV || 'public/table_price_PR_table_price.csv';
const MARKUP = parseFloat(process.env.AGIS_MARKUP || 1.4);
const MAX_IMAGENS = 3;
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HOST_IMAGEM = 'vendas.agis.com.br';

// As linhas do portfólio: chave -> { nomeCategoria, slugCategoria, test(desc) }
// Seleção segmentada por produto de foco consumer (levantamento-agis.md),
// totalizando ~243 itens na tabela do dia 12/09/2026.
const LINHAS = {
  nobreak: {
    categoria: 'Nobreaks e Energia',
    slugCategoria: 'nobreaks-e-energia',
    test: /nobreak\s+(intelbras xnb|intelbras attiv|apc back-ups|sms lite|sms tech|sms miraje|sms mirage)/i,
  },
  monitor: {
    categoria: 'Monitores',
    slugCategoria: 'monitores',
    test: /^monitor\s+(aoc|lg|samsung|philips|lenovo|hp|dell|acer|gamer\s+(aoc|lg|samsung|acer|philips|lenovo|hp|dell))\b/i,
  },
  leitor: {
    categoria: 'Leitores e PDV',
    slugCategoria: 'leitores-e-pdv',
    test: /leitor de c(o|ó)digo de barras|leitor de codigo/i,
  },
  impressora: {
    categoria: 'Suprimentos e Impressão',
    slugCategoria: 'suprimentos-e-impressao',
    test: /impressora\s+(laser|termica|t(é|e)rmica|ecotank|hpl|brother|epson|hp)|rotulador\s+brother|cilindro\s+brother|refil\s+de\s+tinta|fita\s+brother/i,
  },
  headset: {
    categoria: 'Periféricos e Acessórios',
    slugCategoria: 'perifericos-e-acessorios',
    test: /headset\s+(logitech|dell|poly|hp|jabra|plantronics)/i,
  },
  rede: {
    categoria: 'Infraestrutura e Redes',
    slugCategoria: 'infraestrutura-e-redes',
    test: /fonte\s+poe|injetor\s+poe|switch\s+ubiquiti|switch\s+tp-link|protetor\s+de\s+surto\s+ubiquiti|unifi\s+flex\b|unifi\s+ultra\b/i,
  },
  memoria: {
    categoria: 'Armazenamento e Memória',
    slugCategoria: 'armazenamento-e-memoria',
    test: /mem[oó]ria\s+(patriot|adata)/i,
  },
};

function slugify(text) {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 90);
}

// Preços da tabela Agis vêm em reais com ponto como separador decimal
// (ex.: "487" = R$487,00; "645.4" = R$645,40; "74.02" = R$74,02).
// A loja grava price/cost em REAIS (não centavos) — formatPrice divide por 100.
function parsePrice(s) {
  if (!s || !s.trim()) return null;
  const v = parseFloat(String(s).trim().replace(',', '.'));
  if (isNaN(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}
function parseCsvRobust() {
  const raw = fs.readFileSync(CSV, 'utf-8').replace(/^\uFEFF/, '');
  const lines = raw.trim().split('\n');
  const header = splitLine(lines[0]);
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = splitLine(lines[i]);
    if (fields.length < 5) continue;
    items.push({
      id: fields[0].trim(),
      desc: fields[1],
      url: fields[2],
      precoEs: parsePrice(fields[4]),
      precoSp: parsePrice(fields[3]),
    });
  }
  return items;
}

function splitLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

async function ensureCategory(slugCategoria, nomeCategoria) {
  const doc = await Category.findOneAndUpdate(
    { slug: slugCategoria },
    { name: nomeCategoria, slug: slugCategoria, active: true },
    { upsert: true, new: true }
  );
  return doc._id;
}

async function fetchProductPage(url) {
  try {
    const resp = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: TIMEOUT_MS, maxRedirects: 5 });
    if (resp.status !== 200) return null;
    return resp.data;
  } catch (e) {
    console.warn(`  [agis] falha HTTP ${e.message}`);
    return null;
  }
}

function extractProduct(html) {
  const $ = cheerio.load(html);
  // Nome: h1 do título do produto
  let name = $('h1').first().text().trim();
  if (!name) name = $('.page-title span, .product-info-main h1').first().text().trim();
  if (!name) return null;

  // Foto principal — src do placeholder da galeria (presente no HTML estático)
  let imageUrl = $('img.gallery-placeholder__image').first().attr('src') || null;
  if (!imageUrl) {
    const og = $('meta[property="og:image"]').first().attr('content');
    if (og) imageUrl = og;
  }
  if (imageUrl) {
    imageUrl = imageUrl.split('?')[0]; // remove query de otimização (medium)
  }

  // Descrição — tab "Descrição" do Magento (atributo ou seção #description).
  // Alguns produtos da Agis têm a tab vazia; nesse caso fica sem descrição mesmo.
  let description = '';
  const $value = $('div.product.attribute.description div.value, div#description[data-role="content"]')
    .first();
  if ($value.length) {
    $value.find('script, style, .overflow-magnifier').remove();
    const txt = $value.text().trim();
    // descarta resultados parasitas (labels de navegação, JS, "SKU#:")
    if (txt.length > 10 && !/^(SKU#|Televendas|Intermedia|Olá)/.test(txt)) description = txt;
  }
  description = description
    .replace(/^SKU#:\s*\d+\s*/i, '') // prefixo "SKU#: 4822202"
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);

  // Specs — tabela de atributos th/td
  const specs = {};
  $('table tr').each((_, tr) => {
    const th = $(tr).find('th').first().text().trim();
    const td = $(tr).find('td').first().text().trim();
    if (th && td) specs[th] = td;
  });
  return { name, imageUrl, description, specs };
}

// Baixa e sobe a imagem no R2, devolve URL pública.
async function importImage(url) {
  try {
    const host = new URL(url).hostname;
    if (host !== HOST_IMAGEM) return null;
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'User-Agent': UA },
      timeout: TIMEOUT_MS,
      maxContentLength: 6 * 1024 * 1024,
    });
    const buf = Buffer.from(resp.data);
    const mime = String(resp.headers['content-type'] || '').split(';')[0].trim();
    const nome = url.split('/').pop() || 'produto.jpg';
    return await storage.uploadImage(buf, nome, mime);
  } catch (e) {
    return null;
  }
}

function round2(n) { return Math.round(n * 100) / 100; }

async function importItem(item, categorias, opts) {
  const linha = opts.linha;
  // Custo base (prefere ES, é o que está preenchido)
  const custo = item.precoEs;
  if (!custo || custo <= 0) return { sku: item.id, status: 'sem-preco' };

  // Nome base vem do CSV; depois refinamos com o scrape
  const nomeBase = item.desc.trim();
  const skuAgis = item.id;
  const slug = slugify(nomeBase);

  let existing = await Product.findOne({ $or: [{ sku: skuAgis }, { slug }] });
  if (existing && !opts.forcar) {
    return { sku: skuAgis, status: 'ja-existe' };
  }

  // Busca página do produto para nome/desc/foto
  const html = await fetchProductPage(item.url);
  let nome = nomeBase;
  let descricao = '';
  let imageUrl = null;
  let specs = {};
  if (html) {
    const dados = extractProduct(html);
    if (dados) {
      if (dados.name && dados.name.length > 6) nome = dados.name;
      descricao = dados.description || '';
      imageUrl = dados.imageUrl;
      specs = Object.fromEntries(Object.entries(dados.specs || {}).filter(([k, v]) => !/enable product/i.test(k)));
    }
  }

  // Marca vem da ficha técnica (ex.: "Fabricante = Intelbras")
  const marca = String((specs['Fabricante'] || specs['Marca'] || '').toString()).trim()
    .replace(/\s+/g, ' ').slice(0, 40) || '';

  // Imagem -> R2
  const imagens = [];
  if (imageUrl) {
    const urlR2 = await importImage(imageUrl);
    if (urlR2) imagens.push(urlR2);
  }

  // Produto sem foto principal (página 404/descontinuado ou sem imagem) não entra no catálogo.
  if (!existing && imagens.length === 0) {
    return { sku: skuAgis, status: 'sem-imagem' };
  }

  const precoVenda = round2(custo * MARKUP);
  const barcode = specs['EAN'] ? String(specs['EAN']).replace(/\D/g, '') || null : null;

  const payload = {
    name: nome.slice(0, 160),
    slug,
    sku: skuAgis,
    type: 'produto',
    category: categoriaId(categorias, linha),
    brand: marca,
    price: precoVenda,
    cost: custo,
    promoPrice: null,
    stock: 0,
    onDemand: true,
    barcode,
    description: descricao,
    shortDescription: descricao ? descricao.slice(0, 280) : '',
    images: imagens,
    specs,
    active: true,
    manufacturerRef: { model: skuAgis, url: item.url, importedAt: new Date() },
  };

  if (existing) {
    // preserva dados já existentes quando a nova página não traz informação
    if (existing.brand) payload.brand = existing.brand;
    if (!payload.barcode && existing.barcode) payload.barcode = existing.barcode;
    if (imagens.length === 0 && existing.images && existing.images.length) payload.images = existing.images;
    if (!descricao && existing.description) payload.description = existing.description;
    await Product.updateOne({ _id: existing._id }, payload);
    return { sku: skuAgis, status: 'atualizado', nome };
  }
  await Product.create(payload);
  return { sku: skuAgis, status: 'criado', nome };
}

function categoriaId(categorias, linha) {
  const l = LINHAS[linha];
  if (!l || !categorias[l.slugCategoria]) return null;
  return categorias[l.slugCategoria];
}

async function main() {
  await connectDB();
  const args = process.argv.slice(2);
  const opts = {};
  const linhaArg = args.find((a) => a.startsWith('--linha='));
  const linha = linhaArg ? linhaArg.split('=')[1] : 'tudo';
  opts.linha = linha;
  opts.forcar = args.includes('--forcar');

  if (linha !== 'tudo' && !LINHAS[linha]) {
    console.error('Linha inválida. Opções:', Object.keys(LINHAS).join(', '), 'ou tudo');
    process.exit(1);
  }

  const items = parseCsvRobust();
  console.log(`[agis] ${items.length} itens na tabela. Custo médio? Procurando linha "${linha}"...`);

  // Upsert de categorias usadas pelas linhas
  const categorias = {};
  const linhasSelecionadas = linha === 'tudo' ? Object.keys(LINHAS) : [linha];
  for (const key of linhasSelecionadas) {
    const l = LINHAS[key];
    // só cria categorias se de fato houver itens dessa linha
    const hasItem = items.some((i) => l.test.test(i.desc));
    if (hasItem) {
      categorias[l.slugCategoria] = await ensureCategory(l.slugCategoria, l.categoria);
    }
  }

  // Filtra os itens da linha selecionada
  const candidatos = [];
  for (const item of items) {
    for (const key of linhasSelecionadas) {
      if (item.precoEs && LINHAS[key].test.test(item.desc)) {
        candidatos.push({ item, linha: key });
        break;
      }
    }
  }
  console.log(`[agis] ${candidatos.length} itens de ${linhasSelecionadas.length} linha(s) para importar.`);

  const resultados = { criado: 0, atualizado: 0, jaExiste: 0, semPreco: 0, semImagem: 0, erro: 0 };
  const detalhes = [];

  for (let i = 0; i < candidatos.length; i++) {
    const { item, linha: l } = candidatos[i];
    try {
      const r = await importItem(item, categorias, { linha: l, forcar: opts.forcar });
      detalhes.push(r);
      if (r.status === 'criado') resultados.criado++;
      else if (r.status === 'atualizado') resultados.atualizado++;
      else if (r.status === 'ja-existe') resultados.jaExiste++;
      else if (r.status === 'sem-preco') resultados.semPreco++;
      else if (r.status === 'sem-imagem') resultados.semImagem++;
      else resultados.erro++;
    } catch (e) {
      resultados.erro++;
      detalhes.push({ sku: item.id, status: 'erro', motivo: e.message });
      console.warn(`  [agis] ERRO ${item.id}: ${e.message}`);
    }
    // paciência básica para não estourar o site da Agis
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 400));
    process.stdout.write(`  progresso ${i + 1}/${candidatos.length}\r`);
  }
  console.log('\n[agis] resultado:', resultados);

  const resumo = fs.existsSync('agis-import-relatorio.json')
    ? JSON.parse(fs.readFileSync('agis-import-relatorio.json', 'utf-8'))
    : [];
  fs.writeFileSync('agis-import-relatorio.json', JSON.stringify([...resumo, ...detalhes], null, 2));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });