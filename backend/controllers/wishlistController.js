const Wishlist = require('../models/Wishlist');
const { validationResult } = require('express-validator');

exports.getWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const wishlist = await Wishlist.getDefaultWishlist(req.userId);
    
    await wishlist.populate({
      path: 'items.product',
      select: 'name slug images basePrice comparePrice stock status rating'
    });

    const priceChanges = await wishlist.checkPriceChanges();

    res.json({
      success: true,
      wishlist,
      priceChanges
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { productId, variantId } = req.body;

    const wishlist = await Wishlist.getDefaultWishlist(req.userId);
    await wishlist.addItem(productId, variantId);

    await wishlist.populate({
      path: 'items.product',
      select: 'name slug images basePrice comparePrice'
    });

    res.json({
      success: true,
      wishlist,
      message: 'Product added to wishlist'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.params;

    const wishlist = await Wishlist.getDefaultWishlist(req.userId);
    await wishlist.removeItem(itemId);

    res.json({
      success: true,
      wishlist,
      message: 'Item removed from wishlist'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.moveToCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.params;

    const Cart = require('../models/Cart');
    const cart = await Cart.findOrCreate({ userId: req.userId });
    
    const wishlist = await Wishlist.getDefaultWishlist(req.userId);
    const result = await wishlist.moveToCart(itemId, cart._id);

    res.json({
      success: true,
      cart: result.cart,
      wishlist: result.wishlist,
      message: 'Item moved to cart'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { name, visibility, tags, occasion, targetDate } = req.body;

    const wishlist = await Wishlist.create({
      user: req.userId,
      name,
      visibility,
      tags,
      occasion,
      targetDate
    });

    res.status(201).json({
      success: true,
      wishlist
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserWishlists = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const wishlists = await Wishlist.find({ user: req.userId })
      .select('name items visibility occasion targetDate isDefault createdAt')
      .sort('-isDefault -createdAt');

    res.json({
      success: true,
      wishlists
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { wishlistId } = req.params;
    const updates = req.body;

    const wishlist = await Wishlist.findOneAndUpdate(
      { _id: wishlistId, user: req.userId },
      updates,
      { new: true, runValidators: true }
    );

    if (!wishlist) {
      return res.status(404).json({ message: 'Wishlist not found' });
    }

    res.json({
      success: true,
      wishlist
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteWishlist = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { wishlistId } = req.params;

    const wishlist = await Wishlist.findOneAndDelete({
      _id: wishlistId,
      user: req.userId,
      isDefault: false
    });

    if (!wishlist) {
      return res.status(404).json({ 
        message: 'Wishlist not found or cannot delete default wishlist' 
      });
    }

    res.json({
      success: true,
      message: 'Wishlist deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.setPriceAlert = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { itemId } = req.params;
    const { targetPrice, enabled = true } = req.body;

    const wishlist = await Wishlist.getDefaultWishlist(req.userId);
    const item = wishlist.items.id(itemId);

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    item.priceAlert = {
      enabled,
      targetPrice,
      lastNotified: null
    };

    await wishlist.save();

    res.json({
      success: true,
      message: 'Price alert set successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};