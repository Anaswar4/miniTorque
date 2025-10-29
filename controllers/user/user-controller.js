const { sendOTP } = require('../../utils/mailer');
const generateOTP = require('../../utils/generate-otp');
const { validateEmail, validatePassword } = require('../../utils/validator');
const userModel = require('../../models/user-model');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const Wishlist = require('../../models/wishlist-schema');
const Cart = require('../../models/cart-schema');
const Referral = require('../../models/referral-schema');
const { generateUniqueReferralCode } = require('../../utils/generateReferralCode');

// Rate-limiting middleware for resend-otp
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

// Show signup page
const showSignup = (req, res) => {
  return res.render('user/signup', {
    error: null,
    formData: {},
  });
};

// Load home page with proper product filtering and wishlist count
const loadHome = async (req, res) => {
  try {
    const navLinks = [
      { href: '#home', text: 'Home', active: true },
      { href: '#collection', text: 'Collection', active: false },
      { href: '#about', text: 'About', active: false },
      { href: '#contact', text: 'Contact', active: false }
    ];

    // Get featured products with proper filtering
    const featuredProducts = await Product.aggregate([
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryData"
        }
      },
      {
        $match: {
          isListed: true,
          isDeleted: false,        
          isBlocked: false,
          status: "Available",
          "categoryData.isListed": true,
          "categoryData.isDeleted": false
        }
      },
      { $sort: { createdAt: -1 } },
      { $limit: 8 }  // Show 8 featured products on home
    ]);

    // Add price calculations for home page products
    featuredProducts.forEach(product => {
      if (product.categoryData && product.categoryData.length > 0) {
        product.category = product.categoryData[0];
      }
      delete product.categoryData;
      
      if (product.productOffer && product.productOffer > 0) {
        product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
        product.hasOffer = true;
        product.discountAmount = product.salePrice - product.finalPrice;
      } else {
        product.finalPrice = product.salePrice;
        product.hasOffer = false;
        product.discountAmount = 0;
      }

      const now = new Date();
      const createdAt = new Date(product.createdAt);
      const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
      product.isNew = diffDays <= 30;
    });

    // Get only active categories for any home page category sections
    const activeCategories = await Category.find({
      isListed: true,
      isDeleted: false
    }).sort({ name: 1 }).limit(6);

    //  Get user cart and wishlist data for both regular and Google OAuth users
    let userWishlistIds = [];
    let wishlistCount = 0;
    let cartCount = 0;

    const userId = req.session.userId || req.session.googleUserId; 

    if (userId) {
      // Get cart count
      const cart = await Cart.findOne({ userId: userId }).lean();
      if (cart && cart.items) {
        cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
      }

      // Get wishlist count
      const wishlist = await Wishlist.findOne({ userId: userId }).lean();
      if (wishlist && wishlist.products) {
        userWishlistIds = wishlist.products.map(item => item.productId.toString());
        wishlistCount = wishlist.products.length;
      }
    }

    res.render('user/home', {
      user: res.locals.user || null,  
      navLinks,
      featuredProducts,
      activeCategories,
      userWishlistIds,
      wishlistCount,
      cartCount,
      isAuthenticated: !!(req.session.userId || req.session.googleUserId), 
      currentPage: 'home'
    });

  } catch (error) {
    console.error('Error in loadHome:', error.message);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Error loading home page: ' + error.message
      },
      message: error.message,
      user: res.locals.user || null,  
      cartCount: 0,
      wishlistCount: 0,
      isAuthenticated: !!(req.session.userId || req.session.googleUserId) 
    });
  }
};


