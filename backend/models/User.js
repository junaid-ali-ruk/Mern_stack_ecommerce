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
      }
    }
  ],

  wishlist: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],

  // Email verification fields
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  
  verificationCode: { 
    type: String,
    select: false // Don't include in queries by default
  },
  
  verificationCodeExpires: { 
    type: Date,
    select: false
  },

  // Login verification fields
  loginVerificationCode: {
    type: String,
    select: false
  },
  
  loginVerificationExpires: {
    type: Date,
    select: false
  },

  // 2FA fields
  twoFASecret: { 
    type: String,
    select: false
  },
  
  isTwoFAEnabled: { 
    type: Boolean, 
    default: false 
  },

  // Account security
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
    default: 0
  },

  // Profile fields
  avatar: {
    type: String
  },
  
  phone: {
    type: String,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please provide a valid phone number']
  },
  
  dateOfBirth: {
    type: Date
  },
  
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },

  // Preferences
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      push: { type: Boolean, default: true }
    },
    currency: {
      type: String,
      default: 'USD'
    },
    language: {
      type: String,
      default: 'en'
    }
  }

}, { 
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.verificationCode;
      delete ret.loginVerificationCode;
      delete ret.twoFASecret;
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for better performance
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ verificationCode: 1 });
userSchema.index({ loginVerificationCode: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Methods
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  // Update passwordChangedAt when password is modified
  if (this.isModified('password') && !this.isNew) {
    this.passwordChangedAt = new Date();
  }
  
  // Update lastLoginAt
  if (this.isModified('loginVerificationCode') && this.loginVerificationCode) {
    this.lastLoginAt = new Date();
  }
  
  next();
});

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findVerifiedUser = function(email) {
  return this.findOne({ 
    email: email.toLowerCase().trim(), 
    isVerified: true 
  });
};

export default mongoose.model('User', userSchema);