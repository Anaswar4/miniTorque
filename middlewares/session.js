const session = require('express-session');
const MongoStore = require('connect-mongo');

module.exports = session({
  secret: process.env.SESSION_SECRET || 'miniTorqueSecret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/miniTorqueSessions',
    collectionName: 'sessions'
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: false // set to true ONLY if using HTTPS
  }
});
