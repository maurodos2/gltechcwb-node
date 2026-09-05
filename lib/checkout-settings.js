const SiteSetting = require('../models/SiteSetting');

const DEFAULT_BASE_COSTS = { sul: 15, sudeste: 12, centroOeste: 18, norte: 25, nordeste: 22 };
const DEFAULT_DELIVERY_DAYS = { sul: 3, sudeste: 4, centroOeste: 5, norte: 7, nordeste: 6 };

async function getCheckoutSettings() {
  const doc = await SiteSetting.findOne({ key: 'checkout' });
  if (!doc) {
    return {
      shippingEnabled: true,
      freeShippingThreshold: 0,
      costPerKg: 2,
      baseCosts: { ...DEFAULT_BASE_COSTS },
      deliveryDays: { ...DEFAULT_DELIVERY_DAYS },
      pickupEnabled: false,
      pickupAddress: '',
      pickupHours: '',
    };
  }
  return {
    shippingEnabled: doc.shippingEnabled,
    freeShippingThreshold: doc.freeShippingThreshold || 0,
    costPerKg: doc.costPerKg || 2,
    baseCosts: { ...DEFAULT_BASE_COSTS, ...(doc.baseCosts || {}) },
    deliveryDays: { ...DEFAULT_DELIVERY_DAYS, ...(doc.deliveryDays || {}) },
    pickupEnabled: doc.pickupEnabled,
    pickupAddress: doc.pickupAddress || '',
    pickupHours: doc.pickupHours || '',
  };
}

module.exports = { getCheckoutSettings, DEFAULT_BASE_COSTS, DEFAULT_DELIVERY_DAYS };