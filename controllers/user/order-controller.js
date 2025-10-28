const Order = require('../../models/order-schema');
const Product = require('../../models/product-schema');
const User = require('../../models/user-model');
const Razorpay = require('razorpay');
const Wallet = require('../../models/wallet-schema');
const Wishlist = require('../../models/wishlist-schema');  
const Cart = require('../../models/cart-schema');  
const InvoiceGenerator = require('../../utils/pdf-invoice-generator');



// razorpay initialization 
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Load order listing page
const loadOrderList = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;  
    const { highlight } = req.query; 

    // Get user data for sidebar
    const user = await User.findById(userId).select('fullName email name displayName googleName profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's orders with populated product data
    const orders = await Order.find({ userId })
      .populate('orderedItems.product')
      .sort({ createdAt: -1 });

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render('user/order-list', {
      user,
      orders: orders || [],
      wishlistCount,  
      cartCount,      
      isAuthenticated: true,  
      currentPage: 'orders',  
      title: 'My Orders',
      highlightOrderId: highlight || null 
    });
  } catch (error) {
    console.error('Error loading order list:', error);
    res.status(500).render('error', {
      message: 'Error loading orders',
      user: res.locals.user || null,  
      wishlistCount: 0,  
      cartCount: 0
    });
  }
};

// Load order details page
const loadOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  

    // Get user data
    const user = await User.findById(userId).select('fullName email name displayName googleName profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).render('error', {
        message: 'Order not found',
        user: res.locals.user || null,  
        wishlistCount: 0,  
        cartCount: 0
      });
    }

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render('user/order-details', {
      user,
      order,
      wishlistCount,  
      cartCount,      
      isAuthenticated: true,  
      currentPage: 'order-details',  
      title: `Order ${orderId}`
    });
  } catch (error) {
    console.error('Error loading order details:', error);
    res.status(500).render('error', {
      message: 'Error loading order details',
      user: res.locals.user || null,  
      wishlistCount: 0,  
      cartCount: 0
    });
  }
};



