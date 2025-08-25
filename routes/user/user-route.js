const express = require("express");
const router = express.Router();
const passport = require("passport");
const userController = require("../../controllers/user/user-controller");
const userProductController = require("../../controllers/user/product-controller");
const userProfileController = require("../../controllers/user/user-profile-controller");
const addressController = require("../../controllers/user/address-controller");
const wishlistController = require("../../controllers/user/wishlist-controller");
const cartController = require("../../controllers/user/cart-controller");
 const orderController = require("../../controllers/user/order-controller");
const checkoutController = require("../../controllers/user/checkout-controller");
const { checkProductAvailabilityForPage, checkProductAvailability, checkProductAvailabilityForWishlist } = require("../../middlewares/product-availability-middleware");
const { isUserAuthenticated, preventCache, redirectIfAuthenticated, validateSession, addUserContext, checkUserBlocked } = require("../../middlewares/user-middleware");
const { profileUpload, handleMulterError } = require("../../config/multer-config");


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
    //  First, regenerate the session to prevent fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regen error:", err);
        return res.redirect("/login?error=session");
      }

      //  Now tell Passport to store the logged-in user in the new session
      req.login(req.user, (err) => {
        if (err) {
          console.error("Passport login error:", err);
          return res.redirect("/login?error=login");
        }

        //  Store your custom session values for Google OAuth
        req.session.googleUserId = req.user._id;  // Only set googleUserId for Google OAuth
        req.session.email = req.user.email;
        req.session.loginTime = new Date();
        req.session.user = req.user;  // Store user object for template access

        //  Save the updated session and redirect
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
router.get("/forgot-password", preventCache, redirectIfAuthenticated, validateSession, userController.forgotPasswordPage);
router.post("/forgot-password", redirectIfAuthenticated, userController.handleForgotPassword);
router.get("/forgot-verify-otp", preventCache, redirectIfAuthenticated, validateSession, userController.showForgotOtpPage);
router.post("/forgot-verify-otp", redirectIfAuthenticated, userController.verifyForgotOtp);
router.post("/resend-forgot-verify-otp", redirectIfAuthenticated, userController.resendForgotOtp);
router.get("/new-password", preventCache, redirectIfAuthenticated, validateSession, userController.renderResetPasswordPage);
router.get("/reset-password", preventCache, redirectIfAuthenticated, validateSession, userController.renderResetPasswordPage);
router.post("/new-password", redirectIfAuthenticated, userController.handleNewPassword);
router.post("/reset-password", redirectIfAuthenticated, userController.handleNewPassword);


// Authenticated routes
router.get("/home", validateSession, addUserContext, checkUserBlocked, userController.loadHome);

// Logout route
router.get("/logout", isUserAuthenticated, preventCache, checkUserBlocked, userController.logout);

// API routes for products with offers
router.get("/api/products", validateSession, addUserContext, checkUserBlocked, userProductController.getProducts);
router.get("/api/products/featured", validateSession, addUserContext, checkUserBlocked, userProductController.getFeaturedProducts);
router.get("/api/products/search", validateSession, addUserContext, checkUserBlocked, userProductController.searchProducts);
router.get("/api/products/:id", validateSession, addUserContext, checkUserBlocked, userProductController.getProductById);
router.get("/api/category/:categoryId/products", validateSession, addUserContext, checkUserBlocked, userProductController.getProductsByCategory);

// Shop Page
router.get("/shopPage", validateSession, addUserContext, checkUserBlocked, userProductController.getShopPage);
router.get("/product/:id", validateSession, addUserContext, checkUserBlocked, userProductController.getProductDetails);

// Profile
router.get("/profile", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadProfile);
router.get("/profile/edit", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadEditProfile);
router.post("/profile/edit", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.updateProfileData);
router.post("/profile/verify-current-email", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.verifyCurrentEmail);
router.get("/profile/email-change-otp", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadEmailChangeOtp);
router.post("/profile/email-change-otp", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.verifyEmailChangeOtp);
router.post("/profile/change-email", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.changeEmail);
router.post("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, profileUpload.single('profilePhoto'), handleMulterError, userProfileController.uploadProfilePhoto);
router.delete("/profile/photo", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.deleteProfilePhoto);
// Address-related routes
router.get("/address", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressList);
router.get("/address/add", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.get("/address/edit/:id", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, addressController.loadAddressForm);
router.post("/address", isUserAuthenticated, preventCache, checkUserBlocked, addressController.saveAddress);
router.put("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.updateAddress);
router.put("/address/set-default/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.setAsDefault);
router.delete("/address/:id", isUserAuthenticated, preventCache, checkUserBlocked, addressController.deleteAddress);
// Change password route
router.get("/change-password", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadChangePassword);
router.post("/change-password", isUserAuthenticated, preventCache, checkUserBlocked, userProfileController.updatePassword);
// Wishlist-related routes
router.get("/wishlist", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, wishlistController.loadWishlist);
router.post("/wishlist/add", isUserAuthenticated, preventCache, checkUserBlocked, checkProductAvailabilityForWishlist, wishlistController.addToWishlist);
router.post("/wishlist/remove", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.removeFromWishlist);
router.get("/wishlist/count", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.getWishlistCount);
router.get("/wishlist/ids", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.getWishlistIds);
router.post("/wishlist/bulk-transfer-to-cart", isUserAuthenticated, preventCache, checkUserBlocked, wishlistController.bulkTransferToCart);

// Cart-related routes
router.get("/cart", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, cartController.loadCart);
router.post("/add-to-cart", isUserAuthenticated, preventCache, checkUserBlocked, cartController.addToCart);
router.post("/cart/update", isUserAuthenticated, preventCache, checkUserBlocked, cartController.updateCartQuantity);
router.post("/cart/remove", isUserAuthenticated, preventCache, checkUserBlocked, cartController.removeFromCart);
router.post("/cart/clear", isUserAuthenticated, preventCache, checkUserBlocked, cartController.clearCart);
router.post("/cart/remove-out-of-stock", isUserAuthenticated, preventCache, checkUserBlocked, cartController.removeOutOfStockItems);
router.get("/cart/validate", isUserAuthenticated, preventCache, checkUserBlocked, cartController.validateCartItems);
router.get("/cart/count", isUserAuthenticated, preventCache, checkUserBlocked, cartController.getCartCount);

// Checkout-related routes
router.get("/checkout", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadCheckout);
router.post("/checkout/place-order", isUserAuthenticated, preventCache, checkUserBlocked, checkoutController.placeOrder);
router.get("/order-success/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, checkoutController.loadOrderSuccess);

router.get("/orders", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, orderController.loadOrderList);
router.get("/order-details/:orderId", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, orderController.loadOrderDetails);
router.post("/orders/:orderId/items/:itemId/cancel", isUserAuthenticated, preventCache, checkUserBlocked, orderController.cancelOrderItem);
router.post("/orders/:orderId/cancel-entire", isUserAuthenticated, preventCache, checkUserBlocked, orderController.cancelEntireOrder);
router.post("/orders/:orderId/request-return", isUserAuthenticated, preventCache, checkUserBlocked, orderController.requestReturn);
router.post("/orders/:orderId/items/:itemId/request-return", isUserAuthenticated, preventCache, checkUserBlocked, orderController.requestIndividualItemReturn);
router.get("/orders/:orderId/download-invoice", isUserAuthenticated, preventCache, checkUserBlocked, orderController.downloadInvoice);

// Wallet route
router.get("/wallet", isUserAuthenticated, preventCache, addUserContext, checkUserBlocked, userProfileController.loadWallet);


module.exports = router;
