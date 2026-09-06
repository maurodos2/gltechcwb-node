const express = require('express');
const router = express.Router();
const Product = require('../../models/Product');
const manufacturer = require('../../lib/manufacturer/import');

// GET /admin/imports — lista produtos com marca importável (tool manual)
router.get('/', async (req, res) => {
  const produtos = await Product.find({ type: 'produto' }).sort('name');

  const itens = produtos
    .map((p) => ({
      produto: p,
      marca: manufacturer.IMPORTADORES[manufacturer.detectarMarca(p)]
        ? manufacturer.IMPORTADORES[manufacturer.detectarMarca(p)].marca
        : '',
      modelo: manufacturer.extrairModelo(p),
    }))
    .filter((x) => x.marca);

  let resultado = null;
  if (req.query.resultado) {
    try {
      resultado = JSON.parse(req.query.resultado);
    } catch (e) {
      resultado = null;
    }
  }

  res.render('admin/imports', { itens, resultado });
});

// POST /admin/imports/:id — roda a importação de UM produto
router.post('/:id', async (req, res) => {
  const produto = await Product.findById(req.params.id);
  if (!produto) {
    return res.redirect('/admin/imports');
  }

  const modelo = (req.body.modelo || '').trim();
  let r;
  try {
    r = await manufacturer.importarProduto(produto, { modelo });
  } catch (e) {
    console.error('[import-manufacturer] erro ao importar:', e);
    r = { status: 'erro', motivo: e.message || 'Erro inesperado' };
  }

  r.nome = produto.name;
  const q = new URLSearchParams({ resultado: JSON.stringify(r) });
  res.redirect(`/admin/imports?${q.toString()}`);
});

module.exports = router;