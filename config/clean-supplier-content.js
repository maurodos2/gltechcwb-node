require('dotenv').config();

const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const { cleanSupplierText, cleanSupplierBrand, cleanSupplierSlug, containsSupplierName } = require('../lib/supplier-content');

const SOURCE_URL = /(?:pauta|dicomp)\.com\.br/i;
const PUBLIC_FIELDS = ['name', 'brand', 'description', 'shortDescription', 'seoTitle', 'seoDescription'];
const INSTITUTIONAL_TITLES = new Set([
  'destaques',
  'inovando o jeito b2b de fazer negócios',
]);

function cleanSpecs(specs) {
  const entries = specs instanceof Map ? [...specs.entries()] : Object.entries(specs || {});
  return Object.fromEntries(entries
    .map(([key, value]) => [cleanSupplierText(key), cleanSupplierText(value)])
    .filter(([key, value]) => key && value));
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const dryRun = args.includes('--dry-run');
  if (execute === dryRun) throw new Error('Use exatamente um modo: --dry-run ou --execute.');

  await connectDB();
  const products = await Product.find({}).select(`sku slug ${PUBLIC_FIELDS.join(' ')} specs manufacturerRef.url active`).lean();
  const changes = [];

  for (const product of products) {
    const sourceProduct = SOURCE_URL.test(product.manufacturerRef?.url || '');
    const hasSupplierSpecs = Object.entries(product.specs || {}).some(([key, value]) => (
      containsSupplierName(key) || containsSupplierName(value)
    ));
    if (!sourceProduct && !hasSupplierSpecs && !PUBLIC_FIELDS.some((field) => containsSupplierName(product[field]))) continue;

    const update = {};
    const slug = cleanSupplierSlug(product.slug);
    if (slug !== product.slug) update.slug = slug;
    for (const field of PUBLIC_FIELDS) {
      const current = String(product[field] || '');
      const cleaned = field === 'brand' ? cleanSupplierBrand(current) : cleanSupplierText(current);
      if (cleaned !== current) update[field] = cleaned;
    }

    const specs = cleanSpecs(product.specs);
    if (JSON.stringify(specs) !== JSON.stringify(product.specs || {})) update.specs = specs;

    if (sourceProduct && product.active && INSTITUTIONAL_TITLES.has(String(product.name || '').trim().toLocaleLowerCase('pt-BR'))) {
      update.active = false;
    }

    if (Object.keys(update).length) changes.push({ product, update });
  }

  const categoryPattern = /pauta|dicomp/i;
  const categories = await Category.find({}).select('name slug description').lean();
  const categoryChanges = categories.map((category) => {
    const update = {};
    const name = category.slug === 'dicomp' ? 'Produtos' : cleanSupplierText(category.name) || 'Produtos';
    const slug = category.slug === 'dicomp' ? 'produtos' : cleanSupplierSlug(category.slug);
    const description = cleanSupplierText(category.description);
    if (name !== category.name) update.name = name;
    if (slug !== category.slug) update.slug = slug;
    if (description !== category.description) update.description = description;
    return Object.keys(update).length ? { category, update } : null;
  }).filter(Boolean).filter(({ category }) => categoryPattern.test(`${category.name} ${category.slug} ${category.description}`));

  console.log(`Produtos afetados: ${changes.length}`);
  for (const { product, update } of changes) {
    console.log(`${product.sku}\t${Object.keys(update).join(', ')}`);
  }
  console.log(`Categorias afetadas: ${categoryChanges.length}`);
  for (const { category, update } of categoryChanges) {
    console.log(`${category.slug}\t${Object.keys(update).join(', ')}`);
  }

  if (execute) {
    const backupPath = path.join(os.tmpdir(), `supplier-content-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({
      products: changes.map(({ product }) => product),
      categories: categoryChanges.map(({ category }) => category),
    }, null, 2));
    for (const { product, update } of changes) {
      await Product.updateOne({ _id: product._id }, { $set: update });
    }
    for (const { category, update } of categoryChanges) {
      await Category.updateOne({ _id: category._id }, { $set: update });
    }
    console.log(`Limpeza concluída. Backup: ${backupPath}`);
  } else {
    console.log('Prévia somente; nenhum dado foi alterado.');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[clean-supplier-content] erro:', error.message);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});