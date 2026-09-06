/**
 * Importador de dados da Intelbras.
 *
 * Duas fontes oficiais, em ordem:
 *   1) API pública da loja oficial (VTEX) — devolve JSON estruturado
 *      (imagens, descrição, link) para produtos da loja on-line.
 *      A busca do site intelbras.com é renderizada por JS, então a API
 *      da VTEX é o atalho para o catálogo comercial.
 *   2) Site institucional intelbras.com — fallback para produtos fora da
 *      loja VTEX (ex.: NVRs). Usa o sitemap.xml para resolver o slug por
 *      modelo e raspa a página (renderizada no servidor).
 *
 * Apenas hosts Intelbras/VTEX são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const API =
  'https://intelbras.vtexcommercestable.com.br/api/catalog_system/pub/products/search';
const SITE = 'https://www.intelbras.com/pt-br';
const SITEMAP = 'https://www.intelbras.com/sitemap.xml';
const HOSTS_IMAGENS = new Set(['intelbras.vteximg.com.br', 'backend.intelbras.com']);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function limparHtml(texto) {
  return String(texto || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Fonte 1: loja VTEX ----------

async function getJson(query) {
  const url = `${API}/?${query}`;
  const { data } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    timeout: 20000,
  });
  return Array.isArray(data) ? data : [];
}

function obterViaVtex(lista, q) {
  if (!lista || !lista.length) return null;
  const p = lista[0];
  const item = p.items && p.items[0];
  const imagens = (item && item.images ? item.images : [])
    .map((i) => (i.imageUrl || '').split('?')[0])
    .filter(Boolean);
  const galeria = imagens.slice(1, 4); // principal + até 3 da galeria

  return {
    url: /^https?:\/\//i.test(p.link || '')
      ? p.link
      : `https://intelbras.vtexcommercestable.com.br${p.link || ''}`,
    nome: p.productName || '',
    descricao: limparHtml(p.description),
    imagemPrincipal: imagens[0] || '',
    galeria,
    filtrarPorModelo: false, // a API já filtra; engine não precisa re-filtrar
  };
}

// ---------- Fonte 2: site institucional (sitemap + página) ----------

let sitemapCache = null;
let sitemapCacheAt = 0;
const TTL_SITEMAP = 60 * 60 * 1000; // 1h

async function pegarSitemap() {
  if (sitemapCache && Date.now() - sitemapCacheAt < TTL_SITEMAP) return sitemapCache;
  const { data } = await axios.get(SITEMAP, {
    headers: { 'user-agent': UA, accept: 'text/xml' },
    timeout: 25000,
  });
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(data)) !== null) urls.push(m[1]);
  sitemapCache = urls.filter((u) => u.startsWith(SITE));
  sitemapCacheAt = Date.now();
  return sitemapCache;
}

// Acha a página oficial no sitemap cujo slug contenha o modelo (ex.: nvd-1432).
async function resolverNoSite(modelo) {
  const chave = normalizar(modelo);
  if (!chave) return null;
  const urls = await pegarSitemap();
  return urls.find((u) => normalizar(u).includes(chave)) || null;
}

function tokenDaPagina(url) {
  // slug "gravador-digital-32-canais-ip-nvd-1432" -> token "nvd1432"
  const slug = (url.split('/').filter(Boolean).pop() || '').split('.')[0];
  const partes = slug.split('-');
  return normalizar(partes.slice(-2).join('-'));
}

async function obterViaSite(url) {
  const { data: html } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeout: 25000,
  });
  const $ = cheerio.load(html);
  const token = tokenDaPagina(url);

  // As fotos do produto aparecem em atributos/JSON do HTML, não só em <img>:
  // captura todas as URLs de arquivos oficiais no texto da página.
  const re = /https:\/\/backend\.intelbras\.com\/sites\/default\/files\/[^"'\s>]+\.(png|jpe?g|webp)/gi;
  const todas = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const limpa = m[0];
    if (!todas.includes(limpa)) todas.push(limpa);
  }

  // Link que se tornou página de "Ajuda e downloads" (produto descontinuado):
  // ainda assim aproveita a foto oficial que cita o modelo, sem nome/descrição.
  const titulo = $('h1').first().text().trim() || $('title').text().trim();
  const ehAjuda = /ajuda|downloads/i.test(titulo);

  const naoProduto = /(banner|logo|icone|icon|vitrine|finep|certificado)/i;
  const candidatas = todas.filter((u) => !/\/styles\//.test(u) && !naoProduto.test(u));

  let galeria = candidatas.filter((u) => normalizar(u).includes(token));
  if (ehAjuda) {
    if (!galeria.length) return null; // página de ajuda sem foto do modelo
    return {
      url,
      nome: '',
      descricao: '',
      imagemPrincipal: galeria[0],
      galeria: galeria.slice(1),
      filtrarPorModelo: false,
    };
  }
  if (!galeria.length) galeria = candidatas; // fallback: qualquer imagem oficial

  return {
    url,
    nome: titulo,
    descricao: $('meta[property="og:description"]').attr('content') || '',
    imagemPrincipal: galeria[0] || '',
    galeria: galeria.slice(1),
    filtrarPorModelo: false,
  };
}

// ---------- Orquestração ----------

async function obter(modelo) {
  const q = String(modelo || '').trim();
  if (!q) return null;
  const chaveNumerica = normalizar(q);

  // 1) Loja VTEX (código/RefId do produto, EAN, ou busca textual)
  let lista = await getJson(`fq=alternateIds_RefId:${encodeURIComponent(q)}`);
  if (!lista.length && /^\d+$/.test(chaveNumerica)) {
    lista = await getJson(`fq=alternateIds_Ean:${q}`);
  }
  if (!lista.length) {
    lista = await getJson(`ft=${encodeURIComponent(q)}&_from=0&_to=8`);
  }
  const viaVtex = obterViaVtex(lista, q);
  if (viaVtex) return viaVtex;

  // 2) Site institucional (sitemap + página renderizada no servidor)
  const urlSite = await resolverNoSite(q);
  if (urlSite) {
    try {
      const viaSite = await obterViaSite(urlSite);
      return viaSite && viaSite.imagemPrincipal ? viaSite : null;
    } catch (e) {
      console.warn(`  [intelbras] falha ao raspar ${urlSite}: ${e.message}`);
      return null;
    }
  }

  return null;
}

module.exports = { obter, HOSTS_IMAGENS };