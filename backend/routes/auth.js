// ============ FIXED AUTH ROUTES ============
// File: backend/routes/auth.js

import dotenv from "dotenv";
dotenv.config();
import express from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { 
  register, 
  login, 
  verifyEmail, 
  verifyLoginCode,
  resendLoginCode 
} from "../controllers/authController.js";

const router = express.Router();

// Registration route
router.post("/register", register);

// Login route
router.post("/login", login);

// Email verification routes
router.post("/verify-email", verifyEmail);

// Email verification via link (GET route)
router.get("/verify-email/:token", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?message=already-verified`);
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    // Redirect to frontend with success message
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?message=verification-success`);
  } catch (err) {
    console.error('Email verification via link error:', err);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?message=verification-failed`);
  }
});

// Login code verification
router.post("/verify-login-code", verifyLoginCode);

// Resend login code
router.post("/resend-login-code", resendLoginCode);

// Refresh token route
router.post("/refresh-token", async (req, res) => {
  const token = req.cookies?.refreshToken;
  
  if (!token) {
    return res.status(401).json({ message: "No refresh token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const accessToken = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: "15m" }
    );
    
    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(403).json({ message: "Invalid refresh token" });
  }
});

// Logout route
router.post("/logout", (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: "Logged out successfully" });
});

// Get current user route
router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -verificationCode -loginVerificationCode -twoFASecret');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(401).json({ message: "Invalid token" });
  }
});

export default router;