// Handle signup
const signup = async (req, res) => {
  const { fullName, email, password, confirmPassword, referralCode} = req.body;

  if (!fullName || !email || !password || !confirmPassword) {
    return res.render('user/signup', {
      error: 'All fields are required',
      formData: { fullName, email },
    });
  }

  const exists = await userModel.findOne({ email });
  if (exists) {
    return res.render('user/signup', {
      error: 'Email already exists',
      formData: { fullName, email },
    });
  }

  if (!validateEmail(email) || !validatePassword(password)) {
    return res.render('user/signup', {
      error: 'Invalid email or weak password',
      formData: { fullName, email },
    });
  }

  if (password !== confirmPassword) {
    return res.render('user/signup', {
      error: 'Passwords do not match',
      formData: { fullName, email },
    });
  }
   //  REFERRAL CODE (OPTIONAL)
  if (referralCode && referralCode.trim() !== '') {
    const referrerExists = await userModel.findOne({ 
      referralCode: referralCode.toUpperCase().trim() 
    });
    
    if (!referrerExists) {
      return res.render('user/signup', {
        error: 'Invalid referral code',
        formData: { fullName, email, referralCode },
      });
    }
  } 

  try {
    const otp = generateOTP();
    console.log('Otp is:', otp);

    await sendOTP(email, otp);
    const hashedPassword = await bcrypt.hash(password, 10);

    req.session.tempUser = {
      fullName: fullName.trim(),
      email,
      password: hashedPassword,
      otp,
      isVerified: false,
      referralCode: referralCode ? referralCode.toUpperCase().trim() : null
    };
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    req.session.save((err) => {
      if (err) {
        console.error('Session Save Error:', err);
        return res.status(500).render('user/signup', {
          error: 'Something went wrong. Please try again.',
          formData: { fullName, email },
        });
      }

      return res.render('otp', { email, success: null, error: null });
    });
  } catch (error) {
    console.error('Signup Error:', error.message);
    res.status(400).render('user/signup', {
      error: 'Failed to send OTP. Try again',
      formData: { fullName, email },
    });
  }
};

// Load OTP page
const loadOtpPage = (req, res) => {
  const { tempUser } = req.session;
  if (!tempUser || !tempUser.email) {
    return res.redirect('/signup');
  }
  return res.render('otp', { email: tempUser.email, success: null, error: null });
};

// Handle OTP verification
const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  const { tempUser, otpExpires } = req.session;

  try {
    if (!tempUser || !otpExpires || tempUser.email !== email) {
      req.session.tempUser = null;
      req.session.otpExpires = null;
      throw new Error('Session expired or invalid email. Try signing up again.');
    }

    if (Date.now() > otpExpires) {
      req.session.tempUser = null;
      req.session.otpExpires = null;
      throw new Error('OTP expired. Please sign up again.');
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      throw new Error('Invalid OTP format');
    }

    if (otp !== tempUser.otp) {
      throw new Error('Invalid OTP');
    }

     // CREATE USER WITH REFERRAL CODE 
    const newUser = await userModel.create({
      fullName: tempUser.fullName,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
    });

    // Generate unique referral code for new user
    const userReferralCode = await generateUniqueReferralCode(8);
    newUser.referralCode = userReferralCode;
    await newUser.save();

    // Process referral code if provided
    if (tempUser.referralCode) {
      const referrer = await userModel.findOne({ 
        referralCode: tempUser.referralCode 
      });

      if (referrer && referrer._id.toString() !== newUser._id.toString()) {
        // Link new user to referrer
        newUser.referredBy = referrer._id;
        await newUser.save();

        // Increment referrer's count
        await userModel.findByIdAndUpdate(referrer._id, {
          $inc: { referralCount: 1 }
        });

        // Create referral record
        await Referral.create({
          referrer: referrer._id,
          referred: newUser._id,
          status: 'completed',
          rewardGiven: false,
          rewardAmount: 50
        });

        console.log(`User ${newUser.email} referred by ${referrer.email}`);
      }
    }

    req.session.tempUser = null;
    req.session.otpExpires = null;

    res.json({ success: true, redirectUrl: '/login' });
  } catch (error) {
    console.error('Verify OTP Error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    await resendLimiter(req, res, async () => {
      const { email } = req.body;
      const { tempUser } = req.session;

      if (!tempUser || tempUser.email !== email) {
        req.session.tempUser = null;
        req.session.otpExpires = null;
        throw new Error('Session expired. Please sign up again.');
      }

      const newOTP = generateOTP();
      console.log('newOtp is:', newOTP);

      req.session.tempUser.otp = newOTP;
      req.session.otpExpires = Date.now() + 5 * 60 * 1000;
      await sendOTP(tempUser.email, newOTP);

      res.json({ success: true, message: 'OTP resent successfully' });
    });
  } catch (error) {
    console.error('Resend OTP Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to resend OTP. Try again later.' });
  }
};

// Show login page
const showLogin = async (req, res) => {
  //  Check both regular and Google OAuth authentication
  if (req.session.userId || req.session.googleUserId) return res.redirect('/home');
  const blocked = req.query.blocked === 'true';
  return res.render('user/login', { error: null, blocked });
};

