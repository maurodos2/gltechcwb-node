const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error('[db] MONGO_URI não definida no .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log(`[db] Conectado ao MongoDB (${mongoose.connection.name})`);
  } catch (err) {
    console.error('[db] Falha ao conectar no MongoDB:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] Conexão com MongoDB perdida');
  });
}

module.exports = connectDB;
