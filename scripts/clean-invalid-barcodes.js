/**
 * scripts/clean-invalid-barcodes.js
 *
 * Remove barcodes inválidos de produtos no MongoDB.
 *
 * O Google Search Console exige que gtin/gtin13 seja um EAN-13 válido
 * (exatamente 13 dígitos numéricos). Códigos de estoque, SKUs internos
 * ou qualquer valor que não seja um código de barras global causam o erro
 * "Não é um GTIN válido globalmente".
 *
 * Este script:
 *   1. Lista produtos com barcode inválido
 *   2. Remove o campo barcode desses produtos ($unset)
 *   3. Mostra relatório antes/depois
 *
 * Uso:
 *   cd /home/mauro/Modelos/Site/gltechcwb-node
 *   cp .env.example .env   # edite MONGO_URI se necessário
 *   node scripts/clean-invalid-barcodes.js
 *
 * Opções de ambiente:
 *   MONGO_URI      string de conexão MongoDB (obrigatória)
 *   DRY_RUN=true   apenas lista, não altera nada (padrão: false)
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não definida no .env');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === 'true';

// Regex EAN-13: exatamente 13 dígitos numéricos
const EAN13_REGEX = /^\d{13}$/;

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  GLTechCWB — Limpeza de barcodes inválidos           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\nModo: ${DRY_RUN ? '🔍 DRY RUN (apenas lista, não altera)' : '⚠️  EXECUÇÃO REAL (remove barcodes inválidos)'}\n`);

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const Product = mongoose.model('Product');

    // Conta total de produtos
    const totalProdutos = await Product.countDocuments({});
    console.log(`📦 Total de produtos na coleção: ${totalProdutos}\n`);

    // Encontra produtos com barcode inválido (não null, não vazio, não EAN-13)
    const produtosInvalidos = await Product.find(
      {
        barcode: {
          $exists: true,
          $ne: null,
          $ne: '',
          $not: EAN13_REGEX,
        },
      },
      { _id: 1, sku: 1, name: 1, barcode: 1, brand: 1 }
    ).lean();

    console.log(`🔍 Produtos com barcode inválido encontrados: ${produtosInvalidos.length}\n`);

    if (produtosInvalidos.length > 0) {
      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│  Lista de produtos com barcode inválido                     │');
      console.log('└─────────────────────────────────────────────────────────────┘');

      for (const p of produtosInvalidos) {
        console.log(
          `  • ID: ${p._id} | SKU: ${p.sku || '—'} | Nome: ${p.name || '—'} | Barcode: "${p.barcode}"`
        );
      }
      console.log('');
    }

    if (DRY_RUN) {
      console.log('ℹ️  DRY RUN ativado — nenhum dado foi alterado.\n');
      console.log('Para executar a limpeza real, rode sem DRY_RUN=true');
      console.log('  Exemplo: node scripts/clean-invalid-barcodes.js\n');
      await mongoose.disconnect();
      return;
    }

    // Remove o campo barcode dos produtos inválidos
    const resultado = await Product.updateMany(
      {
        barcode: {
          $exists: true,
          $ne: null,
          $ne: '',
          $not: EAN13_REGEX,
        },
      },
      { $unset: { barcode: '' } }
    );

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Relatório de remoção                                       │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`  ✅ Barcodes removidos: ${resultado.modifiedCount}`);
    console.log(`  ✅ Produtos já válidos (sem alteração): ${totalProdutos - produtosInvalidos.length}\n`);

    // Verifica quantos restam com barcode inválido
    const restantes = await Product.countDocuments({
      barcode: {
        $exists: true,
        $ne: null,
        $ne: '',
        $not: EAN13_REGEX,
      },
    });
    console.log(`  ⚠️  Produtos ainda com barcode inválido: ${restantes}\n`);

    if (restantes === 0) {
      console.log('🎉 Limpeza concluída! Todos os barcodes inválidos foram removidos.');
      console.log('   O JSON-LD do Google não incluirá gtin13 para produtos sem barcode válido.\n');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a execução:', err.message);
    process.exit(1);
  }
}

main();