// Cancel individual item
const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  
    const { reason } = req.body;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    

    // Check if order can be cancelled based on status
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Find the specific item
    const orderItem = order.orderedItems.id(itemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    // Check if item can be cancelled
    if (orderItem.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled or returned'
      });
    }

    // Cancel the item
    orderItem.status = 'Cancelled';
    orderItem.cancellationReason = reason || 'Item cancelled by customer';
    orderItem.cancelledAt = new Date();

    // Restore product stock
    try {
      const productUpdateResult = await Product.findByIdAndUpdate(
        orderItem.product._id,
        { $inc: { quantity: orderItem.quantity } },
        { new: true }
      );
    } catch (stockError) {
      console.error('Error restoring product stock:', stockError);
      // Continue with order cancellation even if stock update fails
    }

    // Recalculate order amounts based on active items only
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const cancelledItems = order.orderedItems.filter(item => item.status === 'Cancelled');
    
    if (activeItems.length === 0) {
      // All items cancelled - set amounts to 0
      order.status = 'Cancelled';
      order.totalPrice = 0;
      order.finalAmount = 0;
    } else {
      // Partially cancelled - recalculate based on active items with proportional discount
      order.status = 'Partially Cancelled';
      
      // Calculate totals
      const activeItemsTotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const cancelledItemsTotal = cancelledItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const originalOrderTotal = activeItemsTotal + cancelledItemsTotal;
      
      // Calculate proportional discount for active items only
      let applicableDiscount = 0;
      if (order.discount > 0 && originalOrderTotal > 0) {
        const activeItemsProportion = activeItemsTotal / originalOrderTotal;
        applicableDiscount = Math.min(order.discount * activeItemsProportion, activeItemsTotal);
      }
      
      // Update order totals
      order.totalPrice = activeItemsTotal;
      order.finalAmount = Math.max(0, activeItemsTotal - applicableDiscount + order.shippingCharges);
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: order.status,
      description: `Item cancelled: ${orderItem.product.productName} - ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
    });

    // Credit wallet for cancelled item 
    let walletCreditAmount = 0;
    
    // Calculate refund amount 
    let refundAmount = orderItem.totalPrice;
    
    // Check if this is the last item being cancelled and there were previous individual cancellations
    const previouslyCancelledItems = order.orderedItems.filter(item => 
      item.status === 'Cancelled' && item._id.toString() !== itemId
    );
    
    if (activeItems.length === 0 && previouslyCancelledItems.length > 0 && order.couponDiscount > 0) {
      // This is the last item being cancelled after previous partial cancellations
      refundAmount = Math.max(0, orderItem.totalPrice - order.couponDiscount);
    }
    
    // Apply payment method logic to the calculated refund amount
    if (order.paymentMethod === 'Cash on Delivery') {
      // For COD, only credit if payment was actually collected (status Completed)
      if (order.paymentStatus === 'Completed') {
        walletCreditAmount = refundAmount;
      }
    } else {
      // For online payments always credit to wallet
      walletCreditAmount = refundAmount;
    }
    
    if (walletCreditAmount > 0) {
      try {
        const wallet = await Wallet.getOrCreateWallet(userId);
        await wallet.addMoney(
          walletCreditAmount,
          `Refund for cancelled item: ${orderItem.product.productName} (Order: ${order.orderId})`,
          order.orderId
        );
      } catch (walletError) {
        console.error('Error adding money to wallet for cancelled item:', walletError);
        // Continue with cancellation even if wallet credit fails
      }
    }

    await order.save();

    const responseMessage = walletCreditAmount > 0 
      ? `Item cancelled successfully. ₹${walletCreditAmount} has been credited to your wallet.`
      : 'Item cancelled successfully';

    res.status(200).json({
      success: true,
      message: responseMessage,
      walletCredited: walletCreditAmount > 0,
      creditAmount: walletCreditAmount
    });

  } catch (error) {
    console.error('Error cancelling order item:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order item: ' + error.message
    });
  }
};



// Cancel entire order
const cancelEntireOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  
    const { reason } = req.body;

    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (['Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Credit wallet for ALL cancelled orders (regardless of payment method) - BEFORE updating order amounts
    let walletCreditAmount = 0;
    
    // For COD orders, credit only if payment was made 
    // For online payments, credit the full amount regardless of payment status
    if (order.paymentMethod === 'Cash on Delivery') {
      // For COD, only credit if payment was actually collected (status Completed)
      if (order.paymentStatus === 'Completed') {
        walletCreditAmount = order.finalAmount;
      }
    } else {
      // For online payments (including pending ones), always credit to wallet
      walletCreditAmount = order.finalAmount;
    }
    
    if (walletCreditAmount > 0) {
      try {
        const wallet = await Wallet.getOrCreateWallet(userId);
        await wallet.addMoney(
          walletCreditAmount,
          `Refund for cancelled order (Order: ${order.orderId})`,
          order.orderId
        );
      } catch (walletError) {
        console.error('Error adding money to wallet for cancelled order:', walletError);
        
      }
    }

    // Update order status and amounts AFTER wallet credit
    order.status = 'Cancelled';
    order.totalPrice = 0;
    order.finalAmount = 0;

    // Cancel all active items and restore stock
    let itemsCancelled = 0;
    for (const item of order.orderedItems) {
      if (item.status === 'Active') {
        item.status = 'Cancelled';
        item.cancellationReason = reason || 'Order cancelled by customer';
        item.cancelledAt = new Date();
        itemsCancelled++;

        // Restore product stock
        try {
          const productUpdateResult = await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } },
            { new: true }
          );
        } catch (stockError) {
          console.error('Error restoring product stock for item:', item.product.productName, stockError);
          
        }
      }
    }

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Cancelled',
      description: `Order cancelled: ${reason || 'Cancelled by customer'}`,
      timestamp: new Date()
    });

    await order.save();

    const responseMessage = walletCreditAmount > 0 
      ? `Order cancelled successfully. ₹${walletCreditAmount} has been credited to your wallet.`
      : 'Order cancelled successfully';

    res.status(200).json({
      success: true,
      message: responseMessage,
      walletCredited: walletCreditAmount > 0,
      creditAmount: walletCreditAmount
    });

  } catch (error) {
    console.error('Error cancelling entire order:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling order: ' + error.message
    });
  }
};



// Request return for an order (entire order or specific items)
const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  
    const { reason, items, requestType } = req.body;

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned(only delivered orders can be returned
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Check if return request already exists for entire order or if return has been attempted
    if (order.status === 'Return Request' || order.status === 'Returned' || order.returnAttempted) {
      return res.status(400).json({
        success: false,
        message: 'Return request has already been submitted for this order. Only one return attempt is allowed per order.'
      });
    }

    // Check if order is within return window 
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 7) {
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Handle individual item returns vs entire order return
    if (items && Array.isArray(items) && items.length > 0) {
      // Individual item return(s)
      let returnedItemsCount = 0;
      let returnDescription = '';
      
      for (const returnItem of items) {
        const orderItem = order.orderedItems.id(returnItem.itemId);
        if (orderItem && orderItem.status === 'Active' && !orderItem.returnAttempted) {
          orderItem.status = 'Return Request';
          orderItem.returnReason = returnItem.reason || reason || 'Return requested by customer';
          orderItem.returnRequestedAt = new Date();
          orderItem.returnAttempted = true; 
          returnedItemsCount++;
          
          if (returnDescription) {
            returnDescription += ', ';
          }
          returnDescription += orderItem.product.productName;
        }
      }

      if (returnedItemsCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid items found for return'
        });
      }

      // Check if all active items are now being returned
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      
      if (activeItems.length === 0 && returnRequestItems.length > 0) {
        // All items are being returned
        order.status = 'Return Request';
        order.returnReason = `Individual items return: ${returnDescription}`;
      } else {
        // Partial return - keep order as delivered but mark items
        order.returnReason = `Partial return requested: ${returnDescription}`;
      }

      order.returnRequestedAt = new Date();

      // Add to order timeline
      order.orderTimeline.push({
        status: returnedItemsCount === order.orderedItems.length ? 'Return Request' : 'Partial Return Request',
        description: `Return requested for items: ${returnDescription}`,
        timestamp: new Date()
      });

      await order.save();

      res.status(200).json({
        success: true,
        message: `Return request submitted for ${returnedItemsCount} item(s). Admin will review your request.`
      });

    } else {
      // Entire order return (legacy support)
      order.status = 'Return Request';
      order.returnReason = reason || 'Return requested by customer';
      order.returnRequestedAt = new Date();
      order.returnAttempted = true; 
      
      // Also mark all items as return attempted
      order.orderedItems.forEach(item => {
        if (item.status === 'Active') {
          item.returnAttempted = true;
        }
      });

      // Add to order timeline
      order.orderTimeline.push({
        status: 'Return Request',
        description: `Return requested: ${reason || 'Return requested by customer'}`,
        timestamp: new Date()
      });

      await order.save();

      res.status(200).json({
        success: true,
        message: 'Return request submitted successfully. Admin will review your request.'
      });
    }

  } catch (error) {
    console.error('Error requesting return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request: ' + error.message
    });
  }
};



// Download PDF invoice for an order
const downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  

    // Get user data
    const user = await User.findById(userId).select('fullName email profilePhoto');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order is eligible for invoice download
    if (order.status === 'Cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Invoice is not available for cancelled orders.'
      });
    }

    const isEligibleForInvoice = 
      (order.paymentMethod === 'Cash on Delivery') ||
      (order.paymentMethod !== 'Cash on Delivery' && order.paymentStatus === 'Completed');

    if (!isEligibleForInvoice) {
      return res.status(403).json({
        success: false,
        message: 'Invoice is only available for completed payments. Please complete your payment first.'
      });
    }

    // Generate PDF invoice
    const invoiceGenerator = new InvoiceGenerator();
    const pdfBuffer = await invoiceGenerator.generateInvoice(order, user);

    // Set response headers for PDF download
    const filename = `Invoice-${order.orderId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating invoice'
    });
  }
};

