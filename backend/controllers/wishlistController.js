import User from "../models/User.js";
import Product from "../models/Product.js";

export const addToCart = async (req, res) => {
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
};

export const removeFromCart = async (req, res) => {
  const { productId } = req.body;
  const user = await User.findById(req.user.id);
  user.cart = user.cart.filter(item => !item.productId.equals(productId));
  await user.save();
  res.json(user.cart);
};

export const addToWishlist = async (req, res) => {
  const { productId } = req.body;
  const user = await User.findById(req.user.id);
  if (!user.wishlist.includes(productId)) {
    user.wishlist.push(productId);
    await user.save();
  }
  res.json(user.wishlist);
};
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate("products");
    res.json(wishlist || { products: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const removeFromWishlist = async (req, res) => {
  const { productId } = req.body;
  const user = await User.findById(req.user.id);
  user.wishlist = user.wishlist.filter(id => !id.equals(productId));
  await user.save();
  res.json(user.wishlist);
};
