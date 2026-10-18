/**
 * scripts/check-missing-seo.js
 *
 * Relatório de produtos com problemas de SEO no MongoDB:
 *   • Sem descrição (description vazio)
 *   • Sem descrição curta (shortDescription vazio)
 *   • Sem imagens (array images vazio ou ausente)
 *   • Sem título SEO (seoTitle vazio)
 *   • Sem meta description SEO (seoDescription vazio)
 *   • Sem marca (brand vazio)
 *   • Sem categoria (category ausente)
 *
 * Uso:
 *   cd /home/mauro/Modelos/Site/gltechcwb-node
 *   node scripts/check-missing-seo.js
 *
 * Opções:
 *   LIMIT=20   limitar quantidade de produtos listados por categoria (padrão: 20)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não definida no .env');
  process.exit(1);
}

const LIMIT = parseInt(process.env.LIMIT, 10) || 20;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  GLTechCWB — Relatório de problemas de SEO             ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const Product = mongoose.model('Product');

    // Total de produtos
    const totalProdutos = await Product.countDocuments({});
    console.log(`📦 Total de produtos: ${totalProdutos}\n`);

    // ========================================================================
    // 1. Produtos sem imagens
    // ========================================================================
    const semImagens = await Product.find(
      {
        $or: [
          { images: { $exists: false } },
          { images: null },
          { images: [] },
          { images: { $size: 0 } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, images: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  1️⃣  PRODUTOS SEM IMAGENS                                    │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { images: { $exists: false } },
        { images: null },
        { images: [] },
        { images: { $size: 0 } },
      ],
    })} produtos\n`);

    if (semImagens.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semImagens) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm imagens.\n');
    }

    // ========================================================================
    // 2. Produtos sem descrição (description)
    // ========================================================================
    const semDescricao = await Product.find(
      {
        $or: [
          { description: { $exists: false } },
          { description: null },
          { description: '' },
          { description: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, description: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  2️⃣  PRODUTOS SEM DESCRIÇÃO (description)                   │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { description: { $exists: false } },
        { description: null },
        { description: '' },
        { description: { $regex: /^\s*$/ } },
      ],
    })} produtos\n`);

    if (semDescricao.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semDescricao) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm descrição.\n');
    }

    // ========================================================================
    // 3. Produtos sem descrição curta (shortDescription)
    // ========================================================================
    const semShortDesc = await Product.find(
      {
        $or: [
          { shortDescription: { $exists: false } },
          { shortDescription: null },
          { shortDescription: '' },
          { shortDescription: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, shortDescription: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  3️⃣  PRODUTOS SEM DESCRIÇÃO CURTA (shortDescription)        │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { shortDescription: { $exists: false } },
        { shortDescription: null },
        { shortDescription: '' },
        { shortDescription: { $regex: /^\s*$/ } },
      ],
    })} produtos\n`);

    if (semShortDesc.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semShortDesc) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm descrição curta.\n');
    }

    // ========================================================================
    // 4. Produtos sem título SEO (seoTitle)
    // ========================================================================
    const semSeoTitle = await Product.find(
      {
        $or: [
          { seoTitle: { $exists: false } },
          { seoTitle: null },
          { seoTitle: '' },
          { seoTitle: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, seoTitle: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  4️⃣  PRODUTOS SEM TÍTULO SEO (seoTitle)                     │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { seoTitle: { $exists: false } },
        { seoTitle: null },
        { seoTitle: '' },
        { seoTitle: { $regex: /^\s*$/ } },
      ],
    })} produtos\n`);

    if (semSeoTitle.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semSeoTitle) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm título SEO.\n');
    }

    // ========================================================================
    // 5. Produtos sem meta description SEO (seoDescription)
    // ========================================================================
    const semSeoDesc = await Product.find(
      {
        $or: [
          { seoDescription: { $exists: false } },
          { seoDescription: null },
          { seoDescription: '' },
          { seoDescription: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, seoDescription: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  5️⃣  PRODUTOS SEM META DESCRIPTION SEO (seoDescription)     │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { seoDescription: { $exists: false } },
        { seoDescription: null },
        { seoDescription: '' },
        { seoDescription: { $regex: /^\s*$/ } },
      ],
    })} produtos\n`);

    if (semSeoDesc.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semSeoDesc) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm meta description SEO.\n');
    }

    // ========================================================================
    // 6. Produtos sem marca (brand)
    // ========================================================================
    const semMarca = await Product.find(
      {
        $or: [
          { brand: { $exists: false } },
          { brand: null },
          { brand: '' },
          { brand: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  6️⃣  PRODUTOS SEM MARCA (brand)                              │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { brand: { $exists: false } },
        { brand: null },
        { brand: '' },
        { brand: { $regex: /^\s*$/ } },
      ],
    })} produtos\n`);

    if (semMarca.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semMarca) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm marca.\n');
    }

    // ========================================================================
    // 7. Produtos sem categoria (category)
    // ========================================================================
    const semCategoria = await Product.find(
      {
        $or: [
          { category: { $exists: false } },
          { category: null },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1 }
    )
      .limit(LIMIT)
      .lean();

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  7️⃣  PRODUTOS SEM CATEGORIA                                  │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   Total: ${await Product.countDocuments({
      $or: [
        { category: { $exists: false } },
        { category: null },
      ],
    })} produtos\n`);

    if (semCategoria.length > 0) {
      console.log(`   Mostrando até ${LIMIT} exemplos:\n`);
      for (const p of semCategoria) {
        console.log(
          `   • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Marca: ${p.brand || '—'}`
        );
      }
    } else {
      console.log('   ✅ Todos os produtos têm categoria.\n');
    }

    // ========================================================================
    // RESUMO FINAL
    // ========================================================================
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log('║  RESUMO FINAL                                          ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    const problemas = [
      { nome: 'Sem imagens', count: await Product.countDocuments({
        $or: [
          { images: { $exists: false } },
          { images: null },
          { images: [] },
          { images: { $size: 0 } },
        ],
      }) },
      { nome: 'Sem descrição', count: await Product.countDocuments({
        $or: [
          { description: { $exists: false } },
          { description: null },
          { description: '' },
          { description: { $regex: /^\s*$/ } },
        ],
      }) },
      { nome: 'Sem shortDescription', count: await Product.countDocuments({
        $or: [
          { shortDescription: { $exists: false } },
          { shortDescription: null },
          { shortDescription: '' },
          { shortDescription: { $regex: /^\s*$/ } },
        ],
      }) },
      { nome: 'Sem seoTitle', count: await Product.countDocuments({
        $or: [
          { seoTitle: { $exists: false } },
          { seoTitle: null },
          { seoTitle: '' },
          { seoTitle: { $regex: /^\s*$/ } },
        ],
      }) },
      { nome: 'Sem seoDescription', count: await Product.countDocuments({
        $or: [
          { seoDescription: { $exists: false } },
          { seoDescription: null },
          { seoDescription: '' },
          { seoDescription: { $regex: /^\s*$/ } },
        ],
      }) },
      { nome: 'Sem marca', count: await Product.countDocuments({
        $or: [
          { brand: { $exists: false } },
          { brand: null },
          { brand: '' },
          { brand: { $regex: /^\s*$/ } },
        ],
      }) },
      { nome: 'Sem categoria', count: await Product.countDocuments({
        $or: [
          { category: { $exists: false } },
          { category: null },
        ],
      }) },
    ];

    problemas.sort((a, b) => b.count - a.count);

    for (const p of problemas) {
      const percentual = totalProdutos > 0 ? ((p.count / totalProdutos) * 100).toFixed(1) : 0;
      const status = p.count === 0 ? '✅' : p.count > totalProdutos * 0.5 ? '🔴' : '🟡';
      console.log(`   ${status} ${p.nome.padEnd(22)} ${String(p.count).padStart(5)} produtos (${percentual}%)`);
    }

    console.log('\n💡 Dica: Priorize corrigir produtos sem imagens e sem descrição —');
    console.log('   são os que mais impactam o SEO e a conversão.\n');

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a execução:', err.message);
    process.exit(1);
  }
}

main();
