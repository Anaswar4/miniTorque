
const session = require('express-session');

module.exports = session({
  secret: process.env.SESSION_SECRET || 'miniTorqueSecret',
  resave: false,
  saveUninitialized: false, // ✅ Only save when data is in the session
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours (aligned with session timeout)
    httpOnly: true,              // Prevent JS access to cookies
    secure: false                // ✅ For HTTP (localhost). Change to true in production with HTTPS
  }
});
