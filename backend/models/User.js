import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address']
  },
  
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },

  role: { 
    type: String, 
    enum: {
      values: ['customer', 'admin'],
      message: 'Role must be either customer or admin'
    }, 
    default: 'customer' 
  },

  cart: [
    {
      productId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Product',
        required: true
      },
      quantity: { 
        type: Number, 
        default: 1,
        min: [1, 'Quantity must be at least 1']
      },
      addedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],

  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],

  isVerified: { 
    type: Boolean, 
    default: false 
  },
  
  verificationCode: { 
    type: String,
    select: false
  },
  
  verificationCodeExpires: { 
    type: Date,
    select: false
  },

  loginVerificationCode: {
    type: String,
    select: false
  },
  
  loginVerificationExpires: {
    type: Date,
    select: false
  },

  twoFASecret: { 
    type: String,
    select: false
  },
  
  isTwoFAEnabled: { 
    type: Boolean, 
    default: false 
  },

  lastLoginAt: {
    type: Date
  },
  
  passwordChangedAt: {
    type: Date
  },
  
  accountLocked: {
    type: Boolean,
    default: false
  },
  
  lockUntil: {
    type: Date
  },
  
  loginAttempts: {
    type: Number,
    default: 0,
    max: [10, 'Too many login attempts']
  },

  avatar: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  
  phone: {
    type: String,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v <= new Date();
      },
      message: 'Date of birth cannot be in the future'
    }
  },
  
  address: {
    street: {
      type: String,
      trim: true,
      maxlength: [100, 'Street address cannot exceed 100 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [50, 'City name cannot exceed 50 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State name cannot exceed 50 characters']
    },
    zipCode: {
      type: String,
      trim: true,
      match: [/^[0-9]{5}(-[0-9]{4})?$|^[A-Z0-9]{3}\s?[A-Z0-9]{3}$/, 'Please provide a valid zip code']
    },
    country: {
      type: String,
      trim: true,
      maxlength: [50, 'Country name cannot exceed 50 characters']
    }
  },

  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true },
      marketing: { type: Boolean, default: false }
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR']
    },
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko']
    },
    theme: {
      type: String,
      default: 'light',
      enum: ['light', 'dark', 'auto']
    }
  },

  orderHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],

  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative']
  },

  loyaltyPoints: {
    type: Number,
    default: 0,
    min: [0, 'Loyalty points cannot be negative']
  },

  isActive: {
    type: Boolean,
    default: true
  },

  suspensionReason: {
    type: String,
    trim: true
  },

  suspendedAt: {
    type: Date
  },

  emailVerifiedAt: {
    type: Date
  },

  agreesToTerms: {
    type: Boolean,
    required: [true, 'You must agree to the terms and conditions']
  },

  termsAcceptedAt: {
    type: Date,
    default: Date.now
  },

  privacyPolicyAccepted: {
    type: Boolean,
    default: true
  }

}, { 
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.verificationCode;
      delete ret.loginVerificationCode;
      delete ret.twoFASecret;
      delete ret.__v;
      return ret;
    }
  },
  toObject: {
    virtuals: true
  }
});

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ verificationCode: 1 });
userSchema.index({ loginVerificationCode: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ lastLoginAt: -1 });

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual('fullAddress').get(function() {
  if (!this.address) return null;
  
  const parts = [
    this.address.street,
    this.address.city,
    this.address.state,
    this.address.zipCode,
    this.address.country
  ].filter(Boolean);
  
  return parts.length > 0 ? parts.join(', ') : null;
});

userSchema.virtual('memberSince').get(function() {
  return this.createdAt ? this.createdAt.toDateString() : null;
});

userSchema.virtual('cartTotal').get(function() {
  return this.cart.reduce((total, item) => total + (item.quantity || 0), 0);
});

userSchema.virtual('wishlistCount').get(function() {
  return this.wishlist ? this.wishlist.length : 0;
});

userSchema.methods.incLoginAttempts = function() {
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000;

  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { 
      lockUntil: Date.now() + lockTime,
      accountLocked: true
    };
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { 
      loginAttempts: 1, 
      lockUntil: 1 
    },
    $set: {
      accountLocked: false
    }
  });
};

userSchema.methods.addToCart = function(productId, quantity = 1) {
  const existingItem = this.cart.find(item => 
    item.productId.toString() === productId.toString()
  );
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    this.cart.push({ 
      productId, 
      quantity,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

userSchema.methods.removeFromCart = function(productId) {
  this.cart = this.cart.filter(item => 
    item.productId.toString() !== productId.toString()
  );
  return this.save();
};

userSchema.methods.clearCart = function() {
  this.cart = [];
  return this.save();
};

userSchema.methods.addToWishlist = function(productId) {
  if (!this.wishlist.includes(productId)) {
    this.wishlist.push(productId);
  }
  return this.save();
};

userSchema.methods.removeFromWishlist = function(productId) {
  this.wishlist = this.wishlist.filter(id => 
    id.toString() !== productId.toString()
  );
  return this.save();
};

userSchema.methods.addLoyaltyPoints = function(points) {
  this.loyaltyPoints += points;
  return this.save();
};

userSchema.methods.deductLoyaltyPoints = function(points) {
  if (this.loyaltyPoints >= points) {
    this.loyaltyPoints -= points;
    return this.save();
  }
  throw new Error('Insufficient loyalty points');
};

userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

userSchema.methods.suspendAccount = function(reason) {
  this.isActive = false;
  this.suspensionReason = reason;
  this.suspendedAt = new Date();
  return this.save();
};

userSchema.methods.activateAccount = function() {
  this.isActive = true;
  this.suspensionReason = undefined;
  this.suspendedAt = undefined;
  return this.save();
};

userSchema.pre('save', function(next) {
  if (this.isModified('password') && !this.isNew) {
    this.passwordChangedAt = new Date();
  }
  
  if (this.isModified('isVerified') && this.isVerified && !this.emailVerifiedAt) {
    this.emailVerifiedAt = new Date();
  }
  
  next();
});

userSchema.pre('save', function(next) {
  if (this.cart && this.cart.length > 50) {
    return next(new Error('Cart cannot contain more than 50 items'));
  }
  
  if (this.wishlist && this.wishlist.length > 100) {
    return next(new Error('Wishlist cannot contain more than 100 items'));
  }
  
  next();
});

userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findVerifiedUser = function(email) {
  return this.findOne({ 
    email: email.toLowerCase().trim(), 
    isVerified: true,
    isActive: true
  });
};

userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

userSchema.statics.getTopCustomers = function(limit = 10) {
  return this.find({ role: 'customer' })
    .sort({ totalSpent: -1 })
    .limit(limit)
    .select('name email totalSpent loyaltyPoints lastLoginAt');
};

userSchema.statics.getUserStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        verifiedUsers: { $sum: { $cond: ['$isVerified', 1, 0] } },
        activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
        adminUsers: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } }
      }
    }
  ]);
};

export default mongoose.model('User', userSchema); 