const User = require("../models/user-model");

/**
 * Middleware to check if the logged-in user is blocked by admin
 * - If blocked: destroy session, clear cookie, redirect (or send JSON for API)
 * - Runs before protected routes to auto-logout blocked users
 */
const checkUserBlocked = async (req, res, next) => {
  try {
    const userId = req.session?.userId || req.session?.googleUserId;
    if (!userId) return next(); // User not logged in, continue

    const user = await User.findById(userId);

    // If user doesn't exist or is blocked
    if (!user || user.isBlocked) {
      // Safely destroy the session
      return req.session?.destroy((err) => {
        if (err) console.error("Error destroying session:", err);

        // Clear session cookie
        res.clearCookie("connect.sid");

        // Handle AJAX/API requests
        if (
          req.xhr ||
          req.headers.accept?.includes("json") ||
          req.headers["content-type"]?.includes("json") ||
          req.path.startsWith("/api/") ||
          req.path.includes("/checkout/")
        ) {
          return res.status(401).json({
            success: false,
            blocked: true,
            message: "Your account has been blocked. Please contact support.",
            redirect: "/login?blocked=true"
          });
        }

        // Regular browser request → redirect with blocked flag (triggers popup)
        return res.redirect("/login?blocked=true");
      });
    }

    // User exists & not blocked
    return next();

  } catch (error) {
    console.error("Error checking user blocked status:", error);

    // In case of DB or session error, log out and redirect
    return req.session?.destroy(() => {
      res.clearCookie("connect.sid");

      if (req.xhr || req.headers.accept?.includes("json")) {
        return res.status(500).json({
          success: false,
          message: "Authentication error. Please log in again.",
          redirect: "/login"
        });
      }

      return res.redirect("/login");
    });
  }
};

/**
 * Makes user data available to all EJS templates in res.locals.user
 */
const addUserContext = async (req, res, next) => {
  try {
    if (req.session.userId) {
      const userData = await User.findById(req.session.userId);
      res.locals.user = userData;
    } else {
      res.locals.user = null;
    }
    next();
  } catch (error) {
    console.error("Error in addUserContext:", error);
    res.locals.user = null;
    next();
  }
};

/**
 * Middleware to ensure user is logged in
 */
const isUserAuthenticated = (req, res, next) => {
  if (req.session.userId) return next();
  return res.redirect("/login");
};

/**
 * Prevent browser caching of sensitive pages
 */
const preventCache = (req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
};

/**
 * Redirect already-authenticated users away from login/signup
 */
const redirectIfAuthenticated = (req, res, next) => {
  if (req.session.userId) return res.redirect("/home");
  next();
};

/**
 * Validate session and optionally handle expiration
 */
const validateSession = (req, res, next) => {
  if (req.session?.userId) {
    const sessionTimeout = 24 * 60 * 60 * 1000; // 24 hours
    if (
      req.session.loginTime &&
      Date.now() - new Date(req.session.loginTime).getTime() > sessionTimeout
    ) {
      return req.session.destroy(() => {
        res.redirect("/login?expired=true");
      });
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
  validateSession
};
