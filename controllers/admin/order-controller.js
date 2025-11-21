// Admin order management controller
const Order = require('../../models/order-schema');
const User = require('../../models/user-model');
const Product = require('../../models/product-schema');
const Wallet = require('../../models/wallet-schema');



const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    let searchQuery = {};
    
    if (searchTerm) {
      searchQuery.$or = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
    }

    if (statusFilter) {
      searchQuery.status = statusFilter;
    }

    const totalOrders = await Order.countDocuments(searchQuery);

    const returnRequestCount = await Order.countDocuments({
      $or: [
        { status: 'Return Request' },
        { 'orderedItems.status': 'Return Request' }
      ]
    });

    const orders = await Order.find(searchQuery)
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName mainImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalOrders / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalOrders);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        orders,
        currentPage: page,
        totalPages,
        totalOrders,
        startIdx,
        endIdx,
        searchTerm,
        statusFilter
      });
    }

    res.render('admin/admin-order-listing', {
      orders,
      currentPage: page,
      totalPages,
      totalOrders,
      startIdx,
      endIdx,
      searchTerm,
      statusFilter,
      returnRequestCount,
      title: 'Order Management'
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

const getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName mainImage regularPrice sellingPrice');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details'
    });
  }
};

const getOrderDetailsPage = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate('userId', 'fullName email phone')
      .populate('orderedItems.product', 'productName mainImage regularPrice sellingPrice');

    if (!order) {
      return res.status(404).render('error', {
        message: 'Order not found',
        error: { status: 404 }
      });
    }

    const activeItems = order.orderedItems.filter(item => 
     ['Pending', 'Processing', 'Shipped', 'Delivered'].includes(item.status));
// Calculate based on actual prices paid 
const subtotalActiveProducts = activeItems.reduce((total, item) => {
  return total + item.totalPrice;  // Uses the actual amount customer paid
}, 0);

