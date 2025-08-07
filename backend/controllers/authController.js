
import dotenv from "dotenv";
dotenv.config();
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import LoginHistory from "../models/LoginHistory.js";
import { Resend } from "resend";
import { getLoginDetails } from "../utils/userInfo.js";

const resend = new Resend(process.env.RESEND_API_KEY);

// ------------------ VERIFY LOGIN CODE ------------------

export const verifyLoginCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (
      !user ||
      user.loginVerificationCode !== String(code) ||
      new Date() > user.loginVerificationExpires
    ) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // Clear login code
    user.loginVerificationCode = undefined;
    user.loginVerificationExpires = undefined;
    await user.save();

    // Create token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token, user: { id: user._id, email: user.email } });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = new User({
      name,
      email,
      password: hashedPassword,
      isVerified: false,
      verificationCode,
      verificationCodeExpires: codeExpires,
    });

    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    const htmlContent = `
      <div style="max-width:600px;margin:auto;padding:30px;background:#f9f9f9;border-radius:10px;font-family:'Segoe UI',sans-serif;">
        <h2 style="text-align:center;color:#4A90E2;">🚀 Welcome to Our Platform</h2>
        <p>Hi <strong>${name}</strong>,<br/>Thanks for signing up! Please verify your email address to get started.</p>
        <p style="text-align:center;font-size:24px;color:#4A90E2;font-weight:bold;">${verificationCode}</p>
        <a href="${process.env.BASE_URL}/api/auth/verify-email/${token}" 
           style="display:block;text-align:center;margin-top:20px;padding:12px 24px;background:#4A90E2;color:#fff;text-decoration:none;border-radius:5px;">
          Verify Email Address
        </a>
        <p style="font-size:12px;color:#999;text-align:center;margin-top:40px;">If you didn't sign up, please ignore this email.</p>
      </div>
    `;

    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: "Verify your email",
      html: htmlContent,
    });

    res.status(201).json({ message: "Verification email sent" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};



export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });
    if (!user.isVerified) return res.status(401).json({ message: "Email not verified" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const loginCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    user.loginVerificationCode = loginCode;
    user.loginVerificationExpires = codeExpires;
    await user.save();

    const details = await getLoginDetails(req);

    await LoginHistory.create({
      user: user._id,
      loginTime: details.time,
      ...details,
    });

  
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: "🔐 Your Login Verification Code",
      html: `
        <div style="font-family:'Segoe UI',sans-serif;padding:30px;background:#f9f9f9;border-radius:10px;">
          <h2 style="color:#4A90E2;text-align:center;">🔐 Login Verification</h2>
          <p>Hello <strong>${user.name}</strong>,</p>
          <p>Please use the following code to verify your login:</p>
          <h1 style="text-align:center;color:#27AE60;">${loginCode}</h1>
          <p>This code will expire in 30 minutes.</p>
        </div>
      `,
    });


    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: user.email,
      subject: "🚨 New Login Alert",
      html: `
        <div style="font-family:'Segoe UI',sans-serif;padding:30px;background:#fdfdfd;border-radius:10px;">
          <h2 style="text-align:center;color:#E74C3C;">🚨 New Login Detected</h2>
          <p>Details:</p>
          <ul>
            <li><strong>IP:</strong> ${details.ip}</li>
            <li><strong>City:</strong> ${details.city}</li>
            <li><strong>Country:</strong> ${details.country} ${details.flagEmoji}</li>
            <li><strong>Org:</strong> ${details.org}</li>
            <li><strong>Time:</strong> ${details.currentTime}</li>
          </ul>
          <a href="${process.env.BASE_URL}/reset-password"
             style="display:block;text-align:center;margin-top:20px;padding:12px;background:#E74C3C;color:#fff;text-decoration:none;border-radius:5px;">
            Reset Password
          </a>
        </div>
      `,
    });

    res.status(200).json({ message: "Login code sent to email for verification." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isVerified) return res.status(400).json({ message: "User already verified" });

    if (
      user.verificationCode !== String(code) ||
      new Date() > user.verificationCodeExpires
    ) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ message: "Email verified successfully" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
