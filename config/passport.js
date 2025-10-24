const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/user-model"); 

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        user = new User({
          fullName: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id,
          picture: profile.photos[0].value,
          authMethod: 'google',
          isVerified: true
        });

        await user.save();
      }

      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// Serialize/deserialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

module.exports = passport;