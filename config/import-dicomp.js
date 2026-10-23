require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const mongoose = require('mongoose');

const connectDB = require('./db');
const Category = require('../models/Category');
const Product = require('../models/Product');

const DEFAULT_OUTPUT = path.join(__dirname, '../migracao/dicomp-import.json');

function printHelp() {
  console.log(`Uso:\n  node config/import-dicomp.js --url "https://www.dicomp.com.br/categoria" --limit 20 --max-pages 3\n\nOpções:\n  --url, -u       URL inicial da página de categoria/produtos\n  --limit, -l     quantidade máxima de produtos a importar (padrão: 20)\n  --max-pages     páginas de categoria para percorrer (padrão: 1)\n  --category      nome/slug da categoria no banco (padrão: dicomp)\n  --output        arquivo JSON de saída (padrão: migracao/dicomp-import.json)\n  --csv           salva também em CSV\n  --dry-run       apenas extrai e salva em arquivo, sem gravar no MongoDB\n  --help          exibe esta ajuda\n`);
}

function parseArgs(argv) {
  const opts = {
    url: '',
    limit: 20,
    maxPages: 1,
    category: 'dicomp',
    output: DEFAULT_OUTPUT,
    csv: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--url' || arg === '-u') {
      opts.url = argv[i + 1] || '';
      i += 1;
    } else if (arg.startsWith('--url=')) {
      opts.url = arg.split('=').slice(1).join('=');
    } else if (arg === '--limit' || arg === '-l') {
      opts.limit = Number(argv[i + 1] || 20);
      i += 1;
    } else if (arg.startsWith('--limit=')) {
      opts.limit = Number(arg.split('=').slice(1).join('='));
    } else if (arg === '--max-pages') {
      opts.maxPages = Number(argv[i + 1] || 1);
      i += 1;
    } else if (arg.startsWith('--max-pages=')) {
      opts.maxPages = Number(arg.split('=').slice(1).join('='));
    } else if (arg === '--category') {
      opts.category = argv[i + 1] || 'dicomp';
      i += 1;
    } else if (arg.startsWith('--category=')) {
      opts.category = arg.split('=').slice(1).join('=') || 'dicomp';
    } else if (arg === '--output') {
      opts.output = argv[i + 1] || DEFAULT_OUTPUT;
      i += 1;
    } else if (arg.startsWith('--output=')) {
      opts.output = arg.split('=').slice(1).join('=') || DEFAULT_OUTPUT;
    } else if (arg === '--csv') {
      opts.csv = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (!arg.startsWith('-')) {
      if (!opts.url) opts.url = arg;
    }
  }

  return opts;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'dicomp';
}

function moneyToNumber(value) {
  if (!value) return 0;
  const match = String(value).match(/\d[\d.,]*/g);
  if (!match) return 0;
  const num = match.join('').replace('.', '').replace(',', '.');
  const parsed = Number(num);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeUrl(baseUrl, href) {
  if (!href) return null;
  const cleaned = String(href).trim();
  if (!cleaned || cleaned.startsWith('javascript:') || cleaned.startsWith('#')) return null;
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch (error) {
    return null;
  }
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function extractTextFromSelector($, selectors) {
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text) return text;
  }
  return '';
}

function extractMetaContent($, attrName) {
  const selector = `meta[${attrName}]`;
  const value = $(selector).first().attr(attrName);
  return value ? String(value).trim() : '';
}

function parseJsonLdProduct($, url) {
  const blocks = $('script[type="application/ld+json"]').toArray();

  for (const block of blocks) {
    const raw = $(block).html();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidates = [];
      const push = (node) => {
        if (!node) return;
        if (Array.isArray(node)) node.forEach(push);
        else if (typeof node === 'object') candidates.push(node);
      };
      push(parsed);

      for (const item of candidates) {
        const type = item['@type'];
        if (type === 'Product' || type === 'ItemList' || type === 'Offer') {
          const name = item.name || (item.headline || '');
          const description = item.description || '';
          const sku = item.sku || item.productID || item.mpn || '';
          const brand = item.brand && (item.brand.name || item.brand);
          const image = Array.isArray(item.image) ? item.image[0] : item.image || '';
          let price = item.offers && (item.offers.price || item.offers.lowPrice || item.offers.highPrice || item.offers[0]?.price || item.offers[0]?.lowPrice || '');
          if (!price && item.offers && typeof item.offers === 'object') {
            price = item.offers.price || item.offers.lowPrice || item.offers.highPrice || '';
          }
          if (name || sku || description || image || price) {
            return {
              name: String(name || '').trim(),
              description: String(description || '').trim(),
              sku: String(sku || '').trim(),
              brand: String(brand || '').trim(),
              image: typeof image === 'string' ? image : '',
              price: String(price || '').trim(),
              url,
            };
          }
        }
      }
    } catch (error) {
      // ignora JSON-LD malformado
    }
  }

  return null;
}

