import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";

const router = express.Router();

// Check if OAuth strategies are configured
const isGoogleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const isGitHubConfigured = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role }, 
    process.env.JWT_SECRET, 
    { expiresIn: "1d" }
  );
};

// Helper function to handle OAuth success
const handleOAuthSuccess = (req, res) => {
  try {
    const token = generateToken(req.user);
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/oauth-success?token=${token}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('OAuth success handler error:', error);
    const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=oauth_error`;
    res.redirect(errorUrl);
  }
};

// Google OAuth routes (only if configured)
if (isGoogleConfigured) {
  router.get("/google", 
    passport.authenticate("google", { 
      scope: ["profile", "email"] 
    })
  );

  router.get("/google/callback", 
    passport.authenticate("google", { 
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=google_auth_failed`
    }), 
    handleOAuthSuccess
  );
} else {
  // Disabled routes with helpful error messages
  router.get("/google", (req, res) => {
    res.status(503).json({ 
      message: "Google OAuth is not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment variables." 
    });
  });

  router.get("/google/callback", (req, res) => {
    res.status(503).json({ 
      message: "Google OAuth is not configured." 
    });
  });
}

// GitHub OAuth routes (only if configured)
if (isGitHubConfigured) {
  router.get("/github", 
    passport.authenticate("github", { 
      scope: ["user:email"] 
    })
  );

  router.get("/github/callback", 
    passport.authenticate("github", { 
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=github_auth_failed`
    }), 
    handleOAuthSuccess
  );
} else {
  // Disabled routes with helpful error messages
  router.get("/github", (req, res) => {
    res.status(503).json({ 
      message: "GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your environment variables." 
    });
  });

  router.get("/github/callback", (req, res) => {
    res.status(503).json({ 
      message: "GitHub OAuth is not configured." 
    });
  });
}

// OAuth status endpoint
router.get("/status", (req, res) => {
  res.json({
    google: {
      enabled: isGoogleConfigured,
      endpoint: isGoogleConfigured ? "/api/oauth/google" : null
    },
    github: {
      enabled: isGitHubConfigured,
      endpoint: isGitHubConfigured ? "/api/oauth/github" : null
    }
  });
});

export default router;