const finalAmountActive = subtotalActiveProducts;  

    const isUserCancelled = order.status === 'Cancelled';
    
    const hasUserCancellation = order.orderedItems.some(item => 
      item.status === 'Cancelled' && 
      item.cancellationReason && 
      !item.cancellationReason.includes('by admin')
    );

    res.render('admin/admin-order-details', {
      order: {
        ...order.toObject(),
        subtotalActiveProducts: subtotalActiveProducts,
        finalAmountActive: finalAmountActive
      },
      isUserCancelled,
      hasUserCancellation,
      title: `Order Details - ${order.orderId}`
    });

  } catch (error) {
    console.error('Error fetching order details page:', error);
    res.status(500).render('error', {
      message: 'Failed to load order details',
      error: { status: 500 }
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned', 'Cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const isUserCancelled = order.status === 'Cancelled' && 
      order.orderedItems.every(item => 
        item.status === 'Cancelled' && 
        item.cancellationReason && 
        !item.cancellationReason.includes('by admin')
      );

    if (isUserCancelled) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of an order that was cancelled by the customer'
      });
    }

    // Allow status updates for partially cancelled orders, but not for fully cancelled orders
    if (order.status === 'Cancelled') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of a fully cancelled order'
      });
    }

    // Check payment status - only allow status updates for completed payments (except COD)
    console.log(`Order ${orderId} - Payment Method: ${order.paymentMethod}, Payment Status: ${order.paymentStatus}`);
    if (order.paymentMethod !== 'Cash on Delivery' && order.paymentStatus !== 'Completed') {
      console.log(`Blocking status update for order ${orderId} due to incomplete payment`);
      return res.status(403).json({
        success: false,
        message: 'Cannot update status of orders with pending or failed payments. Payment must be completed first.'
      });
    }
    
    const statusFlow = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'];
    const currentStatusIndex = statusFlow.indexOf(order.status);
    const newStatusIndex = statusFlow.indexOf(status);

    if (status === 'Cancelled') {
      if (!['Pending', 'Processing', 'Partially Cancelled'].includes(order.status)) {
        return res.status(403).json({
          success: false,
          message: 'Orders can only be cancelled when status is Pending, Processing, or Partially Cancelled'
        });
      }
    } else {
      // For partially cancelled orders, allow normal status progression for remaining items
      if (order.status === 'Partially Cancelled') {
        // Allow any forward progression from Partially Cancelled
        if (!['Processing', 'Shipped', 'Delivered', 'Return Request', 'Returned'].includes(status)) {
          return res.status(403).json({
            success: false,
            message: 'Invalid status transition from Partially Cancelled'
          });
        }
      } else {
        const finalStates = ['Delivered', 'Returned', 'Cancelled'];
        if (finalStates.includes(order.status) && status !== order.status) {
          return res.status(403).json({
            success: false,
            message: `Cannot change status from ${order.status} to ${status}`
          });
        }

        if (currentStatusIndex !== -1 && newStatusIndex !== -1) {
          if (status === 'Return Request' && order.status !== 'Delivered') {
            return res.status(403).json({
              success: false,
              message: 'Return Request can only be initiated from Delivered status'
            });
          }
          
          if (status === 'Returned' && order.status !== 'Return Request') {
            return res.status(403).json({
              success: false,
              message: 'Status can only be changed to Returned from Return Request'
            });
          }
          
          if (status !== 'Return Request' && status !== 'Returned') {
            if (newStatusIndex !== currentStatusIndex + 1) {
              return res.status(403).json({
                success: false,
                message: 'Status changes must follow the sequential order. Cannot skip statuses.'
              });
            }
          }
        }
      }
    }

    order.status = status;

    if (status === 'Delivered') {
  order.orderedItems.forEach(item => {
    if (
      item.status === 'Pending' ||
      item.status === 'Processing' ||
      item.status === 'Shipped'
    ) {
      item.status = 'Delivered';
    }
  });
}
    
    if (status === 'Cancelled') {
      const activeItems = order.orderedItems.filter(item => item.status === 'Active');
      const returnRequestItems = order.orderedItems.filter(item => item.status === 'Return Request');
      const includedItems = [...activeItems, ...returnRequestItems];
      
      let refundAmount = 0;
      includedItems.forEach(item => {
        refundAmount += item.totalPrice;
      });
      
      if (includedItems.length > 0) {
        refundAmount += order.shippingCharges;
      }
      
      if (order.couponApplied && order.couponDiscount > 0) {
        refundAmount -= order.couponDiscount;
      }
      
      if (refundAmount > 0) {
        try {
          const wallet = await Wallet.getOrCreateWallet(order.userId);
          await wallet.addMoney(
            refundAmount,
            `Refund for order cancelled by admin (Order: ${order.orderId})`,
            order.orderId
          );
        } catch (walletError) {
          console.error('Error adding money to wallet for admin cancelled order:', walletError);
        }
      }
      
      for (const item of order.orderedItems) {
        if (item.status === 'Active') {
          item.status = 'Cancelled';
          item.cancellationReason = 'Order cancelled by admin';
          item.cancelledAt = new Date();
          
          try {
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { quantity: item.quantity } }
            );
          } catch (stockError) {
            console.error('Error restoring product stock:', stockError);
          }
        }
      }
      
      order.totalPrice = 0;
      order.finalAmount = 0;
    }
    
    if (status === 'Delivered' && order.paymentMethod === 'Cash on Delivery' && order.paymentStatus === 'Pending') {
      order.paymentStatus = 'Completed';
      
      order.orderTimeline.push({
        status: 'Payment Completed',
        timestamp: new Date(),
        description: 'Payment collected on delivery (Cash on Delivery)'
      });
    }
    
    order.orderTimeline.push({
      status: status,
      timestamp: new Date(),
      description: status === 'Cancelled' 
        ? 'Order cancelled by admin' 
        : `Order status updated to ${status} by admin`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

const rejectReturnRequest = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { rejectionReason } = req.body;

    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const order = await Order.findById(orderId)
      .populate('userId', 'fullname email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'Return Request') {
      return res.status(400).json({
        success: false,
        message: 'Order is not in return request status'
      });
    }

    order.status = 'Delivered';
    order.returnRejectedAt = new Date();
    order.rejectionReason = rejectionReason;

    order.orderTimeline.push({
      status: 'Return Rejected',
      timestamp: new Date(),
      description: `Return request rejected: ${rejectionReason}`
    });

    await order.save();

    res.json({
      success: true,
      message: 'Return request rejected successfully.',
      order
    });

  } catch (error) {
    console.error('Error rejecting return request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject return request'
    });
  }
};

const getReturnRequestCount = async (req, res) => {
  try {
    const entireOrderReturns = await Order.countDocuments({ 
      status: 'Return Request' 
    });

    const individualItemReturns = await Order.countDocuments({
      'orderedItems.status': 'Return Request'
    });

    const totalReturnRequests = await Order.countDocuments({
      $or: [
        { status: 'Return Request' },
        { 'orderedItems.status': 'Return Request' }
      ]
    });

    res.json({
      success: true,
      count: totalReturnRequests,
      breakdown: {
        entireOrderReturns,
        individualItemReturns,
        total: totalReturnRequests
      }
    });

  } catch (error) {
    console.error('Error fetching return request count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch return request count',
      count: 0
    });
  }
};

const getReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const searchTerm = req.query.search || '';
    const statusFilter = req.query.status || '';

    let searchQuery = {
      $or: [
        { status: 'Return Request' },
        { status: 'Returned' },
        { returnRequestedAt: { $exists: true } },
        { returnApprovedAt: { $exists: true } },
        { returnRejectedAt: { $exists: true } }
      ]
    };
    
    if (statusFilter) {
      if (statusFilter === 'Pending') {
        searchQuery = { status: 'Return Request' };
      } else if (statusFilter === 'Approved' || statusFilter === 'Returned') {
        searchQuery = { status: 'Returned' };
      } else if (statusFilter === 'Rejected') {
        searchQuery = { 
          returnRejectedAt: { $exists: true },
          status: 'Delivered' 
        };
      } else {
        searchQuery.status = statusFilter;
      }
    }
    
    if (searchTerm) {
      const searchConditions = [
        { orderId: { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.name': { $regex: searchTerm, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: searchTerm, $options: 'i' } }
      ];
      
      if (statusFilter) {
        searchQuery = {
          $and: [
            searchQuery,
            { $or: searchConditions }
          ]
        };
      } else {
        searchQuery = {
          $and: [
            {
              $or: [
                { status: 'Return Request' },
                { status: 'Returned' },
                { returnRequestedAt: { $exists: true } },
                { returnApprovedAt: { $exists: true } },
                { returnRejectedAt: { $exists: true } }
              ]
            },
            { $or: searchConditions }
          ]
        };
      }
    }

    const totalRequests = await Order.countDocuments({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] });

    const returnRequests = await Order.find({ $and: [ searchQuery, { status: { $ne: "Cancelled" } } ] })
      .populate('userId', 'fullname email phone')
      .populate('orderedItems.product', 'productName mainImage regularPrice sellingPrice')
      .sort({ returnRequestedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalRequests / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalRequests);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        returnRequests,
        currentPage: page,
        totalPages,
        totalRequests,
        startIdx,
        endIdx,
        searchTerm,
        statusFilter
      });
    }

    res.render('admin/return-request', {
      returnRequests,
      currentPage: page,
      totalPages,
      totalRequests,
      startIdx,
      endIdx,
      searchTerm,
      statusFilter,
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

const updateItemsStatusBulk = async (req, res) => {
  try {
    const orderId = req.params.id;
    const { updates } = req.body; 

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    const order = await Order.findById(orderId).populate('orderedItems.product', 'productName');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check payment status
    if (order.paymentStatus !== 'Completed') {
      return res.status(403).json({
        success: false,
        message: 'Cannot update items. Payment must be completed first.'
      });
    }

    const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'];
    let updatedCount = 0;
    const updateResults = [];

    // Process each update
    for (const update of updates) {
      const { itemIndex, status } = update;

      if (!validStatuses.includes(status)) {
        updateResults.push({ itemIndex, success: false, reason: 'Invalid status' });
        continue;
      }

      if (itemIndex < 0 || itemIndex >= order.orderedItems.length) {
        updateResults.push({ itemIndex, success: false, reason: 'Invalid item index' });
        continue;
      }

      const item = order.orderedItems[itemIndex];

      // Skip if item was cancelled by user
      if (item.status === 'Cancelled' && 
          item.cancellationReason && 
          !item.cancellationReason.includes('by admin')) {
        updateResults.push({ itemIndex, success: false, reason: 'Cancelled by customer' });
        continue;
      }

      // Skip if item is in final state
      const finalStates = ['Cancelled', 'Returned','Delivered'];
      if (finalStates.includes(item.status)) {
        updateResults.push({ itemIndex, success: false, reason: 'Item in final state' });
        continue;
      }

      // Update item status
      const oldStatus = item.status;
      item.status = status;

      // Handle status-specific actions
      if (status === 'Cancelled') {
        item.cancellationReason = 'Cancelled by admin';
        item.cancelledAt = new Date();
        
        // Restore stock
        try {
          await Product.findByIdAndUpdate(
            item.product,
            { $inc: { quantity: item.quantity } }
          );
        } catch (stockError) {
          console.error('Error restoring stock:', stockError);
        }
        
        // Refund to wallet
        const refundAmount = item.totalPrice;
        if (refundAmount > 0) {
          try {
            const wallet = await Wallet.getOrCreateWallet(order.userId);
            await wallet.addMoney(
              refundAmount,
              `Refund for cancelled item (Order: ${order.orderId})`,
              order.orderId
            );
          } catch (walletError) {
            console.error('Error processing refund:', walletError);
          }
        }
      } else if (status === 'Return Request') {
        item.returnRequestedAt = new Date();
        item.returnAttempted = true;
      } else if (status === 'Returned') {
        item.returnApprovedAt = new Date();
        
        // Restore stock
        try {
          await Product.findByIdAndUpdate(
            item.product,
            { $inc: { quantity: item.quantity } }
          );
        } catch (stockError) {
          console.error('Error restoring stock:', stockError);
        }
        
        // Refund to wallet
        const refundAmount = item.totalPrice;
        if (refundAmount > 0) {
          try {
            const wallet = await Wallet.getOrCreateWallet(order.userId);
            await wallet.addMoney(
              refundAmount,
              `Refund for returned item (Order: ${order.orderId})`,
              order.orderId
            );
          } catch (walletError) {
            console.error('Error processing refund:', walletError);
          }
        }
      }

      // Add timeline entry
      const productName = item.product?.productName || 'Product';
      order.orderTimeline.push({
        status: `Item Status Updated`,
        timestamp: new Date(),
        description: `${productName} status changed from ${oldStatus} to ${status} by admin`
      });

      updatedCount++;
      updateResults.push({ itemIndex, success: true, oldStatus, newStatus: status });
    }

    if (updatedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items were updated. All items may be in final states or cancelled by customer.',
        results: updateResults
      });
    }

  // Auto-update overall order status based on all items
const itemStatuses = order.orderedItems.map(item => item.status);
const totalItems = order.orderedItems.length;

// Count items by status
const pendingCount = itemStatuses.filter(s => s === 'Pending').length;
const processingCount = itemStatuses.filter(s => s === 'Processing').length;
const shippedCount = itemStatuses.filter(s => s === 'Shipped').length;
const deliveredCount = itemStatuses.filter(s => s === 'Delivered').length;
const cancelledCount = itemStatuses.filter(s => s === 'Cancelled').length;
const returnedCount = itemStatuses.filter(s => s === 'Returned').length;
const returnRequestCount = itemStatuses.filter(s => s === 'Return Request').length;

// Count active items (not cancelled/returned)
const activeCount = itemStatuses.filter(s => 
  ['Pending', 'Processing', 'Shipped', 'Delivered'].includes(s)).length;

let newOrderStatus = order.status;
const oldOrderStatus = order.status;

// Priority 1: Handle full cancellation/return
if (cancelledCount === totalItems) {
  newOrderStatus = 'Cancelled';
} else if (returnedCount === totalItems) {
  newOrderStatus = 'Returned';
} else if (returnRequestCount === totalItems) {
  newOrderStatus = 'Return Request';
}
// Priority 2: Handle partial cancellation/return
else if (cancelledCount > 0 && cancelledCount < totalItems) {
  newOrderStatus = 'Partially Cancelled';
} else if (returnedCount > 0 && returnedCount < totalItems) {
  newOrderStatus = 'Partially Returned';
} else if (returnRequestCount > 0) {
  newOrderStatus = 'Return Request';
}
// Priority 3: Handle normal fulfillment progression
else if (activeCount === totalItems) {
  // All items are in active fulfillment 
  if (deliveredCount === totalItems) {
    newOrderStatus = 'Delivered';
  } else if (deliveredCount > 0 && deliveredCount < totalItems) {
    //  Partially delivered
    newOrderStatus = 'Partially Delivered';
  } else if (shippedCount === totalItems) {
    newOrderStatus = 'Shipped';
  } else if (processingCount === totalItems) {
    newOrderStatus = 'Processing';
  } else if (pendingCount === totalItems) {
    newOrderStatus = 'Pending';
  } else {
    if (deliveredCount > 0) {
      newOrderStatus = 'Partially Delivered'; // Some delivered, some not
    } else if (shippedCount > 0) {
      newOrderStatus = 'Shipped'; // Some shipped
    } else if (processingCount > 0) {
      newOrderStatus = 'Processing'; // Some processing
    } else {
      newOrderStatus = 'Pending';
    }
  }
}
    // Update order status if it changed
    if (newOrderStatus !== order.status) {
      order.status = newOrderStatus;
      order.orderTimeline.push({
        status: newOrderStatus,
        timestamp: new Date(),
        description: `Order status automatically updated to ${newOrderStatus} based on item statuses`
      });
    }

    await order.save();

    res.json({
      success: true,
      message: `Successfully updated ${updatedCount} item(s)`,
      updatedCount,
      results: updateResults,
      oldOrderStatus,
      newOrderStatus: order.status,
      orderStatusChanged: oldOrderStatus !== order.status
    });

  } catch (error) {
    console.error('Error updating items status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update items status'
    });
  }
};


module.exports = {
  getOrders,
  getOrderById,
  getOrderDetailsPage,
  updateOrderStatus,
  updateItemsStatusBulk,
  rejectReturnRequest,
  getReturnRequestCount,
  getReturnRequests
};