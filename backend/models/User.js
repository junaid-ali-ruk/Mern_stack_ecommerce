import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },

  cart: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      quantity: { type: Number, default: 1 }
    }
  ],

  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],

  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  verificationCodeExpires: { type: Date },
  loginVerificationCode: {
    type: String,
  },
  loginVerificationExpires: {
    type: Date,
  },
  twoFASecret: { type: String },
  isTwoFAEnabled: { type: Boolean, default: false },

}, { timestamps: true });

export default mongoose.model('User', userSchema);
