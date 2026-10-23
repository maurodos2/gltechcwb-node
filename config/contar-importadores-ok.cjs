require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const MARCAS_ALVO = {
  Kingston: /kingston|kvr26|kvr32|kvr4|kf432|kf55|kf44|hyperx|a400|a2000|a4000|a4000n|nv1|nv2|nv3|ssdnow|uv400|sa400s37|a400s37|kvr26n19|kvr32n21|kvr26s19|kvr32s22|kvr26n19s8|kvr32n21s8|sat2|snsv|snvs|ssdnow|kuc|kac/,
  Crucial: /crucial|bx500|bx1000|bx1200|mx500|mx200|mx100|p5plus|p5 plus|p510|p110|ct500|ct1000|ct250|ct2000|ct4000|bx500ssd1|bx1000ssd1|mx500ssd1|ct500bx50|ct1000bx50|ct500mx50|ct1000mx50|ct500p5|ct1000p5|\bBX500\b|\bMX500\b|\bP5\b|ct250bx50/,
  'WD Green': /wd.?green|wdgreen|green.*sata|sn350|sn550|sn770|sn850|ssd.*green|green.*ssd|westerndigital.*green|snw[eos]/,
};

(async () => {
  await connectDB();
  const todos = await Product.find({}, { nome: 1, brand: 1, active: 1, images: 1, manufacturerRef: 1, type: 1, status1: 1 }).lean();
  console.log(`total docs: ${todos.length}`);
  const ativos = todos.filter((p) => p.active === true || /publicado|ativo|active/i.test(String(p.status || '')));
  console.log(`ativos: ${ativos.length}`);

  for (const [marca, rx] of Object.entries(MARCAS_ALVO)) {
    const alvo = ativos.filter((p) => rx.test(String(p.brand || '')) || rx.test(String(p.nome || '')));
    const semFoto = alvo.filter((p) => !(Array.isArray(p.images) && p.images.length));
    const semRef = alvo.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`\n== ${marca} ==`);
    console.log(`  ativos: ${alvo.length} | SEM-FOTO: ${semFoto.length} | SEM-manufacturerRef: ${semRef.length}`);
    semFoto.slice(0, 5).forEach((p) => console.log(`     [${p.active}] ${String(p.nome).slice(0, 60)}`));
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
