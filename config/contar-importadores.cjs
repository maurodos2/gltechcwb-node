require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const MARCAS_ALVO = {
  Kingston: /kingston|kvr26|kvr32|kf432|kf552|hyperx|a400|a2000|nv2|nv1|ssdnow|uv400|sa400|kvw26|kfor32/i,
  Crucial: /crucial|bx500|bx1000|bx200|mx500|p5plus|p5 plus|ct500|ct1000|ct250|ct1000bx|ssdbx500|p510|p5 /i,
  'WD Green': /wd green|wgreen|green sata|sn350|sn550|westerndigital|western digital|sn770|wds100t2g0a|wd20ezaz|green ssd/i,
};

(async () => {
  await connectDB();
  const todos = await Product.find({}, { nome: 1, marca: 1, status: 1, images: 1, manufacturerRef: 1, active: 1, type: 1 }).lean();
  console.log('total docs:', todos.lengthapsed);

  const ativos = todos.filter((p) => /publicado|ativo|active|available|em-estoque/i.test(String(p.status || '')) || p.active === true);
  console.log('ativos (status publicado/ativo ou active=true):', ativos.length);

  for (const [marca, rx] of Object.entries(MARCAS_ALVO)) {
    const alvo = ativos.filter((p) => rx.test(String(p.marca || '')) || rx.test(String(p.nome || '')));
    const semFoto = alvo.filter((p) => !Array.isArray(p.images) || !p.images.length);
    const semRef = alvo.filter((p) => !p.manufacturerRef || !String(p.manufacturerRef.model || '').trim());
    console.log(`\n== ${marca} ==`);
    console.log(`   ativos: ${alvo.length} | ATIVOS SEM NENHUMA FOTO: ${semFoto.length} | ativos sem manufacturerRef: ${semRef.length}`);
    semFoto.slice(0, 5).forEach((p) => console.log(`     [${String(p.status || '?').toUpperCase()}] ${String(p.nome).slice(0, 60)}`));
  }

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
