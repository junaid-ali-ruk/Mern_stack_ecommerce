import Order from "../models/Order.js";
import User from "../models/User.js";

export const placeOrder = async (req, res) => {
  try {
    const { shippingInfo } = req.body;
    const user = await User.findById(req.user.id).populate("cart.productId");

    if (!user.cart.length) return res.status(400).json({ message: "Cart is empty" });

    const items = user.cart.map(item => ({
      productId: item.productId._id,
      quantity: item.quantity
    }));

    const totalAmount = user.cart.reduce((acc, item) => acc + item.productId.price * item.quantity, 0);

    const order = new Order({
      user: user._id,
      items,
      shippingInfo,
      totalAmount
    });

    await order.save();

    user.cart = [];
    await user.save();

    res.status(201).json({ message: "Order placed", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const createOrder = async (req, res) => {
  try {
    const { items, totalAmount, address, paymentMethod } = req.body;
    const order = new Order({
      userId: req.user.id,
      items,
      totalAmount,
      address,
      paymentMethod
    });
    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
export const getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    await order.save();

    res.json({ message: "Order status updated", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};