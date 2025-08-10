// const session = require('express-session');

// module.exports = session({
//     secret: 'miniTorqueSecret',
//     resave: false,
//     saveUninitialized: true,
//     cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
// });

const session = require('express-session');

module.exports = session({
  secret: process.env.SESSION_SECRET || 'miniTorqueSecret',
  resave: false,
  saveUninitialized: false, // ✅ Only save when data is in the session
  cookie: { 
    maxAge: 60 * 60 * 1000, // 1 hour
    httpOnly: true,         // Prevent JS access to cookies
    secure: false           // ✅ For HTTP (localhost). Change to true in production with HTTPS
  }
});
