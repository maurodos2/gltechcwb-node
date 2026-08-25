const mongoose = require('mongoose');

// Uma variação de produto (ex: SSD 240GB vs 480GB; mouse preto vs branco)
const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // ex: "480GB"
    sku: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    promoPrice: { type: Number, min: 0, default: null },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    shortDescription: {
      type: String,
      default: '',
      maxlength: 300,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },

    // "produto" tem estoque físico; "servico" (ex: formatação, manutenção)
    // não tem estoque no sentido tradicional — fica sempre disponível.
    type: {
      type: String,
      enum: ['produto', 'servico'],
      default: 'produto',
    },

    // Custo de aquisição, usado internamente para calcular margem — não
    // exibido na vitrine pública.
    cost: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Código de barras real (EAN/UPC), quando existir. Códigos gerados
    // internamente por sistemas de terceiros não devem ser guardados aqui.
    barcode: {
      type: String,
      trim: true,
      default: null,
    },

    // Preço/estoque "base" — usados quando o produto NÃO tem variações
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    promoPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    stock: {
      type: Number,
      min: 0,
      default: 0,
    },

    hasVariants: {
      type: Boolean,
      default: false,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },

    images: {
      type: [String], // caminhos relativos em /public/uploads
      default: [],
    },

    specs: {
      // pares chave/valor livres: { "Interface": "SATA III", "Capacidade": "480GB" }
      type: Map,
      of: String,
      default: {},
    },

    weightKg: { type: Number, default: 0 },

    active: {
      type: Boolean,
      default: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },

    seoTitle: { type: String, default: '' },
    seoDescription: { type: String, default: '' },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', description: 'text', brand: 'text' });

// Preço efetivo considerando promoção, sem depender de variação
productSchema.methods.getEffectivePrice = function () {
  if (this.hasVariants) return null; // ver variante específica
  return this.promoPrice && this.promoPrice > 0 ? this.promoPrice : this.price;
};

module.exports = mongoose.model('Product', productSchema);
