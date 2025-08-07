import express from "express";
import { addToWishlist, getWishlist, removeFromWishlist } from "../controllers/wishlistController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
const router = express.Router();

router.get("/", verifyToken, getWishlist);
router.post("/add", verifyToken, addToWishlist);
router.post("/remove", verifyToken, removeFromWishlist);

export default router;
