require('dotenv').config();
const connectDB = require('../config/db');
const Product = require('../models/Product');
(async () => {
  await connectDB();
  const alvos = await Product.find({
    $or: [
      { name: /kingston/i }, { name: /crucial/i }, { name: /wd green|westerndigital/i },
      { brand: /kingston|crucial/i }, { name: /wds480/i },
    ],
  }, { sku: 1, name: 1, brand: 1, images: 1, manufacturerRef: 1, active: 1 }).lean();
  console.log('\n== SKUs reais dos 6 alvos ==');
  alvos.forEach((p) => console.log(`  sku=${p.sku} | ${String(p.name).slice(0, 55)} | ref=${p.manufacturerRef ? p.manufacturerRef.model : '-'}`));
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
