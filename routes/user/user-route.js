const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../../controllers/user/user-controller");
const { isUserAuthenticated, preventCache, redirectIfAuthenticated, validateSession } = require("../../middlewares/user-middleware");
const { addUserContext, checkUserBlocked } = require("../../middlewares/user-middleware");

// Google OAuth routes
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/signup" }),(req, res) => {
    // Regenerate session for security
    req.session.regenerate((err) => {
      if (err) {
        console.error('Google OAuth session regeneration error:', err);
        return res.redirect('/login?error=session');
      }
      // Set user session data
      req.session.userId = req.user._id;
      req.session.email = req.user.email;
      req.session.loginTime = new Date();
      req.session.googleUserId = req.user._id; // For Google OAuth identification
      // Save session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('Google OAuth session save error:', err);
          return res.redirect('/login?error=session');
        }
        res.redirect("/home");
      });
    });
  }
);

// Landing page - redirect authenticated users to home
router.get("/", preventCache, redirectIfAuthenticated, validateSession, addUserContext, checkUserBlocked, userController.loadHome);

// Public routes - redirect authenticated users away from login/signup
router.get("/signup", preventCache, redirectIfAuthenticated, validateSession, userController.showSignup);
router.get("/login", preventCache, redirectIfAuthenticated, validateSession, userController.showLogin);
router.post("/signup", redirectIfAuthenticated, userController.signup);

// OTP routes
router.get("/verify-otp", preventCache, redirectIfAuthenticated, userController.loadOtpPage);
router.post("/verify-otp", redirectIfAuthenticated, userController.verifyOTP);
router.post("/resend-otp", redirectIfAuthenticated, userController.resendOTP);

// Login route
router.post("/login", redirectIfAuthenticated, userController.login);

// Forgot password routes - redirect authenticated users
router.get("/forgot-password", preventCache, redirectIfAuthenticated, validateSession, userController.forgotPasswordPage);
router.post("/forgot-password", redirectIfAuthenticated, userController.handleForgotPassword);
router.get("/forgot-verify-otp", preventCache, redirectIfAuthenticated, validateSession, userController.showForgotOtpPage);
router.post("/forgot-verify-otp", redirectIfAuthenticated, userController.verifyForgotOtp);
router.post("/resend-forgot-verify-otp", redirectIfAuthenticated, userController.resendForgotOtp);
router.get("/new-password", preventCache, redirectIfAuthenticated, validateSession, userController.renderResetPasswordPage);
router.post("/reset-password", redirectIfAuthenticated, userController.handleNewPassword);

// Authenticated routes
router.get("/home", validateSession, addUserContext, checkUserBlocked, userController.loadHome);

// Logout route
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userController.logout);

module.exports = router;