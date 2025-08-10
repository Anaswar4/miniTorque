const express = require('express');
const path = require('path');
require('dotenv').config();
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
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize()); // Initialize Passport
app.use(passport.session()); // Enable Passport session support

app.use((req, res, next) => {
  res.locals.user = req.user || null;
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