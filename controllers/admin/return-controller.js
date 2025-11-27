// Admin return request management controller
const mongoose = require('mongoose');
const Order = require('../../models/order-schema');
const User = require('../../models/user-model');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');

const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    let matchStage = {
      $or: [
        { status: 'Return Request' },
        { 
          $and: [
            { status: { $in: ['Delivered', 'Partially Returned'] } },
            { 'orderedItems.status': 'Return Request' }
          ]
        }
      ]
    };

    const totalRequests = await Order.countDocuments(matchStage);

    const returnRequests = await Order.find(matchStage)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName productImages mainImage regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const processedRequests = [];
    
    for (const order of returnRequests) {
      // Check if this is an entire order return or individual items
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const allItemsBeingReturned = (activeItems.length + returnRequestItems.length) === order.orderedItems.length;
      
      if (order.status === 'Return Request' && allItemsBeingReturned) {
        // This is an entire order return
        const includedItems = [...activeItems, ...returnRequestItems];
        
        let amountAfterDiscount = 0;
        includedItems.forEach(item => {
          amountAfterDiscount += item.totalPrice;
        });
        
        let currentTotal = amountAfterDiscount;
        if (includedItems.length > 0) {
          currentTotal += order.shippingCharges;
        }
        
        processedRequests.push({
          ...order.toObject(),
          returnType: 'entire',
          returnItems: includedItems,
          returnAmount: currentTotal
        });
      } else if (returnRequestItems.length > 0) {
        // These are individual item returns
        returnRequestItems.forEach(item => {
          processedRequests.push({
            ...order.toObject(),
            returnType: 'individual',
            returnItems: [item],
            returnAmount: item.totalPrice || (item.price * item.quantity),
            individualItemId: item._id,
            individualItemName: item.product ? item.product.productName : 'Unknown Product'
          });
        });
      }
    }

    const totalPages = Math.ceil(totalRequests / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalRequests);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        returnRequests: processedRequests,
        currentPage: page,
        totalPages,
        totalRequests,
        startIdx,
        endIdx
      });
    }

    res.render('admin/return-request', {
      returnRequests: processedRequests,
      currentPage: page,
      totalPages,
      totalRequests,
      startIdx,
      endIdx,
      title: 'Return Requests'
    });

  } catch (error) {
    console.error('Error fetching return requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return requests'
    });
  }
};

const approveReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { adminNote, itemIds } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'fullName email')
      .populate('orderedItems.product', 'productName quantity');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get current return request items
    let returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');

    if (returnRequestItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No return requests found for this order'
      });
    }

    // Determine if this is entire order return or individual items
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const allItemsBeingReturned = (activeItems.length + returnRequestItems.length) === order.orderedItems.length;
    const isEntireOrderReturn = order.status === 'Return Request' && allItemsBeingReturned;

    let refundAmount = 0;
    let returnedItemsDescription = '';

    // --- COUPON SPLIT LOGIC STARTS HERE ---
    // Sum of all items, before coupon applied
    const orderValue = order.orderedItems.reduce((sum, oi) => sum + (oi.price * oi.quantity), 0);

    if (isEntireOrderReturn) {

      // Check if already processed
      const alreadyProcessed = order.orderedItems.every(item =>
        item.status === 'Returned' || item.returnApprovedAt
      );

      if (alreadyProcessed) {
        return res.status(400).json({
          success: true,
          message: 'This return request has already been processed'
        });
      }

      order.status = 'Returned';

      const includedItems = [...activeItems, ...returnRequestItems];

      let amountAfterDiscount = 0;
      includedItems.forEach(item => {
        const lineValue = item.price * item.quantity;
        const couponShare = orderValue > 0
          ? (lineValue / orderValue) * (order.couponDiscount || 0)
          : 0;
        amountAfterDiscount += lineValue - couponShare;
      });

      if (includedItems.length > 0) {
        amountAfterDiscount += order.shippingCharges;
      }
      refundAmount = amountAfterDiscount;

      for (const item of order.orderedItems) {
        if (item.status === 'Active' || item.status === 'Return Request') {
          item.status = 'Returned';
          item.returnApprovedAt = new Date();

          if (!item.returnReason) {
            item.returnReason = 'Entire order return approved by admin';
          }

          // Restore product stock
          await Product.findByIdAndUpdate(
            item.product._id,
            { $inc: { quantity: item.quantity } }
          );
        }
      }

      returnedItemsDescription = 'Entire order';

    } else {
      // INDIVIDUAL ITEM RETURN
      if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        returnRequestItems = returnRequestItems.filter(item => itemIds.includes(item._id.toString()));
      }

      // Check if these specific items are already approved
      const itemsToApprove = returnRequestItems.filter(item => !item.returnApprovedAt);

      if (itemsToApprove.length === 0) {
        return res.status(400).json({
          success: true,
          message: 'All selected items in this return request have already been processed'
        });
      }

      // Approve each individual item (coupon split for each)
      for (const item of itemsToApprove) {
        item.status = 'Returned';
        item.returnApprovedAt = new Date();

        const lineValue = item.price * item.quantity;
        const couponShare = orderValue > 0
          ? (lineValue / orderValue) * (order.couponDiscount || 0)
          : 0;
        const itemRefundAmount = lineValue - couponShare;
        refundAmount += itemRefundAmount;

        if (returnedItemsDescription) {
          returnedItemsDescription += ', ';
        }
        returnedItemsDescription += `${item.product.productName} (₹${itemRefundAmount.toFixed(2)})`;

        // Restore product stock
        await Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { quantity: item.quantity } }
        );
      }

      // Update order status based on remaining items
      const remainingActiveItems = order.orderedItems.filter(item => item.status === 'Active');
      const allReturnedItems = order.orderedItems.filter(item => item.status === 'Returned');

      if (remainingActiveItems.length === 0 && allReturnedItems.length === order.orderedItems.length) {
        order.status = 'Returned';
      } else {
        order.status = 'Partially Returned';
      }
    }

    // Add refund to wallet
    if (refundAmount > 0) {
      const wallet = await Wallet.getOrCreateWallet(order.userId);
      await wallet.addMoney(
        refundAmount,
        `Refund for returned items: ${returnedItemsDescription} (Order: ${order.orderId})`,
        order.orderId
      );
    }

    // Update order-level return approval (only set once)
    if (!order.returnApprovedAt) {
      order.returnApprovedAt = new Date();
    }
    order.adminNote = adminNote || 'Return request approved by admin';

    order.orderTimeline.push({
      status: order.status,
      timestamp: new Date(),
      description: `Return approved for: ${returnedItemsDescription}. Refund: ₹${refundAmount.toFixed(2)}. ${adminNote || 'Return approved by admin'}`
    });

    await order.save();

    res.json({
      success: true,
      message: `Return request approved successfully. Refund of ₹${refundAmount.toFixed(2)} has been processed to customer wallet for: ${returnedItemsDescription}`,
      order,
      refundAmount,
      returnedItems: returnedItemsDescription
    });

  } catch (error) {
    console.error('Error approving return:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve return request',
      error: error.message
    });
  }
};


const rejectReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rejectionReason, itemIds } = req.body;

    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'fullName email')
      .populate('orderedItems.product', 'productName');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get current return request items
    let returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
    
    if (returnRequestItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No return requests found for this order'
      });
    }

    //  Determine if this is entire order return or individual items
    const activeItems = order.orderedItems.filter(item => item.status === 'Active');
    const allItemsBeingReturned = (activeItems.length + returnRequestItems.length) === order.orderedItems.length;
    const isEntireOrderReturn = order.status === 'Return Request' && allItemsBeingReturned;
    
    let rejectedItemsDescription = '';

    if (isEntireOrderReturn) {
      // ENTIRE ORDER RETURN REJECTION
      order.status = 'Delivered';
      order.returnRejectedAt = new Date();
      order.rejectionReason = rejectionReason;
      
      for (const item of order.orderedItems) {
        if (item.status === 'Return Request') {
          item.status = 'Active';
          item.returnRejectedAt = new Date();
          item.rejectionReason = rejectionReason;
        }
      }
      
      rejectedItemsDescription = 'Entire order';
    } else {
      //  INDIVIDUAL ITEM RETURN REJECTION
      // If itemIds provided, filter to those specific items
      if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        returnRequestItems = returnRequestItems.filter(item => itemIds.includes(item._id.toString()));
      }
      
      if (returnRequestItems.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid items found to reject'
        });
      }
      
      // Reject each individual item
      for (const item of returnRequestItems) {
        item.status = 'Active';
        item.returnRejectedAt = new Date();
        item.rejectionReason = rejectionReason;
        
        if (rejectedItemsDescription) {
          rejectedItemsDescription += ', ';
        }
        rejectedItemsDescription += item.product.productName;
      }
      
      // Update order-level rejection info
      order.returnRejectedAt = new Date();
      order.rejectionReason = rejectionReason;
      
      // Update order status based on remaining items
      const stillPendingReturns = order.orderedItems.some(item => item.status === 'Return Request');
      
      if (!stillPendingReturns) {
        // No more pending returns, check order status
        const hasActiveItems = order.orderedItems.some(item => item.status === 'Active');
        const hasReturnedItems = order.orderedItems.some(item => item.status === 'Returned');
        
        if (hasActiveItems && hasReturnedItems) {
          order.status = 'Partially Returned';
        } else if (hasActiveItems && !hasReturnedItems) {
          order.status = 'Delivered';
        } else if (!hasActiveItems && hasReturnedItems) {
          order.status = 'Returned';
        }
      }
    }

    order.orderTimeline.push({
      status: 'Return Rejected',
      timestamp: new Date(),
      description: `Return rejected for: ${rejectedItemsDescription}. Reason: ${rejectionReason}`
    });

    await order.save();

    res.json({
      success: true,
      message: `Return request rejected successfully for: ${rejectedItemsDescription}`,
      order
    });

  } catch (error) {
    console.error('Error rejecting return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject return request',
      error: error.message
    });
  }
};

module.exports = {
  getReturnRequests,
  approveReturnRequest,
  rejectReturnRequest
};