const Coupon = require('../../models/coupon-schema');
const Cart = require('../../models/cart-schema');
const Address = require('../../models/address-schema');
const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-model');
const Wallet = require('../../models/wallet-schema');
const Wishlist = require('../../models/wishlist-schema');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { calculateFinalPrice, calculateItemTotal, calculateItemDiscount, syncAllCartPrices, calculateCartSummary } = require('../../utils/price-calculator');
const { applyBestOffersToProducts } = require('../../utils/offer-utils');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Load checkout page
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;  

    // Get user data 
    const user = await User.findById(userId).select('fullName email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get wallet balance
    const wallet = await Wallet.getOrCreateWallet(userId);
    user.walletBalance = wallet.balance;

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Filter out items with unavailable products
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    if (cartItems.length === 0) {
      return res.redirect('/cart');
    }

    // Check for out-of-stock items
    const outOfStockItems = cartItems.filter(item => item.productId.quantity === 0);
    if (outOfStockItems.length > 0) {
      req.session.checkoutError = 'Some items in your cart are out of stock. Please remove them to proceed.';
      return res.redirect('/cart');
    }

    // Get user's addresses
    const addressDoc = await Address.findOne({ userId });
    const addresses = addressDoc ? addressDoc.address : [];

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Calculate cart count for navbar
    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate order summary with simple pricing
    let subtotal = 0;
    let totalDiscount = 0;
    let amountAfterDiscount = 0;

    cartItems.forEach(item => {
      const regularPrice = item.productId.regularPrice || item.productId.salePrice;
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      // Use cart stored price or product sale price
      const finalPrice = item.price || salePrice;
      
      // Calculate totals
      subtotal += regularPrice * quantity; 
      const itemDiscount = (regularPrice - finalPrice) * quantity; 
      totalDiscount += itemDiscount;
      amountAfterDiscount += finalPrice * quantity; 
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    const finalAmount = amountAfterDiscount + shippingCharges;

    // COD available for orders <= ₹2000
    const isCODAvailable = finalAmount <= 2000;

    // Check for address success message from session
    const addressSuccess = req.session.addressSuccess;
    if (addressSuccess) {
      delete req.session.addressSuccess;
    }

    //  Fetch available coupons for user
    let availableCoupons = [];
    try {
      const currentDate = new Date();
      
      // Fetch active coupons that user can use
      const coupons = await Coupon.find({
        isActive: true,
        startDate: { $lte: currentDate },
        expiry: { $gte: currentDate }
      })
      .populate("applicableCategories", "name")
      .populate("applicableProducts", "productName")
      .lean();

      // Filter coupons based on minimum purchase and usage limits
      availableCoupons = coupons.filter(coupon => {
        // Check minimum purchase requirement
        if (coupon.minPurchase && finalAmount < coupon.minPurchase) {
          return false;
        }
        
        // Check usage limits
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          return false;
        }
        
        return true;
      });

      // Format coupons for display
      availableCoupons = availableCoupons.map(coupon => ({
        ...coupon,
        discountDisplay: coupon.discountType === 'percentage' 
          ? `${coupon.discount}% OFF${coupon.maxDiscount ? ` (up to ₹${coupon.maxDiscount})` : ''}`
          : `₹${coupon.discount} OFF`,
        validityText: `Valid till: ${coupon.expiry.toLocaleDateString('en-IN', { 
          day: '2-digit', month: 'short', year: 'numeric' 
        })}`,
        minOrderText: coupon.minPurchase > 0 ? `Min. order: ₹${coupon.minPurchase}` : ''
      }));
    } catch (error) {
      console.error('Error fetching available coupons:', error);
    }  

    res.render('user/checkout', {
      user,
      cartItems,
      addresses,
      orderSummary: {
        subtotal,
        totalDiscount,
        shippingCharges,
        finalAmount
      },
      addressSuccess,
      isCODAvailable,
      availableCoupons,
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'checkout',
      title: 'Checkout'
    });

  } catch (error) {
    console.error('Error loading checkout:', error);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Error loading checkout page: ' + error.message
      },
      message: error.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};

// Process order placement (for COD and Wallet)
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;  
    const { selectedAddressId, paymentMethod = 'Cash on Delivery', appliedCoupon } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Filter available items and validate stock
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Final stock validation
    for (const item of cartItems) {
      if (item.productId.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productId.productName}`
        });
      }
    }

    // Get selected address
    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(selectedAddressId);
    
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Selected address not found'
      });
    }

    // Apply offer calculations to cart items
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Calculate order totals
    let subtotal = 0;
    let totalDiscount = 0;
    let amountAfterDiscount = 0;
    const orderedItems = [];

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      subtotal += salePrice * quantity;
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: finalPrice,
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    let finalAmount = amountAfterDiscount + shippingCharges;

    //  Apply coupon discount if exists
    if (appliedCoupon && appliedCoupon.discountAmount) {
      finalAmount = finalAmount - appliedCoupon.discountAmount;
    }

    // Validate COD limit
    if (paymentMethod === 'Cash on Delivery' && finalAmount > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Cash on Delivery is not available for orders above ₹2000. Please select Online Payment or Wallet.'
      });
    }

    // If wallet payment, check balance
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      if (wallet.balance < finalAmount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}`
        });
      }
    }

    // Create order
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      shippingCharges,
      finalAmount,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        city: selectedAddress.city,
        landMark: selectedAddress.landMark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone
      },
      paymentMethod,
      paymentStatus: paymentMethod === 'Wallet' ? 'Completed' : 'Pending',
      orderTimeline: [{
        status: 'Pending',
        description: 'Order placed successfully'
      }]
    });

    await order.save();

    // Process wallet payment
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      await wallet.deductMoney(
        finalAmount,
        `Order payment for ${order.orderId}`,
        order.orderId
      );
      await wallet.save();
    }

    // Update product quantities
    for (const item of cartItems) {
      await Product.findByIdAndUpdate(
        item.productId._id,
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } }
    );

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Error placing order. Please try again.'
    });
  }
};

