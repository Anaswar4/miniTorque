const Cart = require('../../models/cart-schema');
const Address = require('../../models/address-schema');
const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-model');
const Wallet = require('../../models/wallet-schema');
const Wishlist = require('../../models/wishlist-schema');
const { calculateFinalPrice, calculateItemTotal, calculateItemDiscount, syncAllCartPrices, calculateCartSummary } = require('../../utils/price-calculator');
const { applyBestOffersToProducts } = require('../../utils/offer-utils');


// Load checkout page
// Load checkout page
const loadCheckout = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;  // ✅ FIXED: Support both auth methods

    // Get user data and wallet balance
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
      subtotal += regularPrice * quantity; // Use regular price for subtotal
      const itemDiscount = (regularPrice - finalPrice) * quantity; // Discount per item * quantity
      totalDiscount += itemDiscount;
      amountAfterDiscount += finalPrice * quantity; // Final amount customer pays
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50;
    const finalAmount = amountAfterDiscount + shippingCharges;

    // COD is now available for all order amounts
    const isCODAvailable = true;

    // Check for address success message from session
    const addressSuccess = req.session.addressSuccess;
    if (addressSuccess) {
      delete req.session.addressSuccess;
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


// Process order placement
const placeOrder = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;  // ✅ FIXED: Support both auth methods
    const { selectedAddressId, paymentMethod = 'Cash on Delivery' } = req.body;

    // Validate address selection
    if (!selectedAddressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    // If wallet payment, check wallet balance first
    if (paymentMethod === 'Wallet') {
      const wallet = await Wallet.getOrCreateWallet(userId);
      // We'll check balance after calculating final amount
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

    // Apply offer calculations to cart items for order processing
    if (cartItems.length > 0) {
      const products = cartItems.map(item => item.productId);
      const productsWithOffers = await applyBestOffersToProducts(products);
      
      // Map back to cart structure with offer details
      cartItems.forEach((item, index) => {
        item.productId = productsWithOffers[index];
      });
    }

    // Calculate order totals with offer-based pricing
    let subtotal = 0; // Based on sale prices (before offers)
    let totalDiscount = 0; // Discount from offers
    let amountAfterDiscount = 0; // Amount customer actually pays (after offers)
    const orderedItems = [];

    cartItems.forEach(item => {
      const salePrice = item.productId.salePrice; // Original sale price
      const quantity = item.quantity;
      
      // Get final price after offers (from stored cart price or offer details)
      let finalPrice = item.price || salePrice;
      if (item.productId.offerDetails && item.productId.offerDetails.finalPrice) {
        finalPrice = item.productId.offerDetails.finalPrice;
      }
      
      // Subtotal based on sale prices (before offers)
      subtotal += salePrice * quantity;
      
      // Calculate discount from offers
      const itemDiscount = calculateItemDiscount(salePrice, finalPrice, quantity);
      totalDiscount += itemDiscount;
      
      // Amount customer actually pays for this item (after offers)
      const itemFinalAmount = calculateItemTotal(finalPrice, quantity);
      amountAfterDiscount += itemFinalAmount;

      orderedItems.push({
        product: item.productId._id,
        quantity: quantity,
        price: finalPrice, // Store final price after offers
        totalPrice: itemFinalAmount
      });
    });

    const shippingCharges = amountAfterDiscount >= 500 ? 0 : 50; // Free shipping based on amount after discount
    const finalAmount = amountAfterDiscount + shippingCharges; // Final amount = amount after discount + shipping

    // COD validation removed - COD is now available for all order amounts

    // If wallet payment, check if sufficient balance
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

    // Process wallet payment if selected
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

// Load order success page
const loadOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  // ✅ FIXED: Support both auth methods

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
  loadOrderSuccess
};
