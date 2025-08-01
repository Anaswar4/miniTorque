const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const User = require('../models/user-model'); // your unified User model
const bcrypt = require('bcrypt');

passport.use('admin-local', new LocalStrategy(
    { usernameField: 'email' },
    async (email, password, done) => {
        try {
            // Find admin user by email and isAdmin flag
            const admin = await User.findOne({ email, isAdmin: true });
            if (!admin) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            const isMatch = await bcrypt.compare(password, admin.password);
            if (!isMatch) {
                return done(null, false, { message: 'Invalid credentials' });
            }
            return done(null, admin);
        } catch (error) {
            return done(error);
        }
    }
));

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            scope: ['profile', 'email']
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                let user = await User.findOne({ googleId: profile.id });

                if (!user) {
                    const emailExists = await User.findOne({ email: profile.emails[0].value });
                    if (emailExists) {
                        return done(new Error('Email already registered'), null);
                    }
                    user = await User.create({
                        googleId: profile.id,
                        fullName: profile.displayName,
                        email: profile.emails[0].value,
                        picture: profile.photos?.[0]?.value || '',
                        authMethod: 'google'
                    });
                }

                return done(null, user);
            } catch (err) {
                console.error('Google auth error:', err);
                return done(err, null);
            }
        }
    )
);

// Serialize user: store only id and isAdmin flag to differentiate
passport.serializeUser((user, done) => {
    done(null, { id: user._id, isAdmin: user.isAdmin });
});

// Deserialize user based on id and isAdmin flag
passport.deserializeUser(async (data, done) => {
    try {
        const user = await User.findById(data.id);
        if (!user) return done(null, false);
        // Optionally verify isAdmin flag matches
        if (user.isAdmin !== data.isAdmin) return done(null, false);
        done(null, user);
    } catch (error) {
        done(error);
    }
});

module.exports = passport;
