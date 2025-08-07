import express from "express";
import { createStripeSession } from "../controllers/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create-checkout-session", verifyToken, createStripeSession);

export default router;
