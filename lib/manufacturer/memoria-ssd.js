/**
 * Importador de memória/SSD — ADATA e Patriot (que expõem dados via HTML).
 *
 * ADATA: a página do produto (Next.js) embute as URLs oficiais das fotos em
 * JSON (webapi3.adata.com/storage/product/...).
 * Patriot: a foto oficial do produto vem no og:image hospedado no CDN deles.
 *
 * Ficam SEM importador (informado no relatório): Kingston (site bloqueia bots,
 * HTTP 403), Crucial (fotos só por JS) e WD Green (descontinuado, página 404).
 *
 * Apenas hosts oficiais são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');

const HOSTS_IMAGENS = new Set([
  'webapi3.adata.com',
  'assets.adata.com',
  'patriot-cms-media.sgp1.cdn.digitaloceanspaces.com',
]);

const PAGINAS = {
  adata: 'https://www.adata.com/us/consumer/category/ssds/503/',
  patriot: 'https://www.patriotmemory.com/products/burst-elite-sata-iii-2-5-ssd',
};

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function getHtml(url) {
  const { data } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeout: 25000,
  });
  return data;
}

// ADATA: fotos oficiais do SSD (URLs reais no JSON da página Next.js).
function extrairADATA(html) {
  const re = /https:\/\/webapi3\.adata\.com\/storage\/product\/[^"'\s]+\.(?:jpg|png|webp)/gi;
  const vistos = new Set();
  const todas = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[0];
    if (vistos.has(u)) continue;
    vistos.add(u);
    todas.push(u);
  }
  const bemVistas = todas.filter((u) => /(600x600|500x500)/.test(u));
  const banner = todas.find((u) => /1920x648/.test(u));
  const galeria = bemVistas.length ? bemVistas : banner ? [banner, ...todas] : todas;
  return [...new Set(galeria)];
}

// Patriot: foto oficial (hero) no og:image do CDN deles.
function extrairPatriot(html) {
  const img = html.match(
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/
  );
  const url = img ? img[1] : '';
  if (!/patriot-cms-media\.sgp1\.cdn\.digitaloceanspaces\.com/.test(url)) return [];
  return [url];
}

async function obter(modelo) {
  const chave = normalizar(modelo);
  let fonte;
  if (chave.startsWith('asu')) fonte = 'adata';
  else if (chave.startsWith('pbe')) fonte = 'patriot';
  else return null;

  const { data } = await axios.get(PAGINAS[fonte], {
    headers: { 'user-agent': UA, accept: 'text/html' },
    timeout: 25000,
  });
  const html = typeof data === 'string' ? data : '';
  const titulo = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) || [])[1] || '';

  const galeria = fonte === 'adata' ? extrairADATA(html) : extrairPatriot(html);
  if (!galeria.length) return null;

  return {
    url: PAGINAS[fonte],
    marca: fonte === 'adata' ? 'ADATA' : 'Patriot',
    nome: titulo,
    descricao: '', // descrição só chega se for possível extrair (hoje: imagem apenas)
    imagemPrincipal: galeria[0],
    galeria,
    filtrarPorModelo: false, // URLs já são do produto certo (página dedicada)
  };
}

module.exports = { obter, HOSTS_IMAGENS };