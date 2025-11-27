require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const passport = require('passport');
const db = require('./config/db');
db();
const sessionMiddleware = require('./middlewares/session');
const userMiddleware = require('./middlewares/user-middleware');
const app = express();

// Initialize Passport configuration
require('./config/passport'); // Load passport.js configuration

// Route imports
const authRoutes = require('./routes/user/user-route');
const adminRoutes = require('./routes/admin/admin-route');

// View engine and static setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure static file serving with proper MIME types for videos
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

// Middleware
app.use(express.urlencoded({  extended: true, limit: '50mb' }));
app.use(express.json({  limit: '50mb'  }));
app.use(sessionMiddleware);
app.use(passport.initialize()); // Initialize Passport
app.use(passport.session()); // Enable Passport session support

app.use((req, res, next) => {
  // Only set user from req.user if res.locals.user hasn't been set by addUserContext middleware
  if (!res.locals.user) {
    res.locals.user = req.user || null;
  }
  next();
});




// Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);




// Error handler
app.use((err, req, res, next) => {
  // General error handling
  console.error('Server error:', err);
  res.status(500).render('error', { message: 'Internal server error', error: { status: 500 } });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { message: 'Page not found', error: { status: 404 } });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));