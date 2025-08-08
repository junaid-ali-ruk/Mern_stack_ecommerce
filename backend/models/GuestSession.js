const mongoose = require('mongoose');

const guestSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  cart: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cart'
  },
  ipAddress: String,
  userAgent: String,
  deviceFingerprint: String,
  location: {
    country: String,
    region: String,
    city: String,
    postalCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  referrer: String,
  landingPage: String,
  utmParams: {
    source: String,
    medium: String,
    campaign: String,
    term: String,
    content: String
  },
  viewedProducts: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    viewedAt: Date,
    timeSpent: Number
  }],
  searchQueries: [{
    query: String,
    timestamp: Date,
    resultsCount: Number
  }],
  interactions: [{
    type: {
      type: String,
      enum: ['click', 'scroll', 'hover', 'form_interaction']
    },
    element: String,
    timestamp: Date,
    value: mongoose.Schema.Types.Mixed
  }],
  convertedToUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  conversionDate: Date,
  lastActivity: {
    type: Date,
    default: Date.now
  },
  pageViews: {
    type: Number,
    default: 0
  },
  timeOnSite: {
    type: Number,
    default: 0
  },
  bounced: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: () => new Date(+new Date() + 30*24*60*60*1000),
    index: true
  }
}, {
  timestamps: true
});

guestSessionSchema.index({ lastActivity: -1 });
guestSessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

guestSessionSchema.methods.recordInteraction = async function(interaction) {
  this.interactions.push({
    ...interaction,
    timestamp: new Date()
  });
  
  if (this.interactions.length > 100) {
    this.interactions = this.interactions.slice(-100);
  }
  
  this.lastActivity = new Date();
  await this.save();
};

guestSessionSchema.methods.recordProductView = async function(productId, timeSpent = 0) {
  const existingView = this.viewedProducts.find(
    v => v.product.toString() === productId.toString()
  );
  
  if (existingView) {
    existingView.timeSpent += timeSpent;
    existingView.viewedAt = new Date();
  } else {
    this.viewedProducts.push({
      product: productId,
      viewedAt: new Date(),
      timeSpent
    });
  }
  
  if (this.viewedProducts.length > 50) {
    this.viewedProducts = this.viewedProducts.slice(-50);
  }
  
  this.lastActivity = new Date();
  await this.save();
};

guestSessionSchema.methods.convertToUser = async function(userId) {
  this.convertedToUser = userId;
  this.conversionDate = new Date();
  
  const Cart = mongoose.model('Cart');
  if (this.cart) {
    const guestCart = await Cart.findById(this.cart);
    if (guestCart) {
      guestCart.user = userId;
      await guestCart.save();
    }
  }
  
  await this.save();
  return this;
};

module.exports = mongoose.model('GuestSession', guestSessionSchema);