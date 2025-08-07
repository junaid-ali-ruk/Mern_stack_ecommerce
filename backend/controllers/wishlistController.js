// File: backend/controllers/wishlistController.js

import User from "../models/User.js";
import Wishlist from "../models/Wishlist.js";

// Get user's wishlist
export const getWishlist = async (req, res) => {
  try {
    // Try to get from separate Wishlist model first
    let wishlist = await Wishlist.findOne({ userId: req.user.id }).populate("products");
    
    if (!wishlist) {
      // If no separate wishlist, get from user model
      const user = await User.findById(req.user.id).populate("wishlist");
      wishlist = {
        products: user?.wishlist || []
      };
    }

    res.json(wishlist);
  } catch (err) {
    console.error('Get wishlist error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Add item to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    // Try to use separate Wishlist model first
    let wishlist = await Wishlist.findOne({ userId: req.user.id });
    
    if (wishlist) {
      // Check if product is already in wishlist
      if (!wishlist.products.includes(productId)) {
        wishlist.products.push(productId);
        await wishlist.save();
      }
    } else {
      // Create new wishlist
      wishlist = new Wishlist({
        userId: req.user.id,
        products: [productId]
      });
      await wishlist.save();
    }

    // Also update user model for backward compatibility
    const user = await User.findById(req.user.id);
    if (user && !user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }

    // Return updated wishlist
    const updatedWishlist = await Wishlist.findOne({ userId: req.user.id }).populate("products");
    res.json(updatedWishlist);
    
  } catch (err) {
    console.error('Add to wishlist error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Remove item from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    // Remove from separate Wishlist model
    const wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (wishlist) {
      wishlist.products = wishlist.products.filter(id => !id.equals(productId));
      await wishlist.save();
    }

    // Also remove from user model for backward compatibility
    const user = await User.findById(req.user.id);
    if (user) {
      user.wishlist = user.wishlist.filter(id => !id.equals(productId));
      await user.save();
    }

    // Return updated wishlist
    const updatedWishlist = await Wishlist.findOne({ userId: req.user.id }).populate("products");
    res.json(updatedWishlist || { products: [] });
    
  } catch (err) {
    console.error('Remove from wishlist error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Legacy functions for backward compatibility (these were duplicated in the original file)
export const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const user = await User.findById(req.user.id);

    const existingItem = user.cart.find(item => item.productId.equals(productId));
    if (existingItem) {
      existingItem.quantity += quantity || 1;
    } else {
      user.cart.push({ productId, quantity: quantity || 1 });
    }

    await user.save();
    res.json(user.cart);
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ message: err.message });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const user = await User.findById(req.user.id);
    user.cart = user.cart.filter(item => !item.productId.equals(productId));
    await user.save();
    res.json(user.cart);
  } catch (err) {
    console.error('Remove from cart error:', err);
    res.status(500).json({ message: err.message });
  }
};