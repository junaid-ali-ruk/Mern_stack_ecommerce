// File: backend/routes/cart.js

import express from "express";
import { addToCart, getCart, removeFromCart } from "../controllers/cartController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get user's cart
router.get("/", verifyToken, getCart);

// Add item to cart
router.post("/add", verifyToken, addToCart);

// Remove item from cart
router.post("/remove", verifyToken, removeFromCart);

// Alternative routes (for backward compatibility)
router.post("/cart/add", verifyToken, addToCart);
router.post("/cart/remove", verifyToken, removeFromCart);
router.get("/cart", verifyToken, getCart);

export default router;