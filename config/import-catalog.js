/**
 * Importa o catálogo migrado do Zoho (categorias.json + produtos.json,
 * gerados por migracao/gerar_catalogo_json.py) para o MongoDB do projeto.
 *
 * Uso:
 *   node config/import-catalog.js caminho/categorias.json caminho/produtos.json
 *
 * É seguro rodar mais de uma vez: categorias e produtos já existentes
 * (mesmo slug/SKU) são atualizados, não duplicados.
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function importCatalog(categoriesPath, productsPath) {
  await connectDB();

  const categories = JSON.parse(fs.readFileSync(categoriesPath, 'utf-8'));
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

  console.log(`[import] ${categories.length} categorias, ${products.length} produtos/serviços a importar.`);

  // ---- Categorias (upsert por slug) ----
  const slugToId = {};
  for (const cat of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: cat.slug },
      {
        name: cat.name,
        slug: cat.slug,
        description: cat.description || '',
        order: cat.order || 0,
        active: cat.active !== false,
      },
      { upsert: true, new: true }
    );
    slugToId[cat.slug] = doc._id;
    console.log(`  [categoria] OK: ${cat.name}`);
  }

  // ---- Produtos/serviços (upsert por SKU) ----
  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const p of products) {
    const categoryId = slugToId[p.categorySlug];
    if (!categoryId) {
      console.warn(`  [produto] IGNORADO (categoria "${p.categorySlug}" não encontrada): ${p.name}`);
      ignorados++;
      continue;
    }

    const existing = await Product.findOne({ sku: p.sku });

    const payload = {
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      type: p.type === 'servico' ? 'servico' : 'produto',
      category: categoryId,
      brand: p.brand || '',
      price: p.price || 0,
      cost: p.cost || 0,
      promoPrice: p.promoPrice || null,
      stock: p.stock || 0,
      barcode: p.barcode || null,
      description: p.description || '',
      shortDescription: p.shortDescription || '',
      images: p.images || [],
      active: p.active !== false,
    };

    if (existing) {
      await Product.updateOne({ _id: existing._id }, payload);
      atualizados++;
    } else {
      await Product.create(payload);
      criados++;
    }
  }

  console.log(`\n[import] Concluído.`);
  console.log(`  Criados:     ${criados}`);
  console.log(`  Atualizados: ${atualizados}`);
  console.log(`  Ignorados:   ${ignorados}`);

  await mongoose.disconnect();
}

const [, , categoriesArg, productsArg] = process.argv;

if (!categoriesArg || !productsArg) {
  console.error('Uso: node config/import-catalog.js <categorias.json> <produtos.json>');
  process.exit(1);
}

importCatalog(categoriesArg, productsArg).catch((err) => {
  console.error('[import] Erro:', err);
  process.exit(1);
});
