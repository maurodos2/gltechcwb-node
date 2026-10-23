require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mongoose = require('mongoose');
const Product = require('./models/Product');

const MARCAS_ALVO = {
  Kingston: /kingston|kvr26|kvr32|kvw|kf32|a400|a2000|nv2|nv1|ssdnow|hyperx|kvr/i,
  Crucial: /crucial|bx500|bx1000|mx500|p5plus|ct500|ct1000|ct250|p510|p5\b/i,
  'WD Green': /wd green|wgreen|green sata|sn350|sn550|ssd now|westerndigital|\bwd\b green/i,
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  const todos = await Product.find({}, { nome: 1, marca: 1, status: 1, imagemPrincipal: 1, imagens: 1, manufacturerRef: 1 });
  console.log(`Total no Mongo: ${todos.length}`);

  const ativos = todos.filter((p) => /publicado|ativo/i.test(String(p.status || '')));
  console.log(`Ativos (publicado/ativo): ${ativos.length}\n`);

  for (const [marca, rx] of Object.entries(MARCAS_ALVO)) {
    const hits = todos.filter((p) => rx.test(String(p.marca || '')) || rx.test(String(p.nome || '')));
    const atv = hits.filter((p) => /publicado|ativo/i.test(String(p.status || '')));
    const semFoto = atv.filter((p) => !p.imagemPrincipal && !(p.imagens || []).length);
    const ref = atv.filter((p) => p.manufacturerRef);
    console.log(`${marca.toUpperCase().padEnd(9)} total=${String(hits.length).padStart(3)} ativos=${String(atv.length).padStart(3)} SEM-FOTO=${String(semFoto.length).padStart(3)} c/ref=${ref.length}`);
    atv.slice(0, 6).forEach((p) =>
      console.log(`     [${String(p.status)}] ${String(p.nome).slice(0, 46).padEnd(46)} img=${p.imagemPrincipal ? 'S' : p.imagens?.length ? `${p.imagens.length}i` : 'N'} ref=${p.manufacturerRef ? 'S' : '-'}`)
    );
  }

  console.log('\nProdutos ativos SEM NENHUMA foto (todo o catálogo, qualquer marca):');
  const semFotoGeral = ativos.filter((p) => !p.imagemPrincipal && !(p.imagens || []).length);
  const porMarca = {};
  semFotoGeral.forEach((p) => {
    const m = String(p.marca || '(sem marca)').trim();
    porMarca[m] = (porMarca[m] || 0) + 1;
  });
  Object.entries(porMarca).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([m, n]) => console.log(`  ${String(n).padStart(3)} sem foto → ${m}`));

  await mongoose.disconnect();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
