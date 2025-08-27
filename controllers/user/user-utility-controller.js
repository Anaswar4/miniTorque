const Wishlist = require('../../models/wishlist-schema');
const Cart = require('../../models/cart-schema');
const User = require('../../models/user-model');

const loadAbout = async (req, res) => {
  try {
    // Get user ID from session (supports both regular and Google OAuth)
    const userId = req.session.userId || req.session.googleUserId;

    // Initialize counts for non-authenticated users
    let wishlistCount = 0;
    let cartCount = 0;
    let user = null;
    let isAuthenticated = false;

    // If user is authenticated, get their data and counts
    if (userId) {
      try {
        // Get user data
        user = await User.findById(userId).select('fullName email profilePhoto').lean();

        if (user) {
          isAuthenticated = true;

          // Get wishlist count
          const wishlist = await Wishlist.findOne({ userId }).lean();
          if (wishlist && wishlist.products) {
            wishlistCount = wishlist.products.length;
          }

          // Get cart count
          const cart = await Cart.findOne({ userId }).lean();
          if (cart && cart.items) {
            cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
          }
        }
      } catch (userError) {
        console.error('Error fetching user data for about page:', userError);
        // Continue with default values if user data fetch fails
      }
    }

    res.render('user/about', {
      user,
      wishlistCount,
      cartCount,
      isAuthenticated,
      currentPage: 'about',
      title: 'About Us - miniTorque'
    });
  } catch (error) {
    console.error('Error loading about page:', error);
    res.status(500).render('error', {
      message: 'Error loading about page',
      user: null,
      wishlistCount: 0,
      cartCount: 0,
      isAuthenticated: false
    });
  }
};

module.exports = {
  loadAbout
};