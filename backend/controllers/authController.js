const User = require('../models/User');

const rolePermissions = {
  admin: {
    products: ['create', 'read', 'update', 'delete'],
    orders: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    analytics: ['read'],
    settings: ['read', 'update']
  },
  manager: {
    products: ['create', 'read', 'update'],
    orders: ['read', 'update'],
    users: ['read'],
    analytics: ['read'],
    settings: ['read']
  },
  user: {
    products: ['read'],
    orders: ['create', 'read'],
    users: ['read:own', 'update:own'],
    analytics: [],
    settings: []
  }
};

exports.checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const userPermissions = rolePermissions[user.role];
      
      if (!userPermissions || !userPermissions[resource]) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const allowedActions = userPermissions[resource];
      
      if (action.includes(':own')) {
        const baseAction = action.split(':')[0];
        if (allowedActions.includes(action) || allowedActions.includes(baseAction)) {
          req.ownershipRequired = true;
          return next();
        }
      } else if (allowedActions.includes(action)) {
        return next();
      }

      res.status(403).json({ message: 'Insufficient permissions' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};

exports.checkOwnership = (getResourceOwnerId) => {
  return async (req, res, next) => {
    if (!req.ownershipRequired) {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);
      
      if (ownerId.toString() !== req.userId.toString()) {
        return res.status(403).json({ message: 'Access denied: not owner' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};

 
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const emailService = require('../services/emailService');

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = Date.now() + 3600000;

    const user = await User.create({
      email,
      password,
      emailVerificationToken,
      emailVerificationExpires
    });

    await emailService.sendVerificationEmail(email, emailVerificationToken);

    const { accessToken, refreshToken } = generateTokens(user._id);
    
    user.refreshToken = refreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({ message: 'Please verify your email first' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    
    user.refreshToken = refreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      accessToken,
      user: {
        id: user._id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await User.findOne({
      _id: decoded.userId,
      refreshToken,
      refreshTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const tokens = generateTokens(user._id);
    
    user.refreshToken = tokens.refreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken: tokens.accessToken });
  } catch (error) {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (user) {
      user.refreshToken = undefined;
      user.refreshTokenExpires = undefined;
      await user.save();
    }
    
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};