const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    name: { type: String, required: true }, // snapshot do nome no momento da compra
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customer: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, default: '' },
    },
    shippingAddress: {
      street: String,
      number: String,
      complement: String,
      district: String,
      city: { type: String, default: 'Curitiba' },
      state: { type: String, default: 'PR' },
      zipCode: String,
    },
    items: {
      type: [orderItemSchema],
      required: true,
    },
    itemsTotal: { type: Number, required: true },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, required: true },

    status: {
      type: String,
      enum: ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending_payment',
    },

    paymentMethod: { type: String, default: '' }, // ex: "pix", "cartao", "boleto"
    paymentProviderRef: { type: String, default: '' }, // id da transação no gateway

    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
