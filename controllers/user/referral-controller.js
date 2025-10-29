const User = require("../../models/user-model");          
const Referral = require("../../models/referral-schema");
const Cart = require("../../models/cart-schema");
const Wishlist = require("../../models/wishlist-schema");
const { generateUniqueReferralCode } = require('../../utils/generateReferralCode');


const getReferrals = async (req, res) => {
  try {
    // Handle BOTH regular and Google OAuth users
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.redirect('/login');
    }

    // Get user data with all possible name fields (like your order controller)
    let user = await User.findById(userId).select('fullName email name displayName googleName profilePhoto referralCode referralCount referredBy');

    if (!user) {
      return res.redirect('/login');
    }


// Auto-generate referral code if user doesn't have one
if (!user.referralCode || user.referralCode === null) {
  console.log(` BEFORE: User ${user.email} referralCode = ${user.referralCode}`);
  
  const newCode = await generateUniqueReferralCode(8);
  console.log(` Generated new code: ${newCode}`);
  
  // Use updateOne for atomic operation
  const result = await User.updateOne(
    { _id: user._id },
    { $set: { referralCode: newCode, referralCount: 0 } }
  );
  
  console.log(` Update result:`, result);
  
  // Reload user from database to verify
  const verifyUser = await User.findById(user._id);
  console.log(` AFTER: Code in DB = ${verifyUser.referralCode}`);
  
  user.referralCode = newCode;
} else {
  console.log(` User ${user.email} ALREADY HAS code: ${user.referralCode}`);
}




    // Get referral statistics
    const referralStats = await Referral.find({ referrer: userId })
      .populate('referred', 'fullName email createdAt')
      .sort({ createdAt: -1 });

    // Get wishlist count for navbar (exactly like your order controller)
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar (exactly like your order controller)
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render("user/referrals", {
      user,
      referralCode: user.referralCode,
      referralCount: user.referralCount || 0,
      referrals: referralStats || [],
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'referrals',
      title: 'My Referrals'
    });
  } catch (error) {
    console.log("Error in rendering referrals page:", error);
    res.status(500).render("error", {
      message: "Internal server error",
      user: res.locals.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};


// Validate referral code 
const validateReferral = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code || code.trim() === '') {
      return res.json({
        valid: false
      });
    }

    // Find user with this referral code
    const referrer = await User.findOne({ 
      referralCode: code.toUpperCase().trim() 
    }).select('fullName referralCode');

    if (!referrer) {
      return res.json({
        valid: false
      });
    }

    return res.json({
      valid: true,
      referrerName: referrer.fullName
    });

  } catch (error) {
    console.error("Error validating referral code:", error);
    return res.json({
      valid: false
    });
  }
};


module.exports = {
  getReferrals,
  validateReferral,
};