// Request return for individual item
const requestIndividualItemReturn = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;  
    const { reason } = req.body;

    // Get order with populated product data
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned 
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Find the specific item
    const orderItem = order.orderedItems.id(itemId);
    if (!orderItem) {
      return res.status(404).json({
        success: false,
        message: 'Order item not found'
      });
    }

    // Check if item can be returned
    if (orderItem.status !== 'Active' || orderItem.returnAttempted) {
      return res.status(400).json({
        success: false,
        message: 'Item is already cancelled, returned, has a return request, or return has already been attempted. Only one return attempt is allowed per item.'
      });
    }

    // Check if order is within return window 
    const deliveryDate = order.orderTimeline.find(timeline => timeline.status === 'Delivered')?.timestamp;
    if (deliveryDate) {
      const daysSinceDelivery = Math.floor((new Date() - new Date(deliveryDate)) / (1000 * 60 * 60 * 24));
      if (daysSinceDelivery > 7) {
        return res.status(400).json({
          success: false,
          message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
        });
      }
    }

    // Update item status to Return Request
    orderItem.status = 'Return Request';
    orderItem.returnReason = reason || 'Return requested by customer';
    orderItem.returnRequestedAt = new Date();
    orderItem.returnAttempted = true; 

    // Add to order timeline
    order.orderTimeline.push({
      status: 'Individual Item Return Request',
      description: `Return requested for item: ${orderItem.product.productName} - ${reason || 'Return requested by customer'}`,
      timestamp: new Date()
    });

    await order.save();

    res.status(200).json({
      success: true,
      message: `Return request submitted successfully for "${orderItem.product.productName}". Admin will review your request.`,
      itemName: orderItem.product.productName,
      returnAmount: orderItem.totalPrice
    });

  } catch (error) {
    console.error('Error requesting individual item return:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting return request: ' + error.message
    });
  }
};

