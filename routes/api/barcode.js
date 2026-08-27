const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/barcode/:code — busca dados do produto por código de barras
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code.replace(/\D/g, '');
    if (code.length < 8) {
      return res.status(400).json({ error: 'Código de barras inválido.' });
    }

    // Tentar UPCitemdb (grátis, sem key para uso básico)
    const data = await lookupUPCItemDB(code);
    if (data) return res.json({ success: true, source: 'upcitemdb', data });

    // Fallback: tentar Open Food Facts (só alimentos, mas funciona sem key)
    const offData = await lookupOpenFoodFacts(code);
    if (offData) return res.json({ success: true, source: 'openfoodfacts', data: offData });

    res.json({ success: false, message: 'Produto não encontrado no banco de dados.' });
  } catch (err) {
    console.error('[barcode] Erro:', err.message);
    res.status(500).json({ error: 'Erro ao buscar código de barras.' });
  }
});

async function lookupUPCItemDB(code) {
  try {
    const response = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup`, {
      params: { upc: code },
      timeout: 8000,
    });

    const items = response.data?.items;
    if (!items || !items.length) return null;

    const item = items[0];
    const title = item.title || '';
    const description = item.description || '';
    const brand = item.brand || '';
    const category = item.category || '';
    const images = (item.images || []).slice(0, 6);

    return {
      name: title.substring(0, 150),
      description: description.substring(0, 1000),
      shortDescription: description.substring(0, 300),
      brand: brand,
      barcode: code,
      images,
      category,
      offers: item.offers || [],
    };
  } catch (err) {
    // UPCitemdb pode retornar 422 se não encontrar
    return null;
  }
}

async function lookupOpenFoodFacts(code) {
  try {
    const response = await axios.get(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json`,
      { timeout: 5000 }
    );

    const product = response.data?.product;
    if (!product || response.data.status !== 1) return null;

    return {
      name: (product.product_name || '').substring(0, 150),
      description: (product.generic_name || product.ingredients_text || '').substring(0, 1000),
      shortDescription: (product.generic_name || '').substring(0, 300),
      brand: product.brands || '',
      barcode: code,
      images: product.image_url ? [product.image_url] : [],
      category: product.categories || '',
    };
  } catch (err) {
    return null;
  }
}

module.exports = router;
