require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const MARCAS = {
  Kingston: (nome, brand) => /kingston|kvr|hyperx|a400|a2000|a2000|nv2|nv1|a4000|ssdnow|uv400|kcm|kvr26|kvr32|kvr48|kf4|kf5|kf7|kf9|kf55|kf43|kf42|kf32|kf26/i.test(`${nome} ${brand}`),
  Crucial: (nome, brand) => /crucial|bx500|bx1000|mx500|mx100|bx200|bx100|p5plus|p5\b|p5|| p510|ct500|ct1000|ct250|ct480|ct960|ct2000|bx500ssd1|mx500ssd1|p5plus/crucial|readspeed|writespeed/i.test(`${nome} ${brand}`),
  'WD Green': (nome, brand) => /wd green|wgreen|green ssd|green sata|sn350|sn550|sn770|sn750|wd30|wd40|wds100|wds200|wds500|wds1t|wds2t|ssdnow|westerndigital|western digital|sn3501t|sn350500g|gen1|gen2|nvme/i.test(`${nome} ${brand}`),
};

function temFoto(p) {
  return !!(p.imagemPrincipal && String(p.imagemPrincipal).trim()) || (Array.isArray(p.imagens) && p.imagens.length > 0);
}

(async () => {
  await connectDB();
  const todos = await Product.find({}, { name: 1, brand: 1, nome: 1, marca: 1, active: 1, status: 1, type: 1, images: 1, imagens: 1, imagemPrincipal: 1, manufacturerRef: 1 }).lean();
  console.log(`== total docs: ${todos.length} ==`);

  const ativos = todos.filter((p) => p.active === true || /publicado|ativo|ativo/i.test(String(p.status || '')) || /publicado/i.test(String(p.type || '')));
  console.log(`== ativos (active=true ou status publicado): ${ativos.length} ==\n`);

  for (const [marca, fn] of Object.entries(MARCAS)) {
    const alvo = ativos.filter((p) => fn(String(p.name || p.nome || ''), String(p.brand || p.marca || '')));
    const semFoto = alvo.filter((p) => !temFoto(p));
    const semRef = alvo.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`== ${marca} ==`);
    console.log(`   ativos: ${alvo.length} | SEM-FOTO: ${semFoto.length} | SEM-manufacturerRef.model: ${semRef.length}`);
    semFoto.slice(0, 5).forEach((p) => console.log(`     [${String(p.active)}/${String(p.status || '').slice(0, 8)}] ${String(p.name || p.nome || '').slice(0, 56)}`));
    semRef.slice(0, 5).forEach((p) => console.log(`     ref-ok? brand="${String(p.brand || p.marca || '').slice(0, 20)}"`));
  }

  const tudoSemFoto = ativos.filter((p) => !temFoto(p));
  const porMarca = {};
  tudoSemFoto.forEach((p) => {
    const m = String(p.brand || p.marca || '(sem marca)').trim();
    porMarca[m] = (porMarca[m] || 0) + 1;
  });
  console.log(`\n== TODOS ativos SEM-FOTO: ${tudoSemFoto.length} (ranking marcas) ==`);
  Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .forEach(([m, n]) => console.log(`   ${String(n).padStart(3)}  ${m}`));

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO SCRIP:', e.message); process.exit(1); });
