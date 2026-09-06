/**
 * Importador da Oneal Áudio (site oficial PHP, www.oneal.com.br).
 *
 * A página de listagem de cada categoria expõe título e foto oficial do
 * produto no servidor (CDN /images/<hash>.webp). Modelos descontinuados
 * (ex.: OB-408 → Sistema Ambiental OPB408A; OB-1315R) só têm a foto da
 * listagem — é disso que este importador se alimenta.
 *
 * Apenas hosts oficiais são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');

const HOSTS_IMAGENS = new Set(['www.oneal.com.br']);

const CATEGORIAS = [
  'amplificadores',
  'caixas-acusticas',
  'classd',
  'descontinuados',
  'lancamentos',
  'linha-instrumental',
  'mesa-de-som',
  'monitores',
  'multiuso',
  'perifericos',
  'sistema-ambiental',
  'sistemas',
];

const BASE = 'https://www.oneal.com.br';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

let catCache = null;
let catCacheAt = 0;
const TTL = 60 * 60 * 1000; // 1h

async function getHtml(url) {
  const { data } = await axios.get(url, { headers: { 'user-agent': UA }, timeout: 25000 });
  return typeof data === 'string' ? data : '';
}

// Monta o catálogo: { titulo, img } de todas as categorias (foto oficial no CDN).
async function pegarCatalogo() {
  if (catCache && Date.now() - catCacheAt < TTL) return catCache;
  const itens = [];
  for (const cat of CATEGORIAS) {
    const html = await getHtml(`${BASE}/produtos/${cat}`);
    const re = /<img[^>]+src="(\/images\/[0-9a-f]+\.webp)"[^>]*title="([^"]*(DESCONTINUADO)?)[^"]*"/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      itens.push({ titulo: m[2].trim(), img: `${BASE}${m[1]}`, categoria: cat });
    }
  }
  catCache = itens;
  catCacheAt = Date.now();
  return itens;
}

// Palavras do nome do produto que o título oficial também cita (prefixo ≥5 chars).
function pontuar(titulo, nome) {
  const tw = new Set(titulo.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4));
  const nw = new Set(nome.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4));
  let pontos = 0;
  for (const t of tw) {
    for (const n of nw) {
      if (t === n) { pontos += 2; break; }
      if (t.length >= 5 && n.length >= 5 && t.slice(0, 5) === n.slice(0, 5)) { pontos += 1; break; }
    }
  }
  return pontos;
}

async function obter(modelo, nome = '') {
  const token = normalizar(modelo);
  const digitos = token.replace(/\D/g, '');
  if (!digitos) return null;

  const catalogo = await pegarCatalogo();
  const candidatos = catalogo.filter((it) => normalizar(it.titulo).includes(digitos));
  if (!candidatos.length) return null;

  let melhor = null;
  let melhorScore = -1;
  const letraModelo = token.replace(/\d+/g, ''); // ex.: 'r' em OB-1315R
  for (const it of candidatos) {
    let score = pontuar(it.titulo, nome);
    const norm = normalizar(it.titulo);
    if (token && norm.endsWith(token)) score += 3;
    // Bônus: sufixo do modelo bate com o do título (1315R vs 1315X/1315 PLUS)
    if (letraModelo) {
      const m = norm.match(/\d{3,4}([a-z])/);
      if (m && m[1] === letraModelo) score += 2;
    }
    if (score > melhorScore) {
      melhorScore = score;
      melhor = it;
    }
  }

  return {
    url: `${BASE}/produtos/${melhor.categoria}`,
    marca: 'Oneal',
    nome: melhor.titulo,
    descricao: '', // descontinuados/referência: foto oficial sem descrição
    imagemPrincipal: melhor.img,
    galeria: [melhor.img],
    filtrarPorModelo: false,
  };
}

module.exports = { obter, HOSTS_IMAGENS };