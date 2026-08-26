/**
 * Remove todos os serviços (type === 'servico') do banco de dados.
 * Uso: node config/remove-services.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./db');
const Product = require('../models/Product');
const Category = require('../models/Category');

async function removeServices() {
  await connectDB();

  // Remover produtos do tipo servico
  const result = await Product.deleteMany({ type: 'servico' });
  console.log(`[remove-services] ${result.deletedCount} serviços removidos.`);

  // Remover categoria "Serviços Técnicos" se existir
  const catResult = await Category.deleteMany({ slug: 'servicos-tecnicos' });
  console.log(`[remove-services] ${catResult.deletedCount} categorias de serviço removidas.`);

  await mongoose.disconnect();
  console.log('[remove-services] Concluído.');
}

removeServices().catch((err) => {
  console.error('[remove-services] Erro:', err);
  process.exit(1);
});
