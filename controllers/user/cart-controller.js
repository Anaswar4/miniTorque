const Cart = require('../../models/cart-schema');
const Product = require('../../models/product-schema');
const Wishlist = require('../../models/wishlist-schema');
const User = require('../../models/user-model');
const { calculateBestOffer } = require('../../utils/offer-utils'); 



// Load cart page
const loadCart = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    
    //  user data for sidebar
    const user = await User.findById(userId).select('fullName email name displayName googleName profilePhoto').lean();
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted categoryOffer'
        }
      });

    // Filter out items with unavailable products
    let cartItems = [];
    let cartCount = 0; 
    
    if (cart && cart.items) {
      cartItems = cart.items.filter(item => 
        item.productId && 
        item.productId.category && 
        item.productId.category.isListed && 
        !item.productId.category.isDeleted &&
        item.productId.isListed &&
        !item.productId.isDeleted
      );

      //  Calculate cart count (total quantity of items)
      cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      //  Update prices with offer prices
      let priceUpdatesNeeded = false;
      
      // Use Promise.all for async operations
      await Promise.all(cartItems.map(async item => {
        const offerData = await calculateBestOffer(item.productId);
        const currentPrice = offerData.finalPrice;
        
        if (item.price !== currentPrice) {
          item.price = currentPrice;
          item.totalPrice = currentPrice * item.quantity;
          priceUpdatesNeeded = true;
        }
      }));

      // Save updated prices to database if needed
      if (priceUpdatesNeeded) {
        await cart.save();
      }
    }

    // Add wishlist count
    const wishlist = await Wishlist.findOne({ userId }).lean();
    const wishlistCount = wishlist ? wishlist.products.length : 0;

    res.render('user/cart', {
      user,
      cartItems: cartItems || [],
      cartCount,        
      wishlistCount,
      isAuthenticated: true,
      currentPage: 'cart',
      title: 'My Cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.status(500).render('error', { 
      message: 'Error loading cart',
      cartCount: 0,     
      wishlistCount: 0,
      user: res.locals.user || null  
    });
  }
};


// Add product to cart with validation
const addToCart = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { productId, quantity = 1 } = req.body;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity! Please select between 1 and 5 items per product.'
      });
    }

    // Get product with category
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Enhanced product availability validation
    if (!product.isListed || product.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product is no longer available for purchase',
        code: 'PRODUCT_UNAVAILABLE'
      });
    }

    // Enhanced category availability validation
    if (!product.category || !product.category.isListed || product.category.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product category is no longer available',
        code: 'CATEGORY_UNAVAILABLE'
      });
    }

    // Check stock availability
    if (product.quantity === 0) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently out of stock',
        code: 'OUT_OF_STOCK'
      });
    }

    if (product.quantity < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    //  Calculate offer price
    const offerData = await calculateBestOffer(product);
    const cartPrice = offerData.finalPrice;

    // Find or create user's cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: []
      });
    }

    // Check if product already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Update existing item
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = existingItem.quantity + parsedQuantity;

      if (newQuantity > product.quantity) {
        return res.status(403).json({
          success: false,
          message: `Cannot add more items. Only ${product.quantity} available in stock. You already have ${existingItem.quantity} in your cart.`,
          code: 'CART_STOCK_LIMIT'
        });
      }

      if (newQuantity > 5) {
        return res.status(403).json({
          success: false,
          message: `Maximum limit reached! You can only add up to 5 items per product. You currently have ${existingItem.quantity} in your cart.`,
          code: 'CART_QUANTITY_LIMIT'
        });
      }

      existingItem.quantity = newQuantity;
      existingItem.price = cartPrice; 
      existingItem.totalPrice = cartPrice * newQuantity; 
    } else {
      // Add new item
      cart.items.push({
        productId,
        quantity: parsedQuantity,
        price: cartPrice, 
        totalPrice: cartPrice * parsedQuantity 
      });
    }

    await cart.save();

    // Remove from wishlist if exists and get updated wishlist count
    let wishlistCount = 0;
    try {
      const wishlistResult = await Wishlist.updateOne(
        { userId },
        { $pull: { products: { productId } } }
      );
      // Get updated wishlist count
      const wishlist = await Wishlist.findOne({ userId });
      wishlistCount = wishlist ? wishlist.products.length : 0;
    } catch (wishlistError) {
      // Silently handle wishlist removal error
    }

    // Get updated cart count (number of unique products)
    const cartCount = cart.items.length;

    res.json({
      success: true,
      message: 'Product added to cart successfully',
      cartCount,
      wishlistCount
    });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart'
    });
  }
};


// Get cart count for navbar
const getCartCount = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    if (!userId) {
      return res.json({ count: 0 });
    }

    const cart = await Cart.findOne({ userId });
    // Count unique products instead of total quantity
    const count = cart ? cart.items.length : 0;
    res.json({ count });
  } catch (error) {
    console.error('Error getting cart count:', error);
    res.json({ count: 0 });
  }
};


