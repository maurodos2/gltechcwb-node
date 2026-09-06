/**
 * Importador da Kadosh Music (kadoshmusic.com.br — WooCommerce oficial da
 * marca de microfones Kadosh Microfones).
 *
 * O `product-sitemap.xml` resolve o slug do produto pelo modelo (ex.: K3 →
 * /produto/k3/); a página de produto traz og:image (foto oficial) e
 * og:description em português.
 *
 * Apenas hosts oficiais são consultados/baixados (SSRF-safe).
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HOSTS_IMAGENS = new Set(['kadoshmusic.com.br']);

const SITEMAP = 'https://kadoshmusic.com.br/product-sitemap.xml';
const BASE = 'https://kadoshmusic.com.br';
const CACHE_JSON = path.join(__dirname, '.cache', 'kadosh-slugs.json');
const TTL_CACHE = 24 * 60 * 60 * 1000; // sitemap é atualizado no máx 1x/dia
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function normalizar(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const aguardar = (ms) => new Promise((r) => setTimeout(r, ms));

async function getHtml(url, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'user-agent': UA, accept: 'text/html' },
        timeout: 25000,
      });
      await aguardar(15000); // CDN da Kadosh limita rajadas por IP — pedidos espaçados
      return typeof data === 'string' ? data : '';
    } catch (e) {
      const status = e.response && e.response.status;
      if (status === 429 || status >= 500) {
        await aguardar(30000 * (i + 1)); // atravessa janela fechada (até ~7,5min)
        continue;
      }
      throw e;
    }
  }
  return '';
}

// Slugs persistidos em arquivo: evita refetch do sitemap a cada execução.
async function pegarSlugs() {
  try {
    if (fs.existsSync(CACHE_JSON)) {
      const salvo = JSON.parse(fs.readFileSync(CACHE_JSON, 'utf8'));
      if (salvo.at && Date.now() - salvo.at < TTL_CACHE) return salvo.slugs;
    }
  } catch (e) {
    // cache corrompido — refaz o fetch
  }
  const xml = await getHtml(SITEMAP);
  const slugs = [];
  const re = /<loc>(https:\/\/kadoshmusic\.com\.br\/produto\/[a-z0-9-]+\/)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) slugs.push(m[1].replace(/\/$/, ''));
  try {
    fs.mkdirSync(path.dirname(CACHE_JSON), { recursive: true });
    fs.writeFileSync(CACHE_JSON, JSON.stringify({ at: Date.now(), slugs }));
  } catch (e) {
    // cache opcional
  }
  return slugs;
}

// Fotos originais do WooCommerce: remove os sufixos de tamanho (-WxH, -scaled…).
function limparUrl(u) {
  return u.replace(/-\d+x\d+(?=\.[a-z]+$)/i, '').replace(/(-scaled|-1536x1024|-2048x1536)/i, '');
}

async function obter(modelo, nome = '') {
  const token = normalizar(modelo);
  if (!token) return null;

  const slugs = await pegarSlugs();
  const slug = slugs.find((s) => s.split('/').pop() === token) || slugs.find((s) => s.includes(token));
  if (!slug) return null;

  const html = await getHtml(slug);
  const ogImg = (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) || [])[1] || '';
  const descricao =
    (html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/) || [])[1] || '';
  const titulo = (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) || [])[1] || '';

  const imagens = new Set();
  if (ogImg.startsWith('https://kadoshmusic.com.br/')) imagens.add(ogImg);
  const re = /https:\/\/kadoshmusic\.com\.br\/wp-content\/uploads\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[0];
    if (/logo|banner|slider/i.test(u)) continue;
    imagens.add(limparUrl(u));
  }
  const galeria = [...imagens];
  if (!galeria.length) return null;

  return {
    url: slug,
    marca: 'Kadosh',
    nome: titulo,
    descricao,
    imagemPrincipal: galeria[0],
    galeria,
    filtrarPorModelo: false,
  };
}

module.exports = { obter, HOSTS_IMAGENS };