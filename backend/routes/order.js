import express from "express";
import {
    createOrder,
    getUserOrders,
    getAllOrders,
    updateOrderStatus,
    placeOrder
} from "../controllers/orderController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { isAdmin } from "../middleware/authMiddleware.js";
const router = express.Router();

router.post("/", verifyToken, createOrder);
router.get("/my-orders", verifyToken, getUserOrders);
router.get("/", verifyToken, getAllOrders);
router.put("/:id", verifyToken, updateOrderStatus);
router.post("/place", verifyToken, placeOrder);
router.get("/admin/all", verifyToken, isAdmin, getAllOrders);
router.put("/admin/update/:id", verifyToken, isAdmin, updateOrderStatus);


export default router;

