// File: backend/routes/payment.js

import express from "express";
import { createStripeSession } from "../controllers/paymentController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create Stripe checkout session
router.post("/create-checkout-session", verifyToken, createStripeSession);

// Health check for payment service
router.get("/health", (req, res) => {
  res.json({ 
    message: "Payment service is running",
    stripe: process.env.STRIPE_SECRET_KEY ? "configured" : "not configured"
  });
});

export default router;