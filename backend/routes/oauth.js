import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";

const router = express.Router();

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/google/callback", passport.authenticate("google", { session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${token}`);
});

router.get("/github", passport.authenticate("github", { scope: ["user:email"] }));

router.get("/github/callback", passport.authenticate("github", { session: false }), (req, res) => {
  const token = jwt.sign({ id: req.user._id, role: req.user.role }, process.env.JWT_SECRET, { expiresIn: "1d" });
  res.redirect(`${process.env.FRONTEND_URL}/oauth-success?token=${token}`);
});

export default router;
