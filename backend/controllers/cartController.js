const cartService = require('../services/cartService');
const { validationResult } = require('express-validator');

exports.getCart = async (req, res) => {
  try {
    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId,
      metadata: {
        deviceType: req.device?.type,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    };

    const cart = await cartService.getCart(identifier);

    res.json({
      success: true,
      cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, quantity = 1, variantId, customization, gift } = req.body;

    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const options = {
      variantId,
      customization,
      gift,
      addedFrom: req.body.addedFrom || 'product_page',
      reserveStock: req.body.reserveStock !== false
    };

    const cart = await cartService.addToCart(
      identifier,
      productId,
      quantity,
      options
    );

    res.json({
      success: true,
      cart,
      message: 'Product added to cart'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { itemId } = req.params;
    const { quantity } = req.body;

    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const cart = await cartService.updateCartItemQuantity(
      identifier,
      itemId,
      quantity
    );

    res.json({
      success: true,
      cart,
      message: 'Cart updated successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;

    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const cart = await cartService.removeFromCart(identifier, itemId);

    res.json({
      success: true,
      cart,
      message: 'Item removed from cart'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const cart = await cartService.clearCart(identifier);

    res.json({
      success: true,
      cart,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;

    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const cart = await cartService.applyCoupon(identifier, couponCode);

    res.json({
      success: true,
      cart,
      message: 'Coupon applied successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const { couponCode } = req.params;

    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const cart = await cartService.removeCoupon(identifier, couponCode);

    res.json({
      success: true,
      cart,
      message: 'Coupon removed successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getCartSummary = async (req, res) => {
  try {
    const identifier = {
      userId: req.userId || null,
      sessionId: req.sessionId || req.cookies.sessionId
    };

    const summary = await cartService.getCartSummary(identifier);

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.syncCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const sessionId = req.cookies.sessionId || req.body.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID required' });
    }

    const cart = await cartService.mergeCarts(req.userId, sessionId);

    res.json({
      success: true,
      cart,
      message: 'Cart synced successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};