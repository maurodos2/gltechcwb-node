/**
 * Importador de dados do site oficial da TP-Link (site Brasil).
 *
 * Fluxo:
 *   1) buscar(modelo) — usa a busca interna do site para resolver a URL
 *      oficial do produto a partir do número do modelo (ex.: TL-WA850RE).
 *   2) extrair(url)   — lê a página do produto e devolve imagem principal,
 *      galeria, descrição e nome oficiais.
 *
 * Apenas hosts da própria TP-Link são consultados/baixados (SSRF-safe).
 */
const axios = require('axios');
const cheerio = require('cheerio');

const SITE = 'https://www.tp-link.com';
const HOSTS_IMAGENS = new Set(['static.tp-link.com', 'www.tp-link.com', 'tp-link.com']);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function get(url) {
  const { data } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    timeout: 20000,
  });
  return data;
}

function normalizarModelo(modelo) {
  return String(modelo || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Procura o produto na busca oficial e devolve a URL completa ou null.
async function buscar(modelo) {
  const q = String(modelo || '').trim();
  if (!q) return null;
  const chave = normalizarModelo(q);

  const html = await get(`${SITE}/br/search/?q=${encodeURIComponent(q)}`);
  const $ = cheerio.load(html);

  let url = null;
  $('a[href]').each((i, el) => {
    if (url) return;
    const href = $(el).attr('href') || '';
    // links de produto: /br/<familia>/<subfamilia>/<slug>/
    const m = href.match(/^\/br\/(home-networking|business-networking)\/[^/]+\/[^/]+\/$/);
    if (!m) return;
    const slug = normalizarModelo(href);
    if (slug && slug.includes(chave)) url = href;
  });

  return url ? `${SITE}${url}` : null;
}

// Lê a página do produto e devolve os dados solicitados.
async function extrair(url) {
  const html = await get(url);
  const $ = cheerio.load(html);

  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const descricao = $('meta[property="og:description"]').attr('content') || '';
  const nome = ($('h1').first().text() || $('title').text() || '').trim();

  // Galeria: imagens oficiais hospedadas na static.tp-link.com
  const galeria = [];
  const jaVistas = new Set();
  $('img[data-src], img[src]').each((i, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src') || '';
    if (!/\.(jpe?g|png|webp)$/i.test(src)) return;
    let host;
    try {
      host = new URL(src, SITE).hostname;
    } catch (e) {
      return;
    }
    if (!HOSTS_IMAGENS.has(host)) return;
    const normalizada = src.split('#')[0];
    if (jaVistas.has(normalizada)) return;
    jaVistas.add(normalizada);
    galeria.push(normalizada);
  });

  return {
    url,
    nome,
    descricao,
    imagemPrincipal: ogImage || galeria[0] || '',
    galeria,
  };
}

// Contrato da engine de importação: resolve o produto por modelo e devolve
// { url, nome, descricao, imagemPrincipal, galeria } ou null.
async function obter(modelo) {
  const url = await buscar(modelo);
  if (!url) return null;
  const dados = await extrair(url);
  return { ...dados, url, filtrarPorModelo: true };
}

module.exports = { buscar, extrair, obter, HOSTS_IMAGENS };