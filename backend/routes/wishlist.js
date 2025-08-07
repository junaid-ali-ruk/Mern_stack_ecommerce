// File: backend/routes/wishlist.js

import express from "express";
import { addToWishlist, getWishlist, removeFromWishlist } from "../controllers/wishlistController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get user's wishlist
router.get("/", verifyToken, getWishlist);

// Add item to wishlist
router.post("/add", verifyToken, addToWishlist);

// Remove item from wishlist
router.post("/remove", verifyToken, removeFromWishlist);

export default router;