/**
 * Importa imagens (e descrição, se vazia) de produtos do site oficial do
 * fabricante — a mesma engine usada em /admin/imports, via linha de comando.
 *
 * Uso:
 *   npm run import-manufacturer -- SKU [SKU ...]
 *   npm run import-manufacturer -- REC-0003 REC-0007
 *
 * Roda manualmente, quando quiser. Pode repetir sem duplicar imagens.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const manufacturer = require('../lib/manufacturer/import');

function statusTxt(status) {
  const mapa = {
    ok: 'concluído',
    'sem-modelo': 'sem modelo no nome',
    'nao-encontrado': 'não encontrado no site oficial',
    'sem-imagem': 'sem imagem utilizável',
    'erro-upload': 'falha ao baixar/subir imagem',
    'erro-save': 'falha ao salvar',
    'sem-importador': 'marca sem importador',
    erro: 'erro',
  };
  return mapa[status] || status;
}

async function main() {
  const skus = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  if (!skus.length) {
    console.error('Uso: npm run import-manufacturer -- SKU [SKU ...]');
    process.exit(2);
  }

  await connectDB();

  const produtos = await Product.find({ sku: { $in: skus }, type: 'produto' });
  const encontrados = new Set(produtos.map((p) => p.sku));
  for (const sku of skus) {
    if (!encontrados.has(sku)) console.log(`[import-manufacturer] SKU não encontrado: ${sku}`);
  }
  if (!produtos.length) process.exit(1);

  for (const produto of produtos) {
    console.log(`\n== ${produto.sku} — ${produto.name}`);
    const r = await manufacturer.importarProduto(produto);
    console.log(`   -> ${statusTxt(r.status)}`);
    if (r.status === 'ok') {
      console.log(`      imagens: +${r.imagensAdicionadas} (total ${r.totalImagens})`);
      if (r.descricaoAdicionada) console.log('      descrição importada do site oficial');
      console.log(`      fonte: ${r.url}`);
    } else if (r.motivo) {
      console.log(`      motivo: ${r.motivo}`);
    }
  }

  await mongoose.connection.close();
}

main().catch(async (e) => {
  console.error('[import-manufacturer] erro:', e);
  try {
    await mongoose.connection.close();
  } catch (_) {}
  process.exit(1);
});