require('dotenv').config();
const mongoose = require('mongoose');
const connection = require('../config/db');

const rxMarca = {
  Kingston: /kingston|kvr26|kvr32|kvw|kf43|kf55|kf56|hyperx|a400|a2000|nv2|nv1|kac256|kac512|kac1t/i,
  Crucial: /crucial|bx500|bx1000|mx500|p5plus|p5 plus|p510|p500|ct500|ct1000|ct2000|ct250|ct512|bx400|p5\b/i,
  'WD Green': /wd ?green|wgreen|green sata|sn350|sn550|sn770|wd sn|sn770|sn750|blue sn|wds100t2g|wds200t2g|wds500g2g/i,
};

(async () => {
  await connection();
  const comercio = await Product.find({ type: 'produto', active: true }, { nome: 1, brand: 1, images: 1, manufacturerRef: 1, active: 1, status: 1 }).lean();
  console.log(`produtos type=produto ativos: ${comercio.length}`);

  for (const [marca, rx] of Object.entries(rxMarca)) {
    const alvo = comercio.filter((p) => rx.test(String(p.brand || '')) || rx.test(String(p.nome || '')));
    const semImg = alvo.filter((p) => !p.images?.length);
    const semRef = alvo.filter((p) => !p.manufacturerRef?.model);
    console.log(`== ${marca}: total=${alvo.length} | sem-foto=${semImg.length} | sem-manufacturerRef=${semRef.length}`);
    semImg.slice(0, 4).forEach((p) => console.log(`     [${String(p.brand || '')}] ${String(p.nome).slice(0, 50)}`));
  }
  const semImgTotal = comercio.filter((p) => !p.images?.length);
  const porMarca = {};
  semImgTotal.forEach((p) => { const m = String(p.brand || '(sem brand)').trim(); porMarca[m] = (porMarca[m] || 0) + 1; });
  console.log(`\n== ATIVOS SEM FOTO: ${semImgTotal.length} (top marcas) ==`);
  Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([m, n]) => console.log(`   ${String(n).padStart(3)}  ${m}`));
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
