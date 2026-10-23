require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

const MARCAS_ALVO = {
  Kingston: (b, n) => /kingston|kvr26|kvr32|kvr42|kvr48|kfv26|kfv32|kf426|kf432|kf552|kf466|hyperx|a400|a2000|nv2|nv1|ssdnow|a4000|a2000|uv400|sa400|sv400|kac|kvm|kms|kcm|kcp|kcf|kcu|kcw|kcz|kdc|kdm|kdt|kdu|keb|kem|kes|kfa|kfl|khu|kja|kju|kla|kmv|knv|kpq|kpr|kqe|kql|kqe|krd|krt|ksc|kso|ksu|kta|kvd|kvs|kxa|kyb|kza|kzr|ktx|kus|kux|kfm|kfn|kfp|kfq|kfs|kft|kfv\b|\bkvr2[0-9]\b|\bnv[12]\b|\ba[24]00\b/i.test(String(b) + ' ' + String(n)) ? true : false,
  Crucial: (b, n) => /crucial|bx500|bx1000|bx1200|bx200|bx300|bx400|mx500|mx300|mx200|mx100|ct500|ct1000|ct2000|ct250|ct512|bx500ssd1|bx1000ssd1|mx500ssd1|ct500bx|ct1000bx|ct500mx|ct1000mx|p5plus|p5 plus|p5|p510|p511|p310|p320|p400|p500|p550|p600|p700|p800|p900|p1000|p1100|p1200|p1300|p1400|p1500|p1600|p1700|p1800|p1900|p2000|p2100|p2200|p2300|p2400|p2500|p2600|p2700|p2800|p2900|p3000|p3100|p3200|p3300|p3400|p3500|p3600|p3700|p3800|p3900|p4000|p4100|p4200|p4300|p4400|p4500|p4600|p4700|p4800|p4900|p5000|p5100|p5200|p5300|p5400|p5500|p5600|p5700|p5800|p5900|p6000|p6100|p6200|p6300|p6400|p6500|p6600|p6700|p6800|p6900|p7000|p7100|p7200|p7300|p7400|p7500|p7600|p7700|p7800|p7900|p8000|p8100|p8200|p8300|p8400|p8500|p8600|p8700|p8800|p8900|p9000|p9100|p9200|p9300|p9400|p9500|p9600|p9700|p9800|p9900/i.test(String(b) + ' ' + String(n)) ? true : false,
  'WD Green': (b, n) => /wd green|wdgreen|green sata|green ssd|wgreen|sn350|sn550|sn770|sn750|sn850|sn570|sn520|sn530|wds100|wds250|wds500|wd10|wd20|wd30|wd40|wd50|wds200t2g0a|wds500g2b0a|wds100t2b0a|wds200t3b0b|wds400t3b0b|wds100t3b0b|wds200t3g0b|wds400t1g0b|wds500g3x0c|wdblue|wd black|westerndigital|western digital|sn550|sn350|wd green sn350|wd green sn550|wds100t2g0a-00f0b0|sn770-1t|sn770-500g|sn770-2t/i.test(String(b) + ' ' + String(n)) ? true : false,
};

(async () => {
  await connectDB();
  const todos = await Product.find({}, { nome: 1, brand: 1, status: 1, active: 1, type: 1, images: 1, imagemPrincipal: 1, manufacturerRef: 1, published: 1 }).lean();
  const ativos = todos.filter((p) => (p.active === true) || /publicado|ativo/.test(String(p.status || '')));
  console.log(`total: ${todos.length} | ativos: ${ativos.length}`);

  for (const [marca, fn] of Object.entries(MARCAS_ALVO)) {
    const alvo = ativos.filter((p) => fn(String(p.brand || ''), String(p.nome || '')));
    const semFoto = alvo.filter((p) => !(Array.isArray(p.images) && p.images.length) && !p.imagemPrincipal);
    const semRef = alvo.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`\n== ${marca} ==\n   ativos=${alvo.length} | SEM-FOTO=${semFoto.length} | SEM-REFR=${semRef.length} | c/manufacturerRef.model=${alvo.filter((p) => p.manufacturerRef && p.manufacturerRef.model).length}`);
    semFoto.slice(0, 6).forEach((p) => console.log(`     [${String(p.nome || '').slice(0, 44)}] brand="${String(p.brand || '')}"`));
  }
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