function extractProductFromHtml(html, url) {
  const $ = cheerio.load(html);

  const jsonLdProduct = parseJsonLdProduct($, url);

  const name = jsonLdProduct?.name || extractTextFromSelector($, ['h1', '.product-name', '.product-title', '[itemprop="name"]', '.titulo-produto']) || $('meta[property="og:title"]').attr('content') || $('title').text();
  const description = jsonLdProduct?.description || $('meta[name="description"]').attr('content') || extractTextFromSelector($, ['.product-description', '.descricao-produto', '[itemprop="description"]', '.product-info', '.description']) || '';
  const sku = jsonLdProduct?.sku || $('meta[itemprop="sku"]').attr('content') || $('meta[name="sku"]').attr('content') || extractTextFromSelector($, ['[data-sku]', '.sku', '.codigo', '.product-sku', '.reference']) || '';
  const brand = jsonLdProduct?.brand || extractTextFromSelector($, ['[itemprop="brand"]', '.brand', '.marca', '.product-brand']) || $('meta[property="article:author"]').attr('content') || '';
  const category = extractTextFromSelector($, ['.breadcrumb a', '.breadcrumbs a', '.categoria', '.category']) || $('meta[name="category"]').attr('content') || '';

  const priceValue = jsonLdProduct?.price || $('meta[itemprop="price"]').attr('content') || $('meta[property="product:price:amount"]').attr('content') || extractTextFromSelector($, ['.price', '.product-price', '.preco', '.valor', '[data-price]', '.current-price', '.amount']) || '';

  const imageCandidates = [];
  $('img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src') || $(img).attr('data-original');
    if (!src) return;
    const normalized = normalizeUrl(url, src);
    if (!normalized) return;
    if (/\.(png|jpg|jpeg|webp|gif|avif)(\?|$)/i.test(normalized)) imageCandidates.push(normalized);
  });

  const images = unique(imageCandidates).slice(0, 12);

  const result = {
    name: String(name || '').trim(),
    description: String(description || '').replace(/\s+/g, ' ').trim(),
    sku: String(sku || '').trim(),
    brand: String(brand || '').trim(),
    category: String(category || '').trim(),
    price: moneyToNumber(priceValue),
    images,
    sourceUrl: url,
  };

  if (!result.name && !result.sku && !result.description) {
    return null;
  }

  return result;
}

function collectProductLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const candidates = new Set();

  const selectors = [
    'a[href]',
    '.product a',
    '.product-card a',
    '.item-product a',
    '.produtos a',
    '.card-produto a',
    'article a',
    'li.product a',
  ];

  $(selectors.join(', ')).each((_, el) => {
    const href = $(el).attr('href');
    const url = normalizeUrl(baseUrl, href);
    if (!url) return;
    const lower = url.toLowerCase();
    if (!/(produto|product|p\/|item|sku|detalhe)/i.test(lower) && !/\.(html|php|aspx|jsp)/i.test(lower)) {
      return;
    }
    if (!/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(lower)) {
      candidates.add(url);
    }
  });

  const structuredLinks = [];
  $('script[type="application/ld+json"]').each((_, block) => {
    const raw = $(block).html();
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      const queue = [data];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        if (node.url && typeof node.url === 'string' && /^https?:/i.test(node.url)) {
          structuredLinks.push(node.url);
        }
        if (Array.isArray(node)) {
          queue.push(...node);
        } else {
          Object.values(node).forEach((value) => {
            if (value && typeof value === 'object') queue.push(value);
          });
        }
      }
    } catch (error) {
      // ignora JSON-LD inválido
    }
  });

  const combined = [...candidates, ...structuredLinks];
  return unique(
    combined
      .filter((link) => !link.includes('javascript:'))
      .filter((link) => !/\.(png|jpg|jpeg|gif|webp|svg|ico)(\?|$)/i.test(link))
      .filter((link) => link.includes('/'))
  ).slice(0, 150);
}

function collectNextPages(baseUrl, html) {
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const link = normalizeUrl(baseUrl, href);
    if (!link) return;
    const lower = link.toLowerCase();
    if (/page|pagina|p=|pg=|&page=|&pagina=/.test(lower) || /\?p=\d+/.test(link) || /\?pagina=\d+/.test(link)) {
      links.add(link);
    }
  });
  return [...links];
}

async function fetchHtml(url) {
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return response.data;
}

