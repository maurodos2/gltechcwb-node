const express = require('express');
const router = express.Router();
const axios = require('axios');

// POST /api/shipping/calculate — calcula frete via ViaCEP + tabela de preços
router.post('/calculate', async (req, res) => {
  try {
    const { zipCode, items } = req.body;

    if (!zipCode || zipCode.replace(/\D/g, '').length !== 8) {
      return res.status(400).json({ error: 'CEP inválido.' });
    }

    // Buscar dados do CEP
    const cep = zipCode.replace(/\D/g, '');
    const viaCepRes = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
    const cepData = viaCepRes.data;

    if (cepData.erro) {
      return res.status(404).json({ error: 'CEP não encontrado.' });
    }

    // Calcular peso total dos itens
    const totalWeight = (items || []).reduce((sum, item) => {
      return sum + (item.weightKg || 0.5) * (item.quantity || 1);
    }, 0);

    const totalValue = (items || []).reduce((sum, item) => {
      return sum + (item.price || 0) * (item.quantity || 1);
    }, 0);

    const weight = Math.max(0.3, totalWeight); // mínimo 300g

    // Simular frete baseado na região e peso
    // Em produção, integrar com API dos Correios ou similar
    let shippingCost = 0;
    let deliveryDays = 5;

    // Simplicação: frete base + adicional por kg
    const baseRegion = getRegion(cepData.uf);
    const baseCost = { sul: 15, sudeste: 12, centroOeste: 18, norte: 25, nordeste: 22 };
    shippingCost = (baseCost[baseRegion] || 15) + (weight * 2);
    deliveryDays = { sul: 3, sudeste: 4, centroOeste: 5, norte: 7, nordeste: 6 }[baseRegion] || 5;

    // Frete grátis acima de R$300
    if (totalValue >= 300) {
      shippingCost = 0;
    }

    shippingCost = Math.round(shippingCost * 100) / 100;

    res.json({
      success: true,
      shipping: {
        cost: shippingCost,
        deliveryDays,
        city: cepData.localidade,
        state: cepData.uf,
        district: cepData.bairro,
        street: cepData.logradouro,
        freeShipping: totalValue >= 300,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao calcular frete.' });
  }
});

function getRegion(uf) {
  const regions = {
    sul: ['PR', 'SC', 'RS'],
    sudeste: ['SP', 'RJ', 'MG', 'ES'],
    centroOeste: ['GO', 'MS', 'MT', 'DF'],
    norte: ['AM', 'PA', 'AP', 'RR', 'RO', 'AC', 'TO'],
    nordeste: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA'],
  };

  for (const [region, states] of Object.entries(regions)) {
    if (states.includes(uf)) return region;
  }
  return 'sudeste';
}

module.exports = router;
