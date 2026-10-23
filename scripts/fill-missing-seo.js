/**
 * scripts/fill-missing-seo.js
 *
 * Preenche automaticamente campos de SEO em falta para produtos no MongoDB:
 *   • seoTitle (título da página no Google)
 *   • seoDescription (meta description do Google)
 *   • shortDescription (descrição curta usada no JSON-LD e vitrine)
 *
 * Regras de geração (pt-BR):
 *   • seoTitle: "{nome} | {marca} | GLTechCWB"
 *   • shortDescription: primeiro parágrafo do standardDescriptionHtml (texto puro)
 *   • seoDescription: "{nome} — {marca}, disponível na GLTechCWB com garantia e envio para todo o Brasil. Compre em até 12x."
 *
 * Uso:
 *   cd /home/mauro/Modelos/Site/gltechcwb-node
 *   node scripts/fill-missing-seo.js          # execução real
 *   DRY_RUN=true node scripts/fill-missing-seo.js  # apenas simula
 *   LIMIT=50 node scripts/fill-missing-seo.js      # limita quantidade
 *
 * Opções de ambiente:
 *   MONGO_URI   string de conexão MongoDB (obrigatória)
 *   DRY_RUN=true  apenas lista, não altera nada
 *   LIMIT=N     limita a quantidade de produtos processados
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Registra modelos antes de usar mongoose.model() e .populate()
require('../models/Product');
require('../models/Category');

const MONGO_URI = process.env.MONGO_URI;
const DRY_RUN = process.env.DRY_RUN === 'true';
const LIMIT = parseInt(process.env.LIMIT, 10) || 100;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI não definida no .env');
  process.exit(1);
}

// Regex EAN-13 para validar barcode (reutilizada)
const EAN13_REGEX = /^\d{13}$/;

// ---------------------------------------------------------------------------
// Função auxiliar: gera um slug simples a partir de um texto
// ---------------------------------------------------------------------------
function gerarSlug(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Função auxiliar: gera seoTitle
// Formato: "{nome} | {marca} | GLTechCWB" (máximo 60 caracteres para o Google)
// ---------------------------------------------------------------------------
function gerarSeoTitle(produto) {
  const nome = (produto.name || 'Produto').trim();
  const marca = produto.brand ? ` | ${produto.brand}` : '';
  const sufixo = ' | GLTechCWB';

  let titulo = `${nome}${marca}${sufixo}`;

  // Se passar de 60 caracteres, corta o nome mas mantém marca e sufixo
  if (titulo.length > 60) {
    const espacoParaNome = 60 - marca.length - sufixo.length - 3; // 3 = "..."
    const nomeCortado = nome.slice(0, Math.max(10, espacoParaNome)).trimEnd() + '...';
    titulo = `${nomeCortado}${marca}${sufixo}`;
  }

  return titulo;
}

// ---------------------------------------------------------------------------
// Função auxiliar: gera seoDescription (120-150 caracteres)
// ---------------------------------------------------------------------------
function gerarSeoDescription(produto) {
  const nome = (produto.name || 'Produto').trim();
  const marca = produto.brand ? `${produto.brand}, ` : '';

  let desc = `${nome} — ${marca}disponível na GLTechCWB com garantia e envio para todo o Brasil. Compre em até 12x.`;

  if (desc.length > 150) {
    desc = desc.slice(0, 147).trimEnd() + '…';
  }
  if (desc.length < 120) {
    desc = desc + ' Produto original com nota fiscal.';
  }

  return desc;
}

// ---------------------------------------------------------------------------
// Função auxiliar: gera shortDescription (texto puro, sem HTML)
// Baseado no standardDescriptionHtml mas sem as tags
// ---------------------------------------------------------------------------
function gerarShortDescription(produto) {
  const nome = (produto.name || 'produto').trim();
  const categoria = produto.category && produto.category.name ? produto.category.name : '';
  const marca = produto.brand || 'fabricante';

  const intro = `O ${nome}${categoria ? `, da categoria ${categoria},` : ''} é uma escolha confiável para quem busca desempenho, durabilidade e bom custo-benefício. Desenvolvido pela ${marca}, atende desde o uso doméstico até o ambiente profissional, sempre com a garantia de um produto original e acompanhado de nota fiscal.`;

  return intro;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  GLTechCWB — Preenchimento automático de SEO           ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`\nModo: ${DRY_RUN ? '🔍 DRY RUN (apenas simula, não altera)' : '⚠️  EXECUÇÃO REAL (atualiza MongoDB)'}\n`);
  console.log(`Limite de produtos: ${LIMIT}\n`);

  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    const Product = mongoose.model('Product');

    // Encontra produtos que faltam pelo menos um campo de SEO
    const produtosSemSEO = await Product.find(
      {
        $or: [
          { seoTitle: { $exists: false } },
          { seoTitle: null },
          { seoTitle: '' },
          { seoTitle: { $regex: /^\s*$/ } },
          { seoDescription: { $exists: false } },
          { seoDescription: null },
          { seoDescription: '' },
          { seoDescription: { $regex: /^\s*$/ } },
          { shortDescription: { $exists: false } },
          { shortDescription: null },
          { shortDescription: '' },
          { shortDescription: { $regex: /^\s*$/ } },
        ],
      },
      { _id: 1, sku: 1, name: 1, brand: 1, category: 1, seoTitle: 1, seoDescription: 1, shortDescription: 1 }
    )
      .populate('category', 'name slug')
      .limit(LIMIT)
      .lean();

    const totalSemSEO = await Product.countDocuments({
      $or: [
        { seoTitle: { $exists: false } },
        { seoTitle: null },
        { seoTitle: '' },
        { seoTitle: { $regex: /^\s*$/ } },
        { seoDescription: { $exists: false } },
        { seoDescription: null },
        { seoDescription: '' },
        { seoDescription: { $regex: /^\s*$/ } },
        { shortDescription: { $exists: false } },
        { shortDescription: null },
        { shortDescription: '' },
        { shortDescription: { $regex: /^\s*$/ } },
      ],
    });

    console.log(`📦 Produtos com campos de SEO em falta: ${totalSemSEO}\n`);

    if (produtosSemSEO.length === 0) {
      console.log('✅ Todos os produtos já possuem campos de SEO preenchidos!\n');
      await mongoose.disconnect();
      return;
    }

    // Conta quantos precisam de cada campo
    let countSeoTitle = 0;
    let countSeoDescription = 0;
    let countShortDescription = 0;

    const atualizacoes = [];

    for (const p of produtosSemSEO) {
      const precisaSeoTitle = !p.seoTitle || p.seoTitle.trim() === '';
      const precisaSeoDesc = !p.seoDescription || p.seoDescription.trim() === '';
      const precisaShortDesc = !p.shortDescription || p.shortDescription.trim() === '';

      if (precisaSeoTitle) countSeoTitle++;
      if (precisaSeoDesc) countSeoDescription++;
      if (precisaShortDesc) countShortDescription++;

      const campos = {};
      if (precisaSeoTitle) campos.seoTitle = gerarSeoTitle(p);
      if (precisaSeoDesc) campos.seoDescription = gerarSeoDescription(p);
      if (precisaShortDesc) campos.shortDescription = gerarShortDescription(p);

      atualizacoes.push({
        id: p._id,
        sku: p.sku || '—',
        nome: p.name || '—',
        marca: p.brand || '—',
        campos,
      });
    }

    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Campos a serem preenchidos                                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   📝 seoTitle:         ${countSeoTitle} produtos`);
    console.log(`   📝 seoDescription:   ${countSeoDescription} produtos`);
    console.log(`   📝 shortDescription: ${countShortDescription} produtos\n`);

    if (DRY_RUN) {
      console.log('┌─────────────────────────────────────────────────────────────┐');
      console.log('│  Exemplo de produtos que seriam alterados                   │');
      console.log('└─────────────────────────────────────────────────────────────┘');

      for (const u of atualizacoes.slice(0, 10)) {
        console.log(`\n   • ${u.nome} (SKU: ${u.sku})`);
        if (u.campos.seoTitle) console.log(`     seoTitle:     ${u.campos.seoTitle}`);
        if (u.campos.seoDescription) console.log(`     seoDesc:      ${u.campos.seoDescription}`);
        if (u.campos.shortDescription) console.log(`     shortDesc:    ${u.campos.shortDescription.substring(0, 80)}...`);
      }

      if (atualizacoes.length > 10) {
        console.log(`\n   ... e mais ${atualizacoes.length - 10} produtos`);
      }

      console.log('\nℹ️  DRY RUN ativado — nenhum dado foi alterado.');
      console.log('Para executar a atualização real, rode sem DRY_RUN=true\n');
      await mongoose.disconnect();
      return;
    }

    // Executa atualizações
    console.log('🔄 Atualizando produtos no MongoDB...\n');

    let sucessos = 0;
    let erros = 0;

    for (const u of atualizacoes) {
      try {
        await Product.updateOne({ _id: u.id }, { $set: u.campos });
        sucessos++;
      } catch (err) {
        console.error(`   ❌ Erro ao atualizar ${u.nome}: ${err.message}`);
        erros++;
      }
    }

    console.log('\n┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Resultado da atualização                                   │');
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`   ✅ Sucessos: ${sucessos}`);
    console.log(`   ❌ Erros: ${erros}\n`);

    // Verifica quantos restam sem SEO
    const restantes = await Product.countDocuments({
      $or: [
        { seoTitle: { $exists: false } },
        { seoTitle: null },
        { seoTitle: '' },
        { seoTitle: { $regex: /^\s*$/ } },
        { seoDescription: { $exists: false } },
        { seoDescription: null },
        { seoDescription: '' },
        { seoDescription: { $regex: /^\s*$/ } },
        { shortDescription: { $exists: false } },
        { shortDescription: null },
        { shortDescription: '' },
        { shortDescription: { $regex: /^\s*$/ } },
      ],
    });

    console.log(`   ⚠️  Produtos ainda com campos de SEO em falta: ${restantes}\n`);

    if (restantes === 0) {
      console.log('🎉 Todos os produtos agora têm campos de SEO preenchidos!\n');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Erro durante a execução:', err.message);
    process.exit(1);
  }
}

main();
