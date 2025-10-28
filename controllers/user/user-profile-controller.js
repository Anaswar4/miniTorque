// User profile controller – handles profile management, email changes, password updates, and photo uploads
const User = require("../../models/user-model");
const generateOtp = require("../../utils/generate-otp");
const { sendOTP } = require("../../utils/mailer");
const bcrypt = require("bcrypt");
const Order = require("../../models/order-schema");
const Wishlist = require("../../models/wishlist-schema");
const Wallet = require("../../models/wallet-schema");
const Cart = require("../../models/cart-schema");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { validateEmailFormat } = require("../../validator/addressValidator");

/* ------------------------------------------------------------------
   1. PROFILE PAGES
-------------------------------------------------------------------*/
const loadProfile = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId).select("-password").lean();
    if (!user) return res.redirect("/login");

    const totalOrders = await Order.countDocuments({ userId });
    const wishlistCount = await Wishlist.countDocuments({ userId });
    const wallet = await Wallet.getOrCreateWallet(userId);

    // Get cart count
    const cart = await Cart.findOne({ userId: userId }).lean();
    let cartCount = 0;
    if (cart && cart.items) {
      cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    }

    res.render("user/profile", {
      title: "My Profile",
      user,
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'profile',
      stats: {
        totalOrders,
        wishlistCount,
        walletBalance: wallet.balance || 0,
        availableCoupons: 0
      }
    });
  } catch (err) {
    console.error("Error loading profile:", err);
    res.status(500).render("error", {
      error: {
        status: 500,
        message: "Error loading profile: " + err.message
      },
      message: err.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};

const loadEditProfile = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId).select("-password").lean();
    if (!user) return res.redirect("/login");

    //  Add wishlist count for consistency
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    //  Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render("user/edit-profile", {
      title: "Edit Profile",
      user,
      wishlistCount,          
      cartCount,              
      isAuthenticated: true,  
      currentPage: 'edit-profile'
    });
  } catch (err) {
    console.error("Error loading edit profile:", err);
    res.status(500).render("error", {
      error: {
        status: 500,
        message: "Error loading edit profile: " + err.message
      },
      message: err.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0  
    });
  }
};

const loadChangePassword = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId).select("fullName email profilePhoto");
    if (!user) return res.redirect("/login");

    //  Add wishlist count
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    //  Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render("user/change-password", {
      user,
      title: "Change Password",
      wishlistCount,          
      cartCount,              
      isAuthenticated: true,  
      currentPage: 'change-password'
    });
  } catch (err) {
    console.error("Error loading change password page:", err);
    res.status(500).render("error", {
      error: {
        status: 500,
        message: "Error loading change password page: " + err.message
      },
      message: err.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0  
    });
  }
};

const loadWallet = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId).select("fullName email profilePhoto");
    if (!user) return res.redirect("/login");

    const wallet = await Wallet.getOrCreateWallet(userId);
    const totalAdded = wallet.transactions
      .filter(t => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalSpent = wallet.transactions
      .filter(t => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    //  Add wishlist count
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    //  Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render("user/wallet", {
      user,
      title: "My Wallet",
      wishlistCount,          
      cartCount,              
      isAuthenticated: true,  
      currentPage: 'wallet',
      wallet: {
        balance: wallet.balance,
        totalAdded,
        totalSpent,
        transactions: wallet.transactions
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 10)
      }
    });
  } catch (err) {
    console.error("Error loading wallet page:", err);
    res.status(500).render("error", {
      error: {
        status: 500,
        message: "Error loading wallet page: " + err.message
      },
      message: err.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0  
    });
  }
};

/* ------------------------------------------------------------------
   2. UPDATE PROFILE  
-------------------------------------------------------------------*/
const updateProfileData = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please login to update profile" });
    }

    const { fullname } = req.body;
    const errors = {};

    // Validate fullname
    if (!fullname || fullname.trim().length < 4) {
      errors.fullname = "Full name must be at least 4 characters long";
    } else if (/\d/.test(fullname.trim())) {
      errors.fullname = "Full name should not contain numbers";
    }

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { fullName: fullname.trim() },
      { new: true, runValidators: true }
    ).select("-password");

    res.json({ success: true, message: "Profile updated successfully", user: updatedUser });
  } catch (err) {
    console.error("Error updating profile:", err);
    if (err.name === "ValidationError") {
      const errors = {};
      Object.keys(err.errors).forEach(k => (errors[k] = err.errors[k].message));
      return res.status(400).json({ success: false, message: "Validation failed", errors });
    }
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

/* ------------------------------------------------------------------
   3. EMAIL CHANGE  
-------------------------------------------------------------------*/
const verifyCurrentEmail = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { currentEmail, newEmail } = req.body;  
    if (!userId) return res.status(401).json({ success: false, message: "Please login" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    // Verify current email is correct
    if (user.email !== currentEmail.toLowerCase().trim()) {
      return res.status(400).json({ success: false, message: "Current email is incorrect" });
    }

    // Validate new email format
    const emailValidation = validateEmailFormat(newEmail);
    if (!emailValidation.isValid) {
      return res.status(400).json({ success: false, message: emailValidation.error });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({
      email: emailValidation.trimmedValue,
      _id: { $ne: userId }
    });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    // Generate OTP
    const otp = generateOtp();
    console.log(otp);
    
    // Store new email in session
    req.session.emailChangeOtp = {
      otp,
      email: emailValidation.trimmedValue,  
      userId,
      expiresAt: Date.now() + 5 * 60 * 1000  
    };

    try {
      // Send OTP to NEW email
      await sendOTP(emailValidation.trimmedValue, otp);
    } catch (error) {
      console.error('Error sending OTP:', error);
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP sent to your new email address" });
  } catch (err) {
    console.error("Error verifying current email:", err);
    res.status(500).json({ success: false, message: "Failed to verify email" });
  }
};


const loadEmailChangeOtp = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");
    if (!req.session.emailChangeOtp) return res.redirect("/profile/edit");

    const user = await User.findById(userId).select("-password").lean();
    if (!user) return res.redirect("/login");

    // Add wishlist count
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    //  Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render("user/email-change-otp", {
      title: "Verify Email Change",
      user,
      email: req.session.emailChangeOtp.email,
      wishlistCount,          
      cartCount,              
      isAuthenticated: true,  
      currentPage: 'email-change-otp'
    });
  } catch (err) {
    console.error("Error loading email change OTP page:", err);
    res.status(500).render("error", {
      error: {
        status: 500,
        message: "Error loading email change OTP page: " + err.message
      },
      message: err.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0  
    });
  }
};

const verifyEmailChangeOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const sessionOtp = req.session.emailChangeOtp;
    if (!sessionOtp) {
      return res.status(400).json({ success: false, message: "No OTP session found" });
    }
    if (Date.now() > sessionOtp.expiresAt) {
      req.session.emailChangeOtp = null;
      return res.status(400).json({ success: false, message: "OTP expired" });
    }
    if (String(otp) !== String(sessionOtp.otp)) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    req.session.emailChangeOtp.verified = true;
    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    console.error("Error verifying OTP:", err);
    res.status(500).json({ success: false, message: "Failed to verify OTP" });
  }
};

const changeEmail = async (req, res) => {
  try {
    const sessionOtp = req.session.emailChangeOtp;
    if (!sessionOtp || !sessionOtp.verified) {
      return res.status(400).json({ success: false, message: "OTP not verified" });
    }

    // Update to the new email stored in session
    const updatedUser = await User.findByIdAndUpdate(
      sessionOtp.userId,
      { email: sessionOtp.email },  
      { new: true, runValidators: true }
    ).select("-password");

    req.session.email = sessionOtp.email;
    req.session.emailChangeOtp = null;

    res.json({ success: true, message: "Email updated successfully", user: updatedUser });
  } catch (err) {
    console.error("Error changing email:", err);
    res.status(500).json({ success: false, message: "Failed to update email address" });
  }
};


/* ------------------------------------------------------------------
   4. PASSWORD UPDATE
-------------------------------------------------------------------*/
const updatePassword = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!userId) return res.status(401).json({ success: false, message: "Please login" });

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    }

    const pwRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!pwRegex.test(newPassword) || newPassword.includes(" ")) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 chars, include upper, lower, number, special char, and no spaces"
      });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const isCurrentOk = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentOk) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await User.findByIdAndUpdate(userId, { password: hashed });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Error updating password:", err);
    res.status(500).json({ success: false, message: "Failed to update password" });
  }
};

/* ------------------------------------------------------------------
   5. PROFILE PHOTO  (upload & delete)
-------------------------------------------------------------------*/
const uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.status(401).json({ success: false, message: "Please login" });
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const filename = `profile_${userId}_${Date.now()}.jpg`;
    const filepath = path.join(__dirname, "../../public/uploads/profiles", filename);

    await sharp(req.file.buffer)
      .resize(200, 200, { fit: "cover", position: "center" })
      .jpeg({ quality: 90 })
      .toFile(filepath);

    const currentUser = await User.findById(userId);
    if (currentUser.profilePhoto) {
      const oldPath = path.join(
        __dirname,
        "../../public/uploads/profiles",
        currentUser.profilePhoto
      );
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await User.findByIdAndUpdate(userId, { profilePhoto: filename });

   res.json({ success: true, message: "Profile photo updated", filename: filename });
  } catch (err) {
    console.error("Error uploading photo:", err);
    res.status(500).json({ success: false, message: "Failed to upload profile photo" });
  }
};

const deleteProfilePhoto = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.status(401).json({ success: false, message: "Please login" });

    const currentUser = await User.findById(userId);
    if (!currentUser || !currentUser.profilePhoto) {
      return res.status(400).json({ success: false, message: "No profile photo to delete" });
    }

    const photoPath = path.join(
      __dirname,
      "../../public/uploads/profiles",
      currentUser.profilePhoto
    );
    if (fs.existsSync(photoPath)) fs.unlinkSync(photoPath);

    await User.findByIdAndUpdate(userId, { $unset: { profilePhoto: 1 } });

    res.json({ success: true, message: "Profile photo deleted" });
  } catch (err) {
    console.error("Error deleting photo:", err);
    res.status(500).json({ success: false, message: "Failed to delete profile photo" });
  }
};

/* ------------------------------------------------------------------
   6. LOGOUT
-------------------------------------------------------------------*/
const logout = (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) return res.redirect("/login");

    req.session.destroy(err => {
      if (err) {
        console.error("Session destruction error", err);
        return res.status(500).json({ success: false, message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      if (req.cookies) {
        Object.keys(req.cookies).forEach(cn => res.clearCookie(cn));
      }
      res.redirect("/login");
    });
  } catch (err) {
    console.error("Logout error", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  loadProfile,
  loadEditProfile,
  loadChangePassword,
  loadWallet,
  updateProfileData,
  verifyCurrentEmail,
  loadEmailChangeOtp,
  verifyEmailChangeOtp,
  changeEmail,
  updatePassword,
  uploadProfilePhoto,
  deleteProfilePhoto,
  logout
};