// Update cart item quantity
const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { productId, quantity } = req.body;

    // Validate input
    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and quantity are required'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity! Please select between 1 and 5 items per product.'
      });
    }

    // Get product to check stock
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check product and category availability
    if (!product.isListed || product.isDeleted ||
        !product.category || !product.category.isListed || product.category.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'Product is no longer available'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the item in cart
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    const currentQuantity = cart.items[itemIndex].quantity;

    // Enhanced stock validation - only check when increasing quantity
    if (product.quantity === 0) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently out of stock',
        code: 'OUT_OF_STOCK',
        availableStock: 0
      });
    }

    // Only validate stock limits when increasing quantity
    if (parsedQuantity > currentQuantity && product.quantity < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${product.quantity} items available in stock. Cannot increase to ${parsedQuantity} items.`,
        code: 'INSUFFICIENT_STOCK',
        availableStock: product.quantity,
        requestedQuantity: parsedQuantity,
        currentQuantity: currentQuantity
      });
    }

    //  Calculate offer price
    const offerData = await calculateBestOffer(product);
    const cartPrice = offerData.finalPrice;

    // Update quantity and total price with offer price
    cart.items[itemIndex].quantity = parsedQuantity;
    cart.items[itemIndex].price = cartPrice; 
    cart.items[itemIndex].totalPrice = cartPrice * parsedQuantity; 

    await cart.save();

    // Get updated cart count (number of unique products)
    const cartCount = cart.items.length;

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cartCount,
      itemTotal: cart.items[itemIndex].totalPrice
    });
  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};


// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove the item from cart
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      item => item.productId.toString() !== productId
    );

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    await cart.save();

    // Get updated cart count (number of unique products)
    const cartCount = cart.items.length;

    res.json({
      success: true,
      message: 'Product removed from cart successfully',
      cartCount
    });
  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from cart'
    });
  }
};

// Clear entire cart
const clearCart = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;

    // Find and clear user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cartCount: 0
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};

// Remove all out-of-stock items from cart
const removeOutOfStockItems = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Filter out items that are out of stock or unavailable
    const initialItemCount = cart.items.length;
    const availableItems = cart.items.filter(item => {
      // Check if product exists and is available
      if (!item.productId ||
          !item.productId.category ||
          !item.productId.category.isListed ||
          item.productId.category.isDeleted ||
          !item.productId.isListed ||
          item.productId.isDeleted ||
          item.productId.quantity === 0) {
        return false; 
      }
      return true; 
    });

    const removedItemCount = initialItemCount - availableItems.length;

    if (removedItemCount === 0) {
      return res.json({
        success: true,
        message: 'No out-of-stock items found to remove',
        removedCount: 0,
        cartCount: cart.items.length
      });
    }

    // Update cart with only available items
    cart.items = availableItems;
    await cart.save();

    // Get updated cart count (number of unique products)
    const cartCount = cart.items.length;

    res.json({
      success: true,
      message: `Successfully removed ${removedItemCount} out-of-stock item${removedItemCount > 1 ? 's' : ''} from cart`,
      removedCount: removedItemCount,
      cartCount
    });
  } catch (error) {
    console.error('Error removing out-of-stock items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove out-of-stock items'
    });
  }
};

// Validate cart items and return availability status
const validateCartItems = async (req, res) => {
  try {
    const userId = req.session.userId || req.session.googleUserId;

    // Find user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    if (!cart) {
      return res.json({
        success: true,
        availableItems: [],
        outOfStockItems: [],
        totalItems: 0
      });
    }

    const availableItems = [];
    const outOfStockItems = [];

    cart.items.forEach(item => {
      const itemData = {
        productId: item.productId._id,
        productName: item.productId.productName,
        quantity: item.quantity,
        stock: item.productId.quantity,
        price: item.price,
        totalPrice: item.totalPrice
      };

      // Check availability
      if (!item.productId ||
          !item.productId.category ||
          !item.productId.category.isListed ||
          item.productId.category.isDeleted ||
          !item.productId.isListed ||
          item.productId.isDeleted ||
          item.productId.quantity === 0) {
        outOfStockItems.push({
          ...itemData,
          reason: item.productId.quantity === 0 ? 'Out of stock' : 'Product unavailable'
        });
      } else {
        availableItems.push(itemData);
      }
    });

    res.json({
      success: true,
      availableItems,
      outOfStockItems,
      totalItems: cart.items.length,
      availableCount: availableItems.length,
      outOfStockCount: outOfStockItems.length
    });
  } catch (error) {
    console.error('Error validating cart items:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate cart items'
    });
  }
};

module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartCount,
  removeOutOfStockItems,
  validateCartItems
};
