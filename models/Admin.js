const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'editor'],
      default: 'editor',
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

adminSchema.methods.checkPassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

adminSchema.statics.hashPassword = function (plainPassword) {
  return bcrypt.hash(plainPassword, 10);
};

module.exports = mongoose.model('Admin', adminSchema);
