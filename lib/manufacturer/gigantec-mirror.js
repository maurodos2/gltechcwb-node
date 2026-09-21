/**
 * Importador "espelho de revenda autorizada" — Kingston, WD Green (e demais
 * marcas que o fabricante não expõe via HTTP).
 *
 * Fontes oficiais bloqueadas (verificado por HTTP em habito):
 *   Kingston (kingston.com) → 403 anti-bot;
 *   Crucial (crucial.com)   → fotos do produto só por JS;
 *   WD Green (westerndigital.com) → 404 (linha descontinuada).
 *
 * A fonte HTTP-viável e aprovada no projeto é o revendedor autorizado
 * gigantec.com.br (SP, NTN historial), que espelha as fotos oficiais da caixa
 * no mesmo caminho que o importador Intel já usa (media/catalog/product/...).
 *
 * FONTES guarda imagem(ns) por modelo (chave normalizada sem hífen/minúsculas),
 * igual ao intel.js. Para novos modelos basta adicionar a entrada com a URL
 * da imagem confirmada na busca gigantec.
 */
const HOSTS_IMAGENS = new Set(['www.gigantec.com.br']);

const FONTES = {
  kvr32n22s8: {
    url: 'https://www.gigantec.com.br/memoria-kingston-8gb-ddr4-3200mhz-kvr32n22s8l-8.html',
    nome: 'Memória Kingston 8GB DDR4 3200MHz (KVR32N22S8/8)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/cache/23d3bdd80ef3e8d6ccdfb2268f46ea94/m/e/mem_ddr4_8gb_3200mhz_kingston_kvr32n22s8l_1.jpg',
    ],
  },
  kvr32n22s8l: {
    url: 'https://www.gigantec.com.br/memoria-kingston-8gb-ddr4-3200mhz-kvr32n22s8l-8.html',
    nome: 'Memória Kingston 8GB DDR4 3200MHz (KVR32N22S8L/8)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/cache/23d3bdd80ef3e8d6ccdfb2268f46ea94/m/e/mem_ddr4_8gb_3200mhz_kingston_kvr32n22s8l_1.jpg',
    ],
  },
  a400: {
    url: 'https://www.gigantec.com.br/catalogsearch/result/?q=sa400s37',
    nome: 'SSD Kingston A400 480GB SATA III 2,5" (SA400S37/480G)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/cache/23d3bdd80ef3e8d6ccdfb2268f46ea94/s/s/ssd_480gb_kingston_a400_sata_iii_2_5_-_sa400s37480g_001.jpg',
    ],
  },
  sa400s37: {
    url: 'https://www.gigantec.com.br/catalogsearch/result/?q=sa400s37',
    nome: 'SSD Kingston A400 480GB SATA III 2,5" (SA400S37/480G)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/cache/23d3bdd80ef3e8d6ccdfb2268f46ea94/s/s/ssd_480gb_kingston_a400_sata_iii_2_5_-_sa400s37480g_001.jpg',
    ],
  },
  wds480g3g0a: {
    url: 'https://www.gigantec.com.br/ssd-wd-480gb-sata-lll-green-2-5-wds480g3g0a.html',
    nome: 'SSD WD Green 480GB SATA III 2,5" (WDS480G3G0A)',
    imagens: [
      'https://www.gigantec.com.br/media/catalog/product/cache/23d3bdd80ef3e8d6ccdfb2268f46ea94/s/s/ssd_western_digital_wds480g3g0a_001.jpg',
    ],
  },
};

async function obter(modelo, nome = '') {
  const chave = String(modelo).toLowerCase().replace(/[^a-z0-9]/g, '');
  const fonte = FONTES[chave];
  if (!fonte) return null;
  return {
    url: fonte.url,
    nome: fonte.nome,
    descricao: '',
    imagemPrincipal: fonte.imagens[0],
    galeria: fonte.imagens.slice(1),
  };
}

module.exports = { obter, HOSTS_IMAGENS };