function stripQuery(url) {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

async function discoverProducts(startUrl, maxPages = 1, limit = 20) {
  const visited = new Set();
  const queue = [startUrl];
  const productUrls = new Set();
  const pageUrls = new Set();

  while (queue.length && pageUrls.size < maxPages + 1) {
    const currentUrl = queue.shift();
    if (!currentUrl || visited.has(stripQuery(currentUrl))) continue;
    visited.add(stripQuery(currentUrl));

    try {
      const html = await fetchHtml(currentUrl);
      const linkList = collectProductLinksFromHtml(html, currentUrl);

      for (const productUrl of linkList) {
        if (productUrls.size >= limit) break;
        const normalized = stripQuery(productUrl);
        if (normalized) productUrls.add(normalized);
      }

      if (productUrls.size >= limit) break;

      const nextPages = collectNextPages(currentUrl, html);
      for (const pageUrl of nextPages) {
        if (!pageUrls.has(stripQuery(pageUrl))) {
          if (pageUrls.size < maxPages) {
            queue.push(pageUrl);
            pageUrls.add(stripQuery(pageUrl));
          }
        }
      }
    } catch (error) {
      console.warn(`Falha ao acessar ${currentUrl}: ${error.message}`);
    }
  }

  return [...productUrls].slice(0, limit);
}

async function saveJson(outputPath, products) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(products, null, 2), 'utf-8');
}

function saveCsv(outputPath, products) {
  const headers = ['name', 'brand', 'sku', 'category', 'price', 'images', 'sourceUrl'];
  const rows = products.map((product) => [
    product.name || '',
    product.brand || '',
    product.sku || '',
    product.category || '',
    String(product.price || 0),
    Array.isArray(product.images) ? product.images.join('; ') : '',
    product.sourceUrl || '',
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  fs.writeFileSync(outputPath, csv, 'utf-8');
}

async function upsertProductsInMongo(products, categoryName) {
  if (!process.env.MONGO_URI) {
    console.log('[Mongo] MONGO_URI ausente; pulando gravação no banco.');
    return;
  }

  await connectDB();

  const categorySlug = slugify(categoryName || 'dicomp');
  const category = await Category.findOneAndUpdate(
    { slug: categorySlug },
    {
      name: categoryName || 'DICOMP',
      slug: categorySlug,
      description: 'Produtos importados automaticamente da DICOMP.',
      active: true,
    },
    { upsert: true, new: true }
  );

  let created = 0;
  let updated = 0;

  for (const product of products) {
    const finalSku = String(product.sku || product.name || `${categorySlug}-${Date.now()}`).trim();
    const slug = slugify(`${product.name || 'produto'}-${finalSku}`);
    const payload = {
      name: product.name || 'Produto DICOMP',
      slug,
      sku: finalSku,
      type: 'produto',
      category: category._id,
      brand: product.brand || 'DICOMP',
      price: Number(product.price || 0),
      cost: 0,
      stock: 0,
      description: product.description || '',
      shortDescription: (product.description || '').slice(0, 280),
      images: Array.isArray(product.images) ? product.images : [],
      active: true,
      manufacturerRef: {
        model: product.sku || product.name || '',
        url: product.sourceUrl || '',
        importedAt: new Date(),
      },
    };

    const existing = await Product.findOne({ sku: finalSku });
    if (existing) {
      await Product.updateOne({ _id: existing._id }, payload);
      updated += 1;
    } else {
      await Product.create(payload);
      created += 1;
    }
  }

  console.log(`[Mongo] importados: ${created} criados, ${updated} atualizados.`);
  await mongoose.disconnect();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  if (!options.url) {
    printHelp();
    console.error('\nErro: informe a URL inicial com --url ou como argumento.');
    process.exit(1);
  }

  const productUrls = await discoverProducts(options.url, options.maxPages, options.limit);
  if (!productUrls.length) {
    console.error('[dicomp] Nenhum produto encontrado na URL informada. Verifique a página e os seletores.');
    process.exit(1);
  }

  const products = [];
  for (const productUrl of productUrls) {
    try {
      const html = await fetchHtml(productUrl);
      const product = extractProductFromHtml(html, productUrl);
      if (!product) continue;
      if (!product.name) continue;
      product.category = product.category || options.category;
      products.push(product);
    } catch (error) {
      console.warn(`[dicomp] falha ao processar ${productUrl}: ${error.message}`);
    }
  }

  const uniqueProducts = unique(products.map((p) => `${p.sku || p.name}-${p.sourceUrl}`)).map((key) => {
    const selected = products.find((p) => `${p.sku || p.name}-${p.sourceUrl}` === key);
    return selected;
  });

  const outputPath = path.resolve(options.output);
  await saveJson(outputPath, uniqueProducts);
  console.log(`[dicomp] ${uniqueProducts.length} produtos salvos em ${outputPath}`);

  if (options.csv) {
    const csvPath = outputPath.replace(/\.json$/i, '.csv');
    saveCsv(csvPath, uniqueProducts);
    console.log(`[dicomp] CSV salvo em ${csvPath}`);
  }

  if (!options.dryRun) {
    await upsertProductsInMongo(uniqueProducts, options.category);
  } else {
    console.log('[dicomp] modo dry-run: sem gravação no MongoDB.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[dicomp] erro fatal:', error);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  extractProductFromHtml,
  discoverProducts,
  main,
};
