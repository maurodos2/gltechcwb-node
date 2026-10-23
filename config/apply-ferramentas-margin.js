require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./db');
const Category = require('../models/Category');
const Product = require('../models/Product');

async function main() {
  await connectDB();

  const category = await Category.findOne({ slug: 'ferramentas' });
  if (!category) {
    console.log('[margin] categoria ferramentas não encontrada.');
    await mongoose.disconnect();
    return;
  }

  const products = await Product.find({ category: category._id });
  let updated = 0;

  for (const product of products) {
    const digits = Number(String(product.sku || '').replace(/\D/g, '') || '100');
    const cost = 100 + (digits % 350);
    const price = Number((cost * 1.35).toFixed(2));

    await Product.updateOne(
      { _id: product._id },
      {
        cost,
        price,
        promoPrice: null,
        active: true,
      }
    );

    updated += 1;
  }

  console.log(`[margin] ${updated} produtos atualizados com margem de 35%.`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('[margin] erro:', error);
  process.exit(1);
});
