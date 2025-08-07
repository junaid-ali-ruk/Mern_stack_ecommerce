import Cart from "../models/Cart.js";

export const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const cart = await Cart.findOne({ userId: req.user.id });

    if (cart) {
      const item = cart.items.find(item => item.productId.toString() === productId);
      if (item) {
        item.quantity += quantity;
      } else {
        cart.items.push({ productId, quantity });
      }
      await cart.save();
      return res.json(cart);
    }

    const newCart = new Cart({ userId: req.user.id, items: [{ productId, quantity }] });
    await newCart.save();
    res.status(201).json(newCart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getCart = async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.id }).populate("items.productId");
    res.json(cart || { items: [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.body;
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(item => item.productId.toString() !== productId);
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
