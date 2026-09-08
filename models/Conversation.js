const mongoose = require('mongoose');

// Conversa do atendimento do WhatsApp. Uma conversa por número (waId).
// Guarda histórico (limitado), status do atendimento e "contexto" temporário
// usado pelo bot (ex.: lista de produtos aguardando o cliente escolher).
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'bot'], required: true },
    text: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    waId: {
      type: String,
      required: true,
      unique: true,
      trim: true, // ex.: "5541999999999@c.us"
    },
    phone: { type: String, default: '' }, // só dígitos, sem "@c.us"
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

    // status: bot responde sozinho; human: atendente assumiu (bot não responde,
    // só registra e avisa no grupo de handoff, se configurado).
    status: { type: String, enum: ['bot', 'human'], default: 'bot' },

    handoffGroup: { type: String, default: '' },

    // contexto temporário do fluxo do bot (ex.: escolha de produto)
    context: { type: mongoose.Schema.Types.Mixed, default: null },

    messages: { type: [messageSchema], default: [], maxlength: 300 },

    lastMessageAt: { type: Date, default: null },
    firstContactAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ waId: 1 }, { unique: true });
conversationSchema.index({ lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);