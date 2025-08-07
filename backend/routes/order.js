// File: backend/routes/order.js

import express from "express";
import {
  createOrder,
  getUserOrders,
  getAllOrders,
  updateOrderStatus,
  placeOrder
} from "../controllers/orderController.js";
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer routes
router.post("/", verifyToken, createOrder);
router.post("/place", verifyToken, placeOrder);
router.get("/my-orders", verifyToken, getUserOrders);

// Admin routes
router.get("/admin/all", verifyToken, isAdmin, getAllOrders);
router.put("/admin/update/:id", verifyToken, isAdmin, updateOrderStatus);

// General admin routes (for backward compatibility)
router.get("/", verifyToken, getAllOrders);
router.put("/:id", verifyToken, updateOrderStatus);

export default router;