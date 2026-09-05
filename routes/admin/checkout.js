const express = require('express');
const router = express.Router();
const SiteSetting = require('../../models/SiteSetting');
const { getCheckoutSettings, DEFAULT_BASE_COSTS, DEFAULT_DELIVERY_DAYS } = require('../../lib/checkout-settings');

const REGIONS = [
  { key: 'sul', label: 'Sul (PR/SC/RS)' },
  { key: 'sudeste', label: 'Sudeste (SP/RJ/MG/ES)' },
  { key: 'centroOeste', label: 'Centro-Oeste (GO/MS/MT/DF)' },
  { key: 'norte', label: 'Norte (AM/PA/AP/RR/RO/AC/TO)' },
  { key: 'nordeste', label: 'Nordeste (BA/SE/AL/PE/PB/RN/CE/PI/MA)' },
];

// GET /admin/checkout — config de frete e retirada
router.get('/', async (req, res) => {
  const settings = await getCheckoutSettings();
  res.render('admin/checkout-settings', {
    settings,
    regions: REGIONS,
    saved: !!req.query.saved,
  });
});

// PUT /admin/checkout — salvar configuração
router.put('/', async (req, res) => {
  const body = req.body;

  const num = (v, def = 0) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isNaN(n) ? def : n;
  };

  const baseCosts = {};
  const deliveryDays = {};
  REGIONS.forEach((r) => {
    baseCosts[r.key] = Math.max(0, num(body['baseCost_' + r.key], DEFAULT_BASE_COSTS[r.key]));
    deliveryDays[r.key] = Math.max(1, Math.round(num(body['days_' + r.key], DEFAULT_DELIVERY_DAYS[r.key])));
  });

  let setting = await SiteSetting.findOne({ key: 'checkout' });
  if (!setting) setting = new SiteSetting({ key: 'checkout' });

  setting.shippingEnabled = body.shippingEnabled === 'on';
  setting.freeShippingThreshold = Math.max(0, num(body.freeShippingThreshold));
  setting.costPerKg = Math.max(0, num(body.costPerKg, 2));
  setting.baseCosts = baseCosts;
  setting.deliveryDays = deliveryDays;
  setting.pickupEnabled = body.pickupEnabled === 'on';
  setting.pickupAddress = String(body.pickupAddress || '').trim();
  setting.pickupHours = String(body.pickupHours || '').trim();

  await setting.save();
  res.redirect('/admin/checkout?saved=1');
});

module.exports = router;