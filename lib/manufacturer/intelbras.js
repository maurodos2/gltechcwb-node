/**
 * Importador de dados da Intelbras via API pública da loja oficial
 * (VTEX). A loja não aceita scraping simples (busca renderizada por JS),
 * mas expõe a API de busca de catálogo da VTEX, que devolve JSON estruturado
 * (imagens, descrição, nome, link oficial).
 *
 * Fluxo: obter(modelo) -> tenta RefId (código do produto), depois EAN, depois
 * busca textual, e devolve os dados do primeiro resultado.
 *
 * Apenas hosts da Intelbras/VTEX são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');

const API =
  'https://intelbras.vtexcommercestable.com.br/api/catalog_system/pub/products/search';
const HOSTS_IMAGENS = new Set(['intelbras.vteximg.com.br']);

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getJson(query) {
  const url = `${API}/?${query}`;
  const { data } = await axios.get(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    timeout: 20000,
  });
  return Array.isArray(data) ? data : [];
}

function limparHtml(texto) {
  return String(texto || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Busca em várias estratégias e devolve o primeiro produto (ou null).
async function obter(modelo) {
  const q = String(modelo || '').trim();
  if (!q) return null;

  let lista = await getJson(`fq=alternateIds_RefId:${encodeURIComponent(q)}`);
  if (!lista.length && /^\d+$/.test(q)) {
    lista = await getJson(`fq=alternateIds_Ean:${q}`);
  }
  if (!lista.length) {
    lista = await getJson(`ft=${encodeURIComponent(q)}&_from=0&_to=8`);
  }
  if (!lista.length) return null;

  const p = lista[0];
  const item = p.items && p.items[0];
  const imagens = (item && item.images ? item.images : [])
    .map((i) => (i.imageUrl || '').split('?')[0])
    .filter(Boolean);
  const galeria = imagens.slice(1, 4); // mantém principal + até 3 da galeria

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

module.exports = { obter, HOSTS_IMAGENS };