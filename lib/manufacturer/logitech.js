/**
 * Importador de dados da Logitech.
 *
 * Fontes oficiais:
 *   - sitemap.xml resolve o slug do produto pelo modelo (ex.: M185).
 *   - A página do shop em pt-BR espelha a URL em en-us (via hreflang);
 *     dela saem og:title/og:description em português.
 *   - Fotos oficiais em resource.logitech.com (remove o prefixo de
 *     transform do CDN para pegar a original).
 *
 * Apenas hosts Logitech são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');
const cheerio = require('cheerio');

const SITEMAP = 'https://www.logitech.com/sitemap.xml';
const HOSTS_IMAGENS = new Set(['resource.logitech.com']);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
  sitemapCache = urls.filter((u) => /\/shop\/p\//.test(u));
  sitemapCacheAt = Date.now();
  return sitemapCache;
}

async function getHtml(url) {
  const { data } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeout: 25000,
  });
  return data;
}

// Extrai as URLs originais das fotos (sem o prefixo de transform do CDN).
// Ignora as imagens globais de homepage (og:image padrão) e prioriza as que
// citam o modelo do produto.
function coletarImagens(html, token) {
  const re =
    /https:\/\/resource\.logitech\.com\/[^"'\s>]*\/content\/dam\/logitech\/[^"'\s>]+\.(png|jpe?g|webp)/gi;
  const vistos = new Set();
  const comToken = [];
  const demais = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const idx = m[0].indexOf('/content/dam/logitech/');
    if (idx < 0) continue;
    const path = m[0].slice(idx);
    if (/\/homepage\//.test(path) || /delorean/.test(path)) continue; // og padrão do site
    const origem = `https://resource.logitech.com${path}`;
    if (vistos.has(origem)) continue;
    vistos.add(origem);
    (token && path.toLowerCase().includes(token) ? comToken : demais).push(origem);
  }
  return comToken.concat(demais);
}

async function obter(modelo) {
  const chave = normalizar(modelo);
  if (!chave) return null;

  const urls = await pegarSitemap();
  const cand = urls.find((u) => {
    const slug = (u.split('/shop/p/')[1] || '').split('/')[0];
    return normalizar(slug).includes(chave);
  });
  if (!cand) return null;

  const urlEnUs = cand;
  const urlPT = urlEnUs.replace('/en-us/', '/pt-br/');
  let html;
  let urlUsada = urlPT;
  try {
    html = await getHtml(urlPT);
  } catch (e) {
    try {
      html = await getHtml(urlEnUs); // fallback: página em inglês
      urlUsada = urlEnUs;
    } catch (e2) {
      return null;
    }
  }

  const $ = cheerio.load(html);
  const titulo =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    '';
  const descricao = $('meta[property="og:description"]').attr('content') || '';
  const galeria = coletarImagens(html, chave);
  if (!galeria.length) return null; // página renderizada por JS sem as fotos

  return {
    url: urlUsada,
    nome: titulo,
    descricao,
    imagemPrincipal: galeria[0] || '',
    galeria,
    filtrarPorModelo: true, // engine mantém só as fotos que citam o modelo
  };
}

module.exports = { obter, HOSTS_IMAGENS };