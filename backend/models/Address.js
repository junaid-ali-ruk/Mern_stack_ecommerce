const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  label: {
    type: String,
    required: true,
    default: 'Home'
  },
  type: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home'
  },
  fullName: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  alternatePhone: String,
  email: String,
  company: String,
  addressLine1: {
    type: String,
    required: true
  },
  addressLine2: String,
  landmark: String,
  city: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  postalCode: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true,
    default: 'US'
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isBilling: {
    type: Boolean,
    default: true
  },
  isShipping: {
    type: Boolean,
    default: true
  },
  deliveryInstructions: String,
  accessCode: String,
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending'
  },
  verifiedAt: Date,
  lastUsedAt: Date,
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

addressSchema.index({ user: 1, isDefault: 1 });
addressSchema.index({ user: 1, type: 1 });

addressSchema.pre('save', async function(next) {
  if (this.isDefault) {
    await this.constructor.updateMany(
      { user: this.user, _id: { $ne: this._id } },
      { isDefault: false }
    );
  }
  next();
});

addressSchema.methods.verify = async function() {
  this.verificationStatus = 'verified';
  this.verifiedAt = new Date();
  await this.save();
  return this;
};

addressSchema.methods.incrementUsage = async function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  await this.save();
};

addressSchema.statics.getUserAddresses = async function(userId) {
  return this.find({ user: userId }).sort('-isDefault -lastUsedAt');
};

module.exports = mongoose.model('Address', addressSchema);