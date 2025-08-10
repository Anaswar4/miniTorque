const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../../controllers/user/user-controller");
const { isUserAuthenticated, preventCache, redirectIfAuthenticated, validateSession } = require("../../middlewares/user-middleware");
const { addUserContext, checkUserBlocked } = require("../../middlewares/user-middleware");


// Google OAuth Start
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
);


// Google OAuth Callback - FIXED
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signup" }),
  (req, res, next) => {
    // 🔹 First, regenerate the session to prevent fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regen error:", err);
        return res.redirect("/login?error=session");
      }

      // 🔹 Now tell Passport to store the logged-in user in the new session
      req.login(req.user, (err) => {
        if (err) {
          console.error("Passport login error:", err);
          return res.redirect("/login?error=login");
        }

        // 🔹 Store your custom session values
        req.session.userId = req.user._id;
        req.session.email = req.user.email;
        req.session.loginTime = new Date();
        req.session.googleUserId = req.user._id;

        // 🔹 Save the updated session and redirect
        req.session.save((err) => {
          if (err) {
            console.error("Session save error:", err);
            return res.redirect("/login?error=session");
          }
          res.redirect("/home");
        });
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
//  Show forgot password page (GET)
router.get(
  "/forgot-password",
  preventCache,
  redirectIfAuthenticated,
  validateSession,
  userController.forgotPasswordPage
);

//  Handle forgot password form (POST)
router.post(
  "/forgot-password",
  redirectIfAuthenticated,
  userController.handleForgotPassword
);

//  Show OTP verification page (GET)
router.get(
  "/forgot-verify-otp",
  preventCache,
  redirectIfAuthenticated,
  validateSession,
  userController.showForgotOtpPage
);

// Handle OTP verification (POST)
router.post(
  "/forgot-verify-otp",
  redirectIfAuthenticated,
  userController.verifyForgotOtp
);

// Resend OTP for forgot password (POST)
router.post(
  "/resend-forgot-verify-otp",
  redirectIfAuthenticated,
  userController.resendForgotOtp
);

//  Render password reset page at /new-password (GET)
router.get(
  "/new-password",
  preventCache,
  redirectIfAuthenticated,
  validateSession,
  userController.renderResetPasswordPage
);

//  Render password reset page at /reset-password (GET) — add this!
router.get(
  "/reset-password",
  preventCache,
  redirectIfAuthenticated,
  validateSession,
  userController.renderResetPasswordPage
);

//Handle new password submission (POST, same endpoint for both URLs)
router.post(
  "/new-password",
  redirectIfAuthenticated,
  userController.handleNewPassword
);
router.post(
  "/reset-password",
  redirectIfAuthenticated,
  userController.handleNewPassword
);



// Authenticated routes
router.get("/home", validateSession, addUserContext, checkUserBlocked, userController.loadHome);


// Logout route
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userController.logout);


module.exports = router;
