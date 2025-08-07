import express from "express";
import {
  addToCart,
  removeFromCart,

} from "../controllers/cartController.js";
import {
  addToWishlist,
  removeFromWishlist
} from "../controllers/wishlistController.js"
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/cart/add", verifyToken, addToCart);
router.post("/cart/remove", verifyToken, removeFromCart);
router.post("/wishlist/add", verifyToken, addToWishlist);
router.post("/wishlist/remove", verifyToken, removeFromWishlist);

export default router;
