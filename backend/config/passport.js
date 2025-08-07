import passport from "passport";
import GoogleStrategy from "passport-google-oauth20";
import GitHubStrategy from "passport-github2";
import User from "../models/User.js";
import dotenv from "dotenv";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await User.findOne({ email: profile.emails[0].value });
        if (existingUser) return done(null, existingUser);

        const newUser = await User.create({
          name: profile.displayName,
          email: profile.emails[0].value,
          password: "google_oauth",
        });
        done(null, newUser);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "/api/auth/github/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const existingUser = await User.findOne({ email: profile.emails[0].value });
        if (existingUser) return done(null, existingUser);

        const newUser = await User.create({
          name: profile.username,
          email: profile.emails[0].value,
          password: "github_oauth",
        });
        done(null, newUser);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

export default passport;
