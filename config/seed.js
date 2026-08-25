// Script único para criar o primeiro usuário admin.
// Uso: npm run seed
//
// Não cria mais categorias de exemplo — o catálogo real é importado
// separadamente com: npm run import-catalog -- migracao/categorias.json migracao/produtos.json
require('dotenv').config();
const connectDB = require('./db');
const Admin = require('../models/Admin');
const mongoose = require('mongoose');

async function seed() {
  await connectDB();

  const email = (process.env.SEED_ADMIN_EMAIL || 'admin@gltechcwb.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || 'troque-esta-senha';

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`[seed] Admin "${email}" já existe. Nada a fazer.`);
  } else {
    const passwordHash = await Admin.hashPassword(password);
    await Admin.create({
      name: 'Administrador',
      email,
      passwordHash,
      role: 'owner',
    });
    console.log(`[seed] Admin criado: ${email} / senha definida no .env`);
  }

  await mongoose.disconnect();
  console.log('[seed] Concluído.');
}

seed().catch((err) => {
  console.error('[seed] Erro:', err);
  process.exit(1);
});
