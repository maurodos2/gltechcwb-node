require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const MARCAS = [
  { nome: 'Kingston', termos: ['kingston', 'kvr26', 'kvr32', 'kvr42', 'kvr48', 'kfv', 'kf4', 'kf5', 'kf26', 'kf43', 'kf55', 'hyperx', 'a400', 'a2000', 'a2000', 'nv2', 'nv1', 'nvm2', 'ssdnow', 'uv400', 'sv400', 'sa400', 'kac', 'kvr32n21', 'kvr32n22', 'kfr', 'kvr26n19'] },
  { nome: 'Crucial', termos: ['crucial', 'bx500', 'bx1000', 'bx1200', 'bx200', 'bx300', 'bx400', 'mx500', 'mx300', 'mx200', 'mx100', 'p5plus', 'p5 plus', 'p510', 'p511', 'ct500', 'ct1000', 'ct2000', 'ct250', 'ct480', 'ct960', 'bx500ssd1', 'bx1000ssd1', 'mx500ssd1', 'ct500bx500ssd1', 'ct1000bx500ssd1', 'ct500mx500ssd1', 'ct1000mx500ssd1', 'p5plusssd', 'ct500p5plus', 'ct1000p5plus', 'ct500p5'] },
  { nome: 'WD Green', termos: ['wd green', 'wgreen', 'wds100', 'wds200', 'wds250', 'wds500', 'wds1t', 'wds2t', 'sn350', 'sn550', 'sn570', 'sn750', 'sn770', 'ssdnow', 'green sata', 'ssdnow', 'wd sn', 'sn350ssd', 'wds100t2g0a', 'wds200t2g0a', 'wds500g2b0a', 'wds100t3b0a', 'sn350050', 'sn550050'] },
];

function ativo(p) {
  if (p.active === true) return true;
  return /publicado|ativo|active|public|available/i.test(String(p.status || '')) || /publicado|ativo/i.test(String(p.type || ''));
}

(async () => {
  await connectDB();
  const todos = await Product.find({}, { name: 1, brand: 1, images: 1, imagemPrincipal: 1, active: 1, status: 1, type: 1, manufacturerRef: 1, nome: 1, marca: 1 }).lean();

  const ativos = todos.filter(ativo);
  console.log(`total: ${todos.length} | ativos: ${ativos.length}\n`);

  for (const m of MARCAS) {
    const hit = ativos.filter((p) => {
      const texto = `${String(p.name || p.nome || '')} ${String(p.brand || p.marca || '')}`.toLowerCase();
      return m.termos.some((t) => texto.includes(t));
    });
    const semFoto = hit.filter((p) => {
      const tem = Array.isArray(p.images) && p.images.length;
      const temP = !!(p.imagemPrincipal && String(p.imagemPrincipal).trim());
      return !tem && !temP;
    });
    const semModel = hit.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`== ${m.nome} ==`);
    console.log(`   ativos: ${hit.length} | SEM-FOTO: ${semFoto.length} | SEM-manufacturerRef.model: ${semModel.length}`);
    semFoto.slice(0, 8).forEach((p) => console.log(`      SEM-FOTO [${String(p.active)}/${String(p.status || '').slice(0, 12)}] ${String(p.name || p.nome || '').slice(0, 58)}`));
    semModel.slice(0, 4).forEach((p) => console.log(`      SEM-MODEL [${String(p.name || p.nome || '').slice(0, 58)}]`));
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
