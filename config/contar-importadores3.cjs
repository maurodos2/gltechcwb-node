require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const MARCAS = {
  Kingston: /kingston|kvr26|kvr32|kf432|kf552|hyperx|a400|a2000|nv2|nv1|ssdnow|uv400|sa400|kvr|kac|kcb|snvm|ssdnow|kuce/a400|a2000/i,
  Crucial:   /crucial|bx500|bx1000|mx500|p5plus|p5stick|ct500|ct1000|ct250|bx200|bx300|ssdbx500|ssdnow|ssdna/crucial|ct500bx500|ct1000bx500|bx500|p5plus|mx500/i,
  'WD Green': /wd green|wgreen|green sata|sn350|sn550|sn770|sn850|sdat|sn750|wds500g2|wds100t2|wds200t2|ssdb|green ssd/i,
};

(async () => {
  await connectDB();
  const todos = await Product.find({}, {
    nome: 1, brand: 1, active: 1, imagens: 1, images: 1, manufacturerRef: 1, type: 1,
  }).lean();
  const ativos = todos.filter((p) => p.active === true || /publicado|ativo/i.test(String(p.type || '')));

  console.log(`\n== total docs: ${todos.length} | candidatos ativos: ${ativos.length} ==\n`);
  for (const [marca, rx] of Object.entries(MARCAS)) {
    const alvo = ativos.filter((p) => rx.test(String(p.brand || '')) || rx.test(String(p.nome || '')));
    const imagens = Array.isArray(p.imagens) ? p.imagens : [];
    const semFoto = alvo.filter((p) => {
      const imgs = (Array.isArray(p.imagens) && p.imagens.length) ? p.imagens : (Array.isArray(p.images) && p.images.length) ? p.images : [];
      return !imgs.length;
    });
    const semRef = alvo.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`== ${marca} ==`);
    console.log(`   total: ${alvo.length} | SEM-FOTO: ${semFoto.length} | SEM-manufacturerRef: ${semRef.length}`);
    semFoto.slice(0, 8).forEach((p) => console.log(`      [${p.nome.slice(0, 55)}] brand="${p.brand}"`));
    semRef.slice(0, 8).forEach((p) => console.log(`      SEM-REF: [${p.nome.slice(0, 55)}]`));
  }

  // Driver MAIS limpo: TODOS produtos ATIVOS sem nenhuma foto — é isso que um
  // importador de fabricante resolve. Agrupa por marca p/ ranking.
  const semFotoGeral = ativos.filter((p) => {
    const imgs = (Array.isArray(p.imagens) && p.imagens.length) ? p.imagens : (Array.isArray(p.images) && p.images.length) ? p.images : [];
    return !imgs.length;
  });
  const porMarca = {};
  semFotoGeral.forEach((p) => { const m = String(p.brand || '(sem marca)').trim(); porMarca[m] = (porMarca[m] || 0) + 1; });
  console.log(`\n== ATIVOS sem NENHUMA foto: ${semFotoGeral.length} — ranking por marca ==`);
  Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([m, n]) => console.log(`   ${String(n).padStart(4)}  ${m}`));

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