// Load retry payment page
const loadRetryPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;

    // Get user data
    const user = await User.findById(userId).select('fullName email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');
      
    if (!order) {
      return res.redirect('/orders');
    }

    // Check if order payment is actually failed
    if (order.paymentStatus !== 'Failed') {
      return res.redirect(`/order-details/${orderId}`);
    }

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    // Create new Razorpay order for retry
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), // Amount in paise
      currency: 'INR',
      receipt: order.orderId + '_retry_' + Date.now(),
      notes: {
        orderId: order.orderId,
        userId: userId.toString(),
        retry: 'true'
      }
    });

    res.render('user/retry-payment', {
      user,
      order,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrderId: razorpayOrder.id,
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'retry-payment',
      title: 'Retry Payment'
    });

  } catch (error) {
    console.error('Error loading retry payment:', error);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Error loading retry payment page: ' + error.message
      },
      message: error.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};

// Load order failure page
const loadOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.session.userId || req.session.googleUserId;

    // Get user data
    const user = await User.findById(userId).select('fullName email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get order
    const order = await Order.findOne({ orderId, userId })
      .populate('orderedItems.product');
      
    if (!order) {
      return res.redirect('/orders');
    }

    // Get wishlist count for navbar
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    // Get cart count for navbar
    const cart = await Cart.findOne({ userId }).lean();
    const cartCount = cart && cart.items ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;

    res.render('user/order-failure', {
      user,
      order,
      wishlistCount,
      cartCount,
      isAuthenticated: true,
      currentPage: 'order-failure',
      title: 'Payment Failed'
    });

  } catch (error) {
    console.error('Error loading order failure:', error);
    res.status(500).render('error', {
      error: {
        status: 500,
        message: 'Error loading order failure page: ' + error.message
      },
      message: error.message,
      user: req.user || null,
      wishlistCount: 0,
      cartCount: 0
    });
  }
};



module.exports = {
  loadOrderList,
  loadOrderDetails,
  cancelOrderItem,
  cancelEntireOrder,
  requestReturn,
  requestIndividualItemReturn,
  downloadInvoice,
  loadRetryPayment,      
  loadOrderFailure 
};