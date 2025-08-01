const User = require("../models/user-model");

//Handle google user and normal user 
const checkUserBlocked = async (req, res, next) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;

    // If no session found, move to next
    if (!userId) 
      return next();

    // Fetch user from DB
    const user = await User.findById(userId);

    // If user doesn't exist or is blocked
    if (!user || user.isBlocked) {
      // Only clear user-specific session data, not the entire session
      // This prevents affecting admin sessions
      if (req.session.userId) {
        delete req.session.userId;
      }
      if (req.session.googleUserId) {
        delete req.session.googleUserId;
      }
      if (req.session.email) {
        delete req.session.email;
      }
      if (req.session.loginTime) {
        delete req.session.loginTime;
      }

      // Save the session to persist the changes
      req.session.save((err) => {
        if (err) console.error('Error saving session after user logout:', err);
      });

      // AJAX request handling - check for various indicators of AJAX/API requests
      if (req.xhr || 
          req.headers.accept?.indexOf('json') > -1 || 
          req.headers['content-type']?.indexOf('json') > -1 ||
          req.path.startsWith('/api/') ||
          req.path.includes('/checkout/')) {
        return res.status(401).json({
          success: false,
          blocked: true,
          message: 'Your account has been blocked. Please contact support.',
          redirect: '/login?blocked=true'
        });
      }

      // Regular redirect with blocked flag
      return res.redirect('/login?blocked=true');
    }

    // User valid
    return next();

  } catch (error) {
    console.error('Error checking user blocked status:', error);

    // Only clear user-specific session data on error, not the entire session
    if (req.session.userId) {
      delete req.session.userId;
    }
    if (req.session.googleUserId) {
      delete req.session.googleUserId;
    }

    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(500).json({
        success: false,
        message: 'Authentication error. Please login again.',
        redirect: '/login'
      });
    }

    return res.redirect('/login');
  }
};

//Makes that user data available in all views (EJS pages)
const addUserContext = async (req, res, next) => {
  try {
    // Check if user is logged in
    if (req.session.userId) {
      // Get user data from database
      const userData = await User.findById(req.session.userId);

      // Add user data to res.locals so it's available in all views
      res.locals.user = userData;
    } else {
      // No user logged in
      res.locals.user = null;
    }

    next();
  } catch (error) {
    console.error('Error in addUserContext middleware:', error);
    // Don't block the request, just set user to null
    res.locals.user = null;
    next();
  }
};

// Authentication middleware - check if user is logged in
const isUserAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  return res.redirect('/login');
};

// Prevent caching middleware
const preventCache = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// Redirect authenticated users away from login/signup pages
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return res.redirect('/home');
  }
  next();
};

// Validate session middleware
const validateSession = (req, res, next) => {
  // Basic session validation
  if (req.session && req.session.userId) {
    // Check if session has expired (optional)
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    if (req.session.loginTime && (Date.now() - new Date(req.session.loginTime).getTime()) > sessionTimeout) {
      req.session.destroy();
      return res.redirect('/login?expired=true');
    }
  }
  next();
};

module.exports = { 
  checkUserBlocked, 
  addUserContext,
  isUserAuthenticated,
  preventCache,
  redirectIfAuthenticated,
  validateSession,
};