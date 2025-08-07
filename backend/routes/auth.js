import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { register, login, verifyEmail, verifyLoginCode } from "../controllers/authController.js";
const router = express.Router();
router.post("/register", register);
router.post("/login", login);
router.get("/verify-email/:token", async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const user = await user.findById(decoded.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isVerified = true;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch (err) {
    res.status(400).json({ message: "Invalid or expired token" });
  }
});
router.post("/refresh-token", async (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await user.findById(decoded.id);
    if (!user) return res.sendStatus(403);

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    res.sendStatus(403);
  }
});
router.post("/verify-email", verifyEmail);
router.post("/verify-login-code", verifyLoginCode);

export default router;