// Create Razorpay order (NEW FUNCTION)
const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { selectedAddressId, appliedCoupon } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Filter available items and validate stock
    const cartItems = cart.items.filter(item => 
      item.productId && 
      item.productId.category && 
      item.productId.category.isListed && 
      !item.productId.category.isDeleted &&
      item.productId.isListed &&
      !item.productId.isDeleted
    );

    // Stock validation
    for (const item of cartItems) {
      if (item.productId.quantity < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${item.productId.productName}`
        });
      }
    }

    // Get selected address
    const addressDoc = await Address.findOne({ userId });
    const selectedAddress = addressDoc.address.id(selectedAddressId);
    
    if (!selectedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Selected address not found'
      });
    }

    // Apply offer calculations
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Calculate order totals
    let subtotal = 0;
    let totalDiscount = 0;
    let amountAfterDiscount = 0;
    const orderedItems = [];

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice;
      const quantity = item.quantity;
      
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      subtotal += salePrice * quantity;
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: finalPrice,
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    let finalAmount = amountAfterDiscount + shippingCharges;

    //  Apply coupon discount if exists
    if (appliedCoupon && appliedCoupon.discountAmount) {
      finalAmount = finalAmount - appliedCoupon.discountAmount;
    }

    // Create order in database with Pending status
    const order = new Order({
      userId,
      orderedItems,
      totalPrice: subtotal,
      discount: totalDiscount,
      shippingCharges,
      finalAmount,
      shippingAddress: {
        addressType: selectedAddress.addressType,
        name: selectedAddress.name,
        city: selectedAddress.city,
        landMark: selectedAddress.landMark,
        state: selectedAddress.state,
        pincode: selectedAddress.pincode,
        phone: selectedAddress.phone,
        altPhone: selectedAddress.altPhone
      },
      paymentMethod: 'Online Payment',
      paymentStatus: 'Pending',
      orderTimeline: [{
        status: 'Pending',
        description: 'Order created, awaiting payment'
      }]
    });

    await order.save();

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: order.orderId,
      notes: {
        orderId: order.orderId,
        userId: userId.toString()
      }
    });

    // Get user data for prefill
    const user = await User.findById(userId).select('fullName email');

    res.status(200).json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: finalAmount,
      currency: 'INR',
      razorpayOrderId: razorpayOrder.id,
      orderId: order.orderId,
      prefill: {
        name: user.fullName,
        email: user.email,
        contact: selectedAddress.phone
      }
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment order. Please try again.'
    });
  }
};

// Verify Razorpay payment (NEW FUNCTION)
const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      // Mark payment as failed
      const order = await Order.findOne({ orderId });
      if (order) {
        order.paymentStatus = 'Failed';
        order.orderTimeline.push({
          status: 'Payment Failed',
          description: 'Payment signature verification failed'
        });
        await order.save();
      }
      
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        orderId: orderId
      });
    }

    // Update order status
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order with payment details
    order.paymentStatus = 'Completed';
    order.razorpayOrderId = razorpay_order_id;
    order.razorpayPaymentId = razorpay_payment_id;
    order.orderTimeline.push({
      status: 'Payment Completed',
      description: 'Payment verified successfully'
    });

    await order.save();

    // Update product quantities
    for (const item of order.orderedItems) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { quantity: -item.quantity } }
      );
    }

    // Clear cart
    await Cart.findOneAndUpdate(
      { userId: order.userId },
      { $set: { items: [] } }
    );

    res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order.orderId
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    
    // Mark payment as failed
    try {
      const { orderId } = req.body;
      if (orderId) {
        const order = await Order.findOne({ orderId });
        if (order) {
          order.paymentStatus = 'Failed';
          order.orderTimeline.push({
            status: 'Payment Failed',
            description: 'Payment verification error occurred'
          });
          await order.save();
        }
      }
    } catch (updateError) {
      console.error('Error updating order status:', updateError);
    }
    
    res.status(500).json({
      success: false,
      message: 'Error verifying payment',
      orderId: req.body.orderId
    });
  }
};

// Handle payment failure (NEW FUNCTION)
const paymentFailed = async (req, res) => {
  try {
    const { orderId, error } = req.body;

    // Update order status
    const order = await Order.findOne({ orderId });
    if (order) {
      order.paymentStatus = 'Failed';
      order.orderTimeline.push({
        status: 'Payment Failed',
        description: `Payment failed: ${error?.description || 'Unknown error'}`
      });
      await order.save();
    }

    res.status(200).json({
      success: true,
      message: 'Payment failure recorded',
      orderId: orderId
    });

  } catch (error) {
    console.error('Error handling payment failure:', error);
    res.status(500).json({
      success: false,
      message: 'Error handling payment failure'
    });
  }
};

// Load order success page
const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.redirect('/orders');
    }

    const user = await User.findById(userId).select('fullName email profilePhoto');

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar (should be 0 after order placement)
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render('user/order-success', {
      user,
      order,
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'order-success',
      title: 'Order Confirmed'
    });

  } catch (error) {
    console.error('Error loading order success:', error);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Error loading order confirmation: ' + error.message
      },
      message: error.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};

module.exports = {
  loadCheckout,
  placeOrder,
  loadOrderSuccess,
  createRazorpayOrder,     
  verifyPayment,           
  paymentFailed            
};
