const mongoose = require('mongoose');

const regionFields = {
  sul: { type: Number, default: 15 },
  sudeste: { type: Number, default: 12 },
  centroOeste: { type: Number, default: 18 },
  norte: { type: Number, default: 25 },
  nordeste: { type: Number, default: 22 },
};

const dayFields = {
  sul: { type: Number, default: 3 },
  sudeste: { type: Number, default: 4 },
  centroOeste: { type: Number, default: 5 },
  norte: { type: Number, default: 7 },
  nordeste: { type: Number, default: 6 },
};

const baseCostsSchema = new mongoose.Schema(regionFields, { _id: false });
const deliveryDaysSchema = new mongoose.Schema(dayFields, { _id: false });

const siteSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    shippingEnabled: { type: Boolean, default: true },
    freeShippingThreshold: { type: Number, default: 0 },
    costPerKg: { type: Number, default: 2 },
    baseCosts: { type: baseCostsSchema, default: () => ({}) },
    deliveryDays: { type: deliveryDaysSchema, default: () => ({}) },
    pickupEnabled: { type: Boolean, default: false },
    pickupAddress: { type: String, default: '' },
    pickupHours: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SiteSetting', siteSettingSchema);