require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Category = require('../models/Category');
const Product = require('../models/Product');

const products = [
  { sku: '32548', name: 'Alicate Universal Gedore Red R28301200', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-universal-gedore-red-r28301200/32548/p' },
  { sku: '29085', name: 'Jogo de Chaves Gedore Robust 39 Peças S49001039', brand: 'Gedore', url: 'https://loja.dicomp.com.br/jogo-de-chaves-gedore-robust-39-pecas-s49001039/29085/p' },
  { sku: '6876', name: 'Estilete Vonder 18mm emborrachado', brand: 'Vonder', url: 'https://loja.dicomp.com.br/estilete-vonder-18mm-emborrachado/6876/p' },
  { sku: '29083', name: 'Jogo de Ferramentas Gedore Robust 85 Peças S21003085', brand: 'Gedore', url: 'https://loja.dicomp.com.br/jogo-de-ferramentas-gedore-robust-85-pecas-s21003085/29083/p' },
  { sku: '28401', name: 'Alicate de Corte Diagonal Gedore Red R28402165-612', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-de-corte-diagonal-gedore-red-r28402165-612/28401/p' },
  { sku: '6867', name: 'Alicate Universal Vonder 8 Cromo Vanádio', brand: 'Vonder', url: 'https://loja.dicomp.com.br/alicate-universal-vonder-8-cromo-vanadio/6867/p' },
  { sku: '28393', name: 'Chave Philips Gedore Red R38200024-18x5', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-philips-gedore-red-r38200024-18x5/28393/p' },
  { sku: '28398', name: 'Chave Canhão 33 Gedore Red R38562424-38', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-canhao-33-gedore-red-r38562424-38/28398/p' },
  { sku: '28654', name: 'Alicate Gedore 8350-7 Micro Eletrônico de Corte Lateral de Fio', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-gedore-8350-7-micro-eletronico-de-corte-lateral-fio/28654/p' },
  { sku: '28820', name: 'Alicate Gedore 8350-6 Micro Eletrônico de Corte Lateral de Fio', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-gedore-8350-6-micro-eletronico-de-corte-lateral-de-fio/28820/p' },
  { sku: '31803', name: 'Máquina de Fusão Fibervix Fibra Óptica 6 Motores Tela Touch 55 Azul', brand: 'Fibervix', url: 'https://loja.dicomp.com.br/maquina-de-fusao-fibervix-fibra-optica-6-motores-tela-touch-55-azul/31803/p' },
  { sku: '30386', name: 'Alicate Amperímetro ET-3155 Dig Minipa', brand: 'Minipa', url: 'https://loja.dicomp.com.br/alicate-amperimetro-et-3155-dig-minipa/30386/p' },
  { sku: '28386', name: 'Alicate de Bico Reto tipo Telefone Gedore Red R28502165-612', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-de-bico-reto-tipo-telefone-gedore-red-r28502165-612/28386/p' },
  { sku: '28357', name: 'Chave Combinada Gedore Red R09100060-6mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-gedore-red-r09100060-6mm/28357/p' },
  { sku: '28402', name: 'Alicate de Bico Reto Gedore Red R28502201-8', brand: 'Gedore', url: 'https://loja.dicomp.com.br/alicate-de-bico-reto-gedore-red-r28502201-8/28402/p' },
  { sku: '28441', name: 'Chave Combinada com Catraca Gedore Red R07100190-19mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-com-catraca-gedore-red-r07100190-19mm/28441/p' },
  { sku: '6869', name: 'Alicate Bico Vonder Meia Cana 6 Cromo Vanádio', brand: 'Vonder', url: 'https://loja.dicomp.com.br/alicate-bico-vonder-meia-cana-6-cromo-vanadio/6869/p' },
  { sku: '28262', name: 'Passa Fio Vonder com Alma de Aço 10 Metros', brand: 'Vonder', url: 'https://loja.dicomp.com.br/passa-fio-vonder-com-alma-de-aco-10-metros/28262/p' },
  { sku: '6937', name: 'Multímetro Digital Minipa ET-1002 CAT I 600V', brand: 'Minipa', url: 'https://loja.dicomp.com.br/multimetro-digital-minipa-et-1002-cat-i-600v/6937/p' },
  { sku: '28052', name: 'Passa Fio Vonder com Alma de Aço 20 Metros', brand: 'Vonder', url: 'https://loja.dicomp.com.br/passa-fio-vonder-com-alma-de-aco-20-metros/28052/p' },
  { sku: '6007', name: 'Chave Enrolar/Desenrolar BLI Metálica', brand: 'BLI', url: 'https://loja.dicomp.com.br/chave-enrolardesenrolar-bli-metalica/6007/p' },
  { sku: '1566', name: 'Ponta de Teste para Multímetro 80 cm Plug 90°', brand: 'Vonder', url: 'https://loja.dicomp.com.br/ponta-de-teste-para-multimetro-80-cm-plug-90-o/1566/p' },
  { sku: '9825', name: 'Testador de Ajuste Nazda UTC para Câmeras', brand: 'Nazda', url: 'https://loja.dicomp.com.br/testador-de-ajuste-nazda-utc-para-cameras/9825/p' },
  { sku: '18233', name: 'Escada Tesoura Síntese TAF-05 em Fibra Duplo Acesso 5 Degraus 140m', brand: 'Síntese', url: 'https://loja.dicomp.com.br/escada-tesoura-sintese-taf-05-em-fibra-duplo-acesso-5-degraus-140m/18233/p' },
  { sku: '18501', name: 'Multímetro Digital Minipa ET-1507B CAT III', brand: 'Minipa', url: 'https://loja.dicomp.com.br/multimetro-digital-minipa-et-1507b-cat-iii/18501/p' },
  { sku: '18241', name: 'Encosto emborrachado para Escada de Fibra Síntese', brand: 'Síntese', url: 'https://loja.dicomp.com.br/encosto-emborrachado-para-escada-de-fibra-sintese/18241/p' },
  { sku: '25524', name: 'Protetor de Coluna Vonder em EVA para Garagem', brand: 'Vonder', url: 'https://loja.dicomp.com.br/protetor-de-coluna-vonder-em-eva-para-garagem/25524/p' },
  { sku: '27437', name: 'Colete Porta Ferramentas Vonder CL-013', brand: 'Vonder', url: 'https://loja.dicomp.com.br/colete-porta-ferramentas-vonder-cl-013/27437/p' },
  { sku: '28256', name: 'Megômetro Digital Minipa MI-2552 CAT III 600V', brand: 'Minipa', url: 'https://loja.dicomp.com.br/megometro-digital-minipa-mi-2552-cat-iii-600v/28256/p' },
  { sku: '28442', name: 'Chave Philips Gedore Red R38200129-316x6', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-philips-gedore-red-r38200129-316x6/28442/p' },
  { sku: '28358', name: 'Chave Combinada Gedore Red R09100070-7mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-gedore-red-r09100070-7mm/28358/p' },
  { sku: '28362', name: 'Chave Combinada Gedore Red R09100110-11mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-gedore-red-r09100110-11mm/28362/p' },
  { sku: '28364', name: 'Chave Combinada Gedore Red R09100150-15mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-gedore-red-r09100150-15mm/28364/p' },
  { sku: '28392', name: 'Chave de Fenda Simples Gedore Red R38101624-14x5', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-de-fenda-simples-gedore-red-r38101624-14x5/28392/p' },
  { sku: '28397', name: 'Chave Canhão 33 Gedore Red R38562024-516', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-canhao-33-gedore-red-r38562024-516/28397/p' },
  { sku: '28403', name: 'Jogo de Alicates 3 Peças Gedore Red R28001004', brand: 'Gedore', url: 'https://loja.dicomp.com.br/jogo-de-alicates-3-pecas-gedore-red-r28001004/28403/p' },
  { sku: '28608', name: 'Ponta de Prova Minipa MTL-7A CAT III 1000V CATIV 600V', brand: 'Minipa', url: 'https://loja.dicomp.com.br/ponta-de-prova-minipa-mtl-7a-cat-iii-1000v-cativ-600v/28608/p' },
  { sku: '28368', name: 'Chave Combinada Gedore Red R09100190-19mm', brand: 'Gedore', url: 'https://loja.dicomp.com.br/chave-combinada-gedore-red-r09100190-19mm/28368/p' },
  { sku: '6747', name: 'Bolsa em Lona 240 x 460 x 320 mm', brand: 'Vonder', url: 'https://loja.dicomp.com.br/bolsa-em-lona-240-x-460-x-320-mm/6747/p' },
  { sku: '6868', name: 'Alicate de Corte Diagonal Vonder 6 Cromo Vanádio', brand: 'Vonder', url: 'https://loja.dicomp.com.br/alicate-de-corte-diagonal-vonder-6-cromo-vanadio/6868/p' },
];

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

async function main() {
  const outputPath = path.join(__dirname, '../migracao/dicomp-ferramentas.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const exportData = products.map((item) => ({
    sku: String(item.sku),
    name: item.name,
    brand: item.brand,
    url: item.url,
    category: 'Ferramentas',
    source: 'DICOMP',
  }));

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

  await connectDB();

  const category = await Category.findOneAndUpdate(
    { slug: 'ferramentas' },
    {
      name: 'Ferramentas',
      slug: 'ferramentas',
      description: 'Ferramentas para manutenção, instalação e uso profissional.',
      active: true,
    },
    { upsert: true, new: true }
  );

  let created = 0;
  let updated = 0;

  for (const item of products) {
    const payload = {
      name: item.name,
      slug: `${slugify(item.name)}-${item.sku}`,
      sku: String(item.sku),
      type: 'produto',
      category: category._id,
      brand: item.brand,
      price: 0,
      cost: 0,
      promoPrice: null,
      stock: 0,
      description: '',
      shortDescription: '',
      images: [],
      active: true,
      manufacturerRef: {
        model: item.name,
        url: item.url,
        importedAt: new Date(),
      },
    };

    const existing = await Product.findOne({ sku: String(item.sku) });
    if (existing) {
      await Product.updateOne({ _id: existing._id }, payload);
      updated += 1;
    } else {
      await Product.create(payload);
      created += 1;
    }
  }

  console.log(`[dicomp-ferramentas] ${created} criados, ${updated} atualizados.`);
  console.log(`[dicomp-ferramentas] JSON salvo em ${outputPath}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('[dicomp-ferramentas] erro:', error);
  process.exit(1);
});
