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

    // Input validation
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Convert both to strings for comparison and trim whitespace
    const userCode = String(user.loginVerificationCode || '').trim();
    const providedCode = String(code).trim();

    console.log('Stored code:', userCode);
    console.log('Provided code:', providedCode);
    console.log('Expiry time:', user.loginVerificationExpires);
    console.log('Current time:', new Date());

    if (!userCode || userCode !== providedCode) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (!user.loginVerificationExpires || new Date() > user.loginVerificationExpires) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

    // Clear login code
    user.loginVerificationCode = undefined;
    user.loginVerificationExpires = undefined;
    await user.save();

    // Create token
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: "1d" }
    );

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name,
        email: user.email,
        role: user.role
      } 
    });

  } catch (err) {
    console.error('Login verification error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    const userExists = await User.findOne({ email: email.toLowerCase() });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
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
        <div style="text-align:center;margin:30px 0;">
          <div style="font-size:32px;color:#4A90E2;font-weight:bold;background:#fff;padding:20px;border-radius:8px;letter-spacing:3px;">${verificationCode}</div>
        </div>
        <p style="text-align:center;">Or click the button below:</p>
        <a href="${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/verify-email/${token}" 
           style="display:block;text-align:center;margin-top:20px;padding:12px 24px;background:#4A90E2;color:#fff;text-decoration:none;border-radius:5px;">
          Verify Email Address
        </a>
        <p style="font-size:12px;color:#999;text-align:center;margin-top:40px;">This code will expire in 10 minutes. If you didn't sign up, please ignore this email.</p>
      </div>
    `;

    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        to: email,
        subject: "Verify your email",
        html: htmlContent,
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail registration if email fails
    }

    res.status(201).json({ 
      message: "Registration successful. Verification email sent.",
      userId: user._id 
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: "Email not verified" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Generate 6-digit code
    const loginCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    user.loginVerificationCode = loginCode;
    user.loginVerificationExpires = codeExpires;
    await user.save();

    console.log('Generated login code:', loginCode);
    console.log('Code expires at:', codeExpires);

    const details = await getLoginDetails(req);

    // Save login history
    try {
      await LoginHistory.create({
        user: user._id,
        loginTime: details.time,
        ...details,
      });
    } catch (historyError) {
      console.error('Failed to save login history:', historyError);
    }

    // Send verification code email
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        to: user.email,
        subject: "🔐 Your Login Verification Code",
        html: `
          <div style="font-family:'Segoe UI',sans-serif;padding:30px;background:#f9f9f9;border-radius:10px;max-width:600px;margin:auto;">
            <h2 style="color:#4A90E2;text-align:center;">🔐 Login Verification</h2>
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>Please use the following code to verify your login:</p>
            <div style="text-align:center;margin:30px 0;">
              <div style="font-size:32px;color:#27AE60;font-weight:bold;background:#fff;padding:20px;border-radius:8px;letter-spacing:3px;">${loginCode}</div>
            </div>
            <p style="text-align:center;color:#666;">This code will expire in 30 minutes.</p>
            <p style="font-size:12px;color:#999;margin-top:30px;">If you didn't request this code, please ignore this email and consider changing your password.</p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    // Send login alert email
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        to: user.email,
        subject: "🚨 New Login Alert",
        html: `
          <div style="font-family:'Segoe UI',sans-serif;padding:30px;background:#fdfdfd;border-radius:10px;max-width:600px;margin:auto;">
            <h2 style="text-align:center;color:#E74C3C;">🚨 New Login Detected</h2>
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>We detected a new login to your account:</p>
            <div style="background:#f8f9fa;padding:15px;border-radius:5px;margin:20px 0;">
              <p><strong>IP Address:</strong> ${details.ip || 'Unknown'}</p>
              <p><strong>Location:</strong> ${details.city || 'Unknown'}, ${details.country || 'Unknown'}</p>
              <p><strong>Time:</strong> ${details.currentTime || new Date().toISOString()}</p>
              ${details.org ? `<p><strong>Organization:</strong> ${details.org}</p>` : ''}
            </div>
            <p>If this wasn't you, please secure your account immediately:</p>
            <a href="${process.env.BASE_URL || 'http://localhost:3000'}/reset-password"
               style="display:block;text-align:center;margin-top:20px;padding:12px;background:#E74C3C;color:#fff;text-decoration:none;border-radius:5px;">
              Reset Password
            </a>
          </div>
        `,
      });
    } catch (alertEmailError) {
      console.error('Failed to send login alert:', alertEmailError);
    }

    res.status(200).json({ 
      message: "Login code sent to email for verification.",
      email: user.email
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    // Input validation
    if (!email || !code) {
      return res.status(400).json({ message: "Email and code are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Convert both to strings for comparison and trim whitespace
    const userCode = String(user.verificationCode || '').trim();
    const providedCode = String(code).trim();

    if (!userCode || userCode !== providedCode) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (!user.verificationCodeExpires || new Date() > user.verificationCodeExpires) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();

    res.json({ message: "Email verified successfully" });

  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Additional helper function to resend verification code
export const resendLoginCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate new code
    const loginCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    user.loginVerificationCode = loginCode;
    user.loginVerificationExpires = codeExpires;
    await user.save();

    // Send new code
    try {
      await resend.emails.send({
        from: process.env.FROM_EMAIL || 'noreply@example.com',
        to: user.email,
        subject: "🔐 New Login Verification Code",
        html: `
          <div style="font-family:'Segoe UI',sans-serif;padding:30px;background:#f9f9f9;border-radius:10px;max-width:600px;margin:auto;">
            <h2 style="color:#4A90E2;text-align:center;">🔐 New Login Verification Code</h2>
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>Here's your new login verification code:</p>
            <div style="text-align:center;margin:30px 0;">
              <div style="font-size:32px;color:#27AE60;font-weight:bold;background:#fff;padding:20px;border-radius:8px;letter-spacing:3px;">${loginCode}</div>
            </div>
            <p style="text-align:center;color:#666;">This code will expire in 30 minutes.</p>
          </div>
        `,
      });

      res.json({ message: "New verification code sent" });
    } catch (emailError) {
      console.error('Failed to send new code:', emailError);
      res.status(500).json({ message: "Failed to send verification code" });
    }

  } catch (err) {
    console.error('Resend code error:', err);
    res.status(500).json({ message: "Internal server error" });
  }
};