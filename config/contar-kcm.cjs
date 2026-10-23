require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Product = require('./models/Product');

const MARCAS_RX = {
  Kingston: /kingston|kvr26|kvr32|kvr427|kvr48|kf432|kf552|cako26|cako32|\bkv[wm]|\bkx8|hyperx|a400|a2000|a500f|nv2\nv2|nv1|ssdnow|uv400|kuce400|sv400s|ssdnow a400|cakv|cai|\bssd\bnow/i,
  Crucial: /crucial|bx500|bx1000|bx1200|mx500|p5plus|p5 plus|p510|p110|ct500bx|ct1000bx|ct250bx|ct500mx|ct1000mx|ct1000p|ct500p|bx500ssd1|mx500ssd1/i,
  'WD Green': /wd green|wg reen|green sata|sn350|sn550|sn770|westerndigital|wdgreen|green\s+ssd|sn550n\b|\bsn550\b|\bsn350\b|ssdnow green/i,
};

(async () => {
  await connectDB();
  const todos = await Product.find({}, { type: 1, active: 1, status: 1, brand: 1, nome: 1, images: 1, 'manufacturerRef.model': 1, active2: 1 }).lean();
  console.log(`total docs no catálogo: ${todos.length}`);

  // 1) calibra: como o catálogo marca "ativo"?
  const types = new Set(), statuses = new Set();
  todos.forEach((p) => { types.add(String(p.type)); statuses.add(String(p.status)); });
  console.log(`\n== valores únicos de type: ${[...types].join(', ') || '(todos vazios)'}`);
  console.log(`== valores únicos de status: ${[...statuses].join(', ') || '(todos vazios)'}`);

  // considera ativo: active===true OU status publicado/ativo/publicado2 etc.
  const ehAtivo = (p) => p.active === true || /publicado|ativo|active|public/i.test(String(p.status || ''));
  const ativos = todos.filter(ehAtivo);
  console.log(`\nprodutos ATIVOS (active=true ou status publicado/ativo): ${ativos.length}`);

  for (const [marca, rx] of Object.entries(MARCAS_RX)) {
    const alvo = ativos.filter((p) => rx.test(String(p.brand || '')) || rx.test(String(p.nome || '')));
    const semFoto = alvo.filter((p) => !(Array.isArray(p.images) && p.images.length) && !p.imagesPrincipal);
    const semRef = alvo.filter((p) => !p.manufacturerRef || !p.manufacturerRef.model);
    console.log(`\n== ${marca} ==\n   ativos=${alvo.length} | SEM-FOTO=${semFoto.length} | SEM-manufacturerRef=${semRef.length}`);
    semFoto.slice(0, 10).forEach((p) => {
      const hasImg = Array.isArray(p.images) && p.images.length;
      console.log(`     ${hasImg ? 'COM-FOTO?' : 'SEM-FOTO '} [${String(p.active)}/${String(p.status)}] ${String(p.nome).slice(0, 54)}`);
    });
  }

  // driver geral: TODOS os ativos sem foto, por marca
  const semFotoTodos = ativos.filter((p) => !(Array.isArray(p.images) && p.images.length));
  const porMarca = {};
  semFotoTodos.forEach((p) => { const m = String(p.brand || '(sem marca)').trim(); porMarca[m] = (porMarca[m] || 0) + 1; });
  console.log(`\n== ${semFotoTodos.length} ativos SEM foto — ranking por marca ==`);
  Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([m, n]) => console.log(`   ${String(n).padStart(3)}  ${m}`));

  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
