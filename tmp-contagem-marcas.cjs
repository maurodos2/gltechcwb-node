require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const AVERIGUAR = [
  { marca: 'Kingston', rx: /kingston|kvr26|kvr32|kvw26|kf32|kf26|a400|a2000|nv2|nv1|ssdnow|hyperx/i },
  { marca: 'Crucial',   rx: /crucial|bx500|bx1000|mx500|p5plus|p5[ -]?plus|ct1000bx|ct500bx|ct1000mx|ct500mx/i },
  { marca: 'WD Green',   rx: /wd green|wgreen|green[ -]?sata|sn350|sn550|ssdnow green/i },
];

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  console.log("URI:", (uri||"").replace(/\/\/[^@]+@/,'//***@'));
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log("conectado");

  const todos = await Product.find({}, {
    nome:1, marca:1, preco:1, imagemPrincipal:1, imagens:1, manufacturerRef:1, status:1, catalogo:1
  }).lean();

  console.log("\n== TOTAIS por marca (pelo nome/marca, independente de status) ==");
  for (const {marca, rx} of AVERIGUAR) {
    const sel = todos.filter(p => rx.test(String(p.nome||'')) || rx.test(String(p.marca||'')));
    const ativo = sel.filter(p => /publicado|ativo/i.test(String(p.status||'')));
    const semFoto = sel.filter(p => !p.imagemPrincipal && !(p.imagens||[]).length);
    console.log(`\n  ${marca}: total=${sel.length} | ativos=${ativo.length} | ativos SEM foto=${ativo.filter(p=>!(p.imagemPrincipal||(p.imagens||[]).length)).length}`);
    ativo.slice(0,6).forEach(p=>console.log(`     [${p.status}] ${String(p.nome).slice(0,42)} img=${p.imagemPrincipal?'SIM':'nao'} ref=${p.manufacturerRef?'SIM':'nao'}`));
  }

  // Ponto central: quantos produtos ATIVOS existem sem nenhuma foto (driver real do importador)
  const ativosSemFoto = todos.filter(p => /publicado|ativo/i.test(String(p.status||'')) && !p.imagemPrincipal && !(p.imagens||[]).length);
  console.log(`\n== DRIVER REAL: produtos ativos SEM NENHUMA foto = ${ativosSemFoto.length} ==`);
  const porMarca = {};
  ativosSemFoto.forEach(p => { const m = String(p.marca||'(sem marca)').trim(); porMarca[m]=(porMarca[m]||0)+1; });
  Object.entries(porMarca).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([m,n])=>console.log(`   ${n.toString().padStart(3)} x  ${m}`));

  await mongoose.disconnect();
})().catch(e => { console.error("ERRO:", e.message); process.exit(1); });
