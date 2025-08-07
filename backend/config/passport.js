import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import GitHubStrategy from "passport-github2";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

// Only configure Google OAuth if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  console.log('✅ Configuring Google OAuth strategy');
  
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/api/oauth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists with this email
          const existingUser = await User.findOne({ 
            email: profile.emails?.[0]?.value 
          });
          
          if (existingUser) {
            return done(null, existingUser);
          }

          // Create new user
          const newUser = await User.create({
            name: profile.displayName || profile.name?.givenName || 'Google User',
            email: profile.emails?.[0]?.value,
            password: "google_oauth_" + Date.now(), // Random password for OAuth users
            isVerified: true, // OAuth users are pre-verified
            avatar: profile.photos?.[0]?.value,
          });
          
          done(null, newUser);
        } catch (err) {
          console.error('Google OAuth error:', err);
          done(err, null);
        }
      }
    )
  );
} else {
  console.log('⚠️  Google OAuth credentials not found - Google login disabled');
}

// Only configure GitHub OAuth if credentials are provided
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  console.log('✅ Configuring GitHub OAuth strategy');
  
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "/api/oauth/github/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // GitHub might not always provide email in the profile
          const email = profile.emails?.[0]?.value || `${profile.username}@github.local`;
          
          // Check if user already exists with this email
          const existingUser = await User.findOne({ email });
          
          if (existingUser) {
            return done(null, existingUser);
          }

          // Create new user
          const newUser = await User.create({
            name: profile.displayName || profile.username || 'GitHub User',
            email: email,
            password: "github_oauth_" + Date.now(), // Random password for OAuth users
            isVerified: true, // OAuth users are pre-verified
            avatar: profile.photos?.[0]?.value,
          });
          
          done(null, newUser);
        } catch (err) {
          console.error('GitHub OAuth error:', err);
          done(err, null);
        }
      }
    )
  );
} else {
  console.log('⚠️  GitHub OAuth credentials not found - GitHub login disabled');
}

// Serialize/deserialize user for session support (if using sessions)
passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

export default passport;