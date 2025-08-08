const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const loginAttemptSchema = new mongoose.Schema({
  timestamp: Date,
  ip: String,
  userAgent: String,
  location: {
    country: String,
    region: String,
    city: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  success: Boolean
});

const deviceSchema = new mongoose.Schema({
  deviceId: String,
  userAgent: String,
  browser: String,
  os: String,
  device: String,
  ip: String,
  location: {
    country: String,
    region: String,
    city: String
  },
  lastUsed: Date,
  trusted: Boolean
});

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  phone: {
    type: String,
    sparse: true,
    index: true
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  refreshToken: String,
  refreshTokenExpires: Date,
  role: {
    type: String,
    enum: ['user', 'admin', 'manager'],
    default: 'user'
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorMethod: {
    type: String,
    enum: ['email',  , 'authenticator'],
    default: 'email'
  },
  twoFactorSecret: String,
  twoFactorBackupCodes: [String],
  accountLocked: {
    type: Boolean,
    default: false
  },
  accountLockedUntil: Date,
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  loginAttempts: [loginAttemptSchema],
  devices: [deviceSchema],
  permissions: [{
    resource: String,
    actions: [String]
  }]
}, {
  timestamps: true
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.incrementFailedAttempts = async function() {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= 5) {
    this.accountLocked = true;
    this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
  }
  await this.save();
};

userSchema.methods.resetFailedAttempts = async function() {
  this.failedLoginAttempts = 0;
  this.accountLocked = false;
  this.accountLockedUntil = undefined;
  await this.save();
};

userSchema.methods.isAccountLocked = function() {
  if (this.accountLocked && this.accountLockedUntil) {
    if (this.accountLockedUntil > Date.now()) {
      return true;
    }
    this.accountLocked = false;
    this.accountLockedUntil = undefined;
    this.failedLoginAttempts = 0;
  }
  return false;
};

userSchema.index({ email: 1, isEmailVerified: 1 });
userSchema.index({ 'devices.deviceId': 1 });

module.exports = mongoose.model('User', userSchema);