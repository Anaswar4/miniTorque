const Coupon = require("../../models/coupon-schema");
const User = require("../../models/user-model");

const getUserCoupons = async (req, res) => {
  try {
    //  Match session variables with checkout controller
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Please log in to view coupons" 
      });
    }

    // Rest of your getUserCoupons code...
  } catch (error) {
    console.error("Error fetching user coupons:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
};

const applyCoupon = async (req, res) => {
  try {
    //  Match session variables with checkout controller
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Please log in to apply coupon" 
      });
    }

    const { couponCode, cartTotal, cartItems } = req.body;
    
    if (!couponCode) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon code is required" 
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      startDate: { $lte: new Date() },
      expiry: { $gte: new Date() },
    }).populate('applicableCategories applicableProducts');

    if (!coupon) {
      return res.status(404).json({ 
        success: false, 
        message: "Invalid or expired coupon code" 
      });
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({ 
        success: false, 
        message: "Coupon usage limit exceeded" 
      });
    }

    // Check minimum purchase
    if (coupon.minPurchase && cartTotal < coupon.minPurchase) {
      return res.status(400).json({ 
        success: false, 
        message: `Minimum order amount ₹${coupon.minPurchase} required` 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (cartTotal * coupon.discount) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discount;
    }

    // Ensure discount doesn't exceed cart total
    discountAmount = Math.min(discountAmount, cartTotal);

    const finalAmount = cartTotal - discountAmount;

    res.json({
      success: true,
      message: "Coupon applied successfully",
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discount,
        maxDiscount: coupon.maxDiscount
      },
      discountAmount: Math.round(discountAmount),
      originalAmount: cartTotal,
      finalAmount: Math.round(finalAmount),
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to apply coupon" 
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    
    if (!userId) {
      return res.status(401).json({ 
        success: false, 
        message: "Please log in to remove coupon" 
      });
    }

    const { cartTotal } = req.body;

    res.json({
      success: true,
      message: "Coupon removed successfully",
      originalAmount: cartTotal,
      finalAmount: cartTotal,
      discountAmount: 0,
    });
  } catch (error) {
    console.error("Error removing coupon:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to remove coupon" 
    });
  }
};

module.exports = { 
  getUserCoupons, 
  applyCoupon, 
  removeCoupon 
};