// Handle login with blocked check
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!validateEmail(email) || typeof password !== "string" || password.trim() === "") {
    return res.render('user/login', { error: 'Invalid email or password', blocked: false });
  }

  try {
    const user = await userModel.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('user/login', { error: 'Invalid credentials', blocked: false });
    }

    // Blocked user check → redirect with flag for popup
    if (user.isBlocked) {
      return res.redirect('/login?blocked=true');
    }

    if (!user.isVerified) {
      return res.render('user/login', { error: 'Please verify your email before logging in', blocked: false });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regen error:', err);
        return res.status(500).render('user/login', { error: 'Session error. Please try again.', blocked: false });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Passport login error:', err);
          return res.status(500).render('user/login', { error: 'Login failed. Please try again.', blocked: false });
        }

        req.session.userId = user._id;
        req.session.email = user.email;
        req.session.user = user;
        req.session.loginTime = new Date();

        req.session.save((err) => {
          if (err) {
            console.error('Login session save error:', err);
            return res.status(500).render('user/login', { error: 'Login failed. Please try again.', blocked: false });
          }
          console.log('Normal login successful, redirecting to /home');
          return res.redirect('/home');
        });
      });
    });
  } catch (err) {
    console.error('Error in login:', err);
    res.status(500).render('user/login', { error: 'Something went wrong. Please try again.', blocked: false });
  }
};

// Handle logout
const logout = async (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
};

// Forgot password
const forgotPasswordPage = (req, res) => res.render('user/forgot-password', { error: null });

const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    const user = await userModel.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Email not found' });
    if (!user.isVerified) return res.status(403).json({ success: false, message: 'Account not verified' });

    const otp = generateOTP();
    await sendOTP(email, otp);

    req.session.forgotOtp = otp;
    req.session.forgotEmail = email;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    console.log('Forgot password OTP:', otp);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Forgot Password Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const showForgotOtpPage = (req, res) => {
  if (!req.session.forgotEmail) return res.redirect('/forgot-password');
  res.render('user/forgot-verify-otp', { email: req.session.forgotEmail });
};

const verifyForgotOtp = (req, res) => {
  const { otp } = req.body;
  const sessionOtp = req.session.forgotOtp;
  const otpExpires = req.session.otpExpires;

  if (!sessionOtp || Date.now() > otpExpires) {
    return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
  }
  if (otp !== sessionOtp) {
    return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
  }

  req.session.otpVerified = true;
  return res.json({ success: true, redirectUrl: '/reset-password' });
};

const resendForgotOtp = async (req, res) => {
  try {
    const email = req.session.forgotEmail;
    if (!email) return res.status(400).json({ success: false, message: 'Session expired. Try again.' });

    const otp = generateOTP();
    await sendOTP(email, otp);

    req.session.forgotOtp = otp;
    req.session.otpExpires = Date.now() + 5 * 60 * 1000;

    console.log('Resent forgot-password OTP:', otp);
    return res.json({ success: true });
  } catch (error) {
    console.error('Resend Forgot OTP Error:', error.message);
    return res.status(500).json({ success: false, message: 'Server error. Try again later.' });
  }
};

const renderResetPasswordPage = (req, res) => {
  if (!req.session.otpVerified || !req.session.forgotEmail) {
    return res.redirect('/forgot-password');
  }
  res.render('user/new-password');
};

const handleNewPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    if (!req.session.otpVerified || !req.session.forgotEmail) {
      return res.status(400).json({ success: false, message: 'Session expired or unauthorized access.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }
    if (!validatePassword(newPassword)) {
      return res.status(400).json({ success: false, message: 'Password is not strong enough.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedUser = await userModel.findOneAndUpdate(
      { email: req.session.forgotEmail },
      { password: hashedPassword }
    );
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    req.session.forgotEmail = null;
    req.session.forgotOtp = null;
    req.session.otpVerified = null;
    req.session.otpExpires = null;

    return res.status(200).json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('handleNewPassword Error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

module.exports = {
  loadHome,
  showLogin,
  login,
  showSignup,
  signup,
  loadOtpPage,
  verifyOTP,
  resendOTP,
  logout,
  forgotPasswordPage,
  handleForgotPassword,
  showForgotOtpPage,
  verifyForgotOtp,
  resendForgotOtp,
  renderResetPasswordPage,
  handleNewPassword,
};
