const mongoose = require('mongoose');
const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const User = require('../../models/user-model');

const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'newest';

        // Build aggregation pipeline
        let pipeline = [
            // Join with categories
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            // Filter products and categories
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    // Only products from active categories
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            }
        ];

        // Add category filter
        if (category) {
            pipeline[2].$match.category = new mongoose.Types.ObjectId(category); // ✅ FIX: Add new
        }

        // Add search filter
        if (search) {
            pipeline[2].$match.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Build sort options
        let sortOptions = { createdAt: -1 }; // Default: newest first
        switch (sortBy) {
            case 'price-low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price-high':
                sortOptions = { salePrice: -1 };
                break;
            case 'name-asc':
                sortOptions = { productName: 1 };
                break;
            case 'name-desc':
                sortOptions = { productName: -1 };
                break;
            case 'newest':
            default:
                sortOptions = { createdAt: -1 };
                break;
        }

        pipeline.push({ $sort: sortOptions });
        pipeline.push({ $skip: (page - 1) * limit });
        pipeline.push({ $limit: limit });

        // Execute aggregation
        const products = await Product.aggregate(pipeline);

        // ✅ FIX: Add price calculations (categoryData is already an object after $unwind)
        products.forEach(product => {
            if (product.categoryData) {
                product.category = product.categoryData;
                delete product.categoryData;
            }

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
                product.hasOffer = true;
                product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
            } else {
                product.finalPrice = product.salePrice;
                product.hasOffer = false;
                product.discountAmount = 0;
            }
        });

        // Get total count for pagination
        const countPipeline = [
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            { $count: "total" }
        ];

        const countResult = await Product.aggregate(countPipeline);
        const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

const getProductById = async (req, res) => {
    try {
        // ✅ FIX: Use 'new' with ObjectId constructor
        const productId = new mongoose.Types.ObjectId(req.params.id);

        // Use aggregation to check product and category status
        const productPipeline = [
            {
                $match: {
                    _id: productId,
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData"
            },
            {
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            {
                $limit: 1
            }
        ];

        const productResult = await Product.aggregate(productPipeline);

        if (!productResult || productResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or not available'
            });
        }

        let product = productResult[0];

        // ✅ FIX: After $unwind, categoryData is an object, not array
        if (product.categoryData) {
            product.category = product.categoryData;
            delete product.categoryData;
        }

        // ✅ IMPROVED: Add price calculations with proper rounding
        if (product.productOffer && product.productOffer > 0) {
            product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
            product.hasOffer = true;
            product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
        } else {
            product.finalPrice = product.salePrice;
            product.hasOffer = false;
            product.discountAmount = 0;
        }

        // ✅ ADD: Additional useful fields
        product.isInStock = product.quantity > 0;
        product.stockStatus = product.quantity > 10 ? 'in-stock' : 
                             product.quantity > 0 ? 'low-stock' : 'out-of-stock';

        return res.json({
            success: true,
            product
        });

    } catch (error) {
        console.error('Error fetching product:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID format'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};

const getProductsByCategory = async (req, res) => {
    try {
        const categoryId = new mongoose.Types.ObjectId(req.params.categoryId); // ✅ FIX: Add new
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const sortBy = req.query.sortBy || 'newest';

        // Check if category exists and is active 
        const category = await Category.findOne({
            _id: categoryId,
            isListed: true,
            isDeleted: false
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found or not available'
            });
        }

        // Build sort options
        let sortOptions = { createdAt: -1 };
        switch (sortBy) {
            case 'price-low':
                sortOptions = { salePrice: 1 };
                break;
            case 'price-high':
                sortOptions = { salePrice: -1 };
                break;
            case 'name-asc':
                sortOptions = { productName: 1 };
                break;
            case 'name-desc':
                sortOptions = { productName: -1 };
                break;
            case 'newest':
            default:
                sortOptions = { createdAt: -1 };
                break;
        }

        // Aggregation for products
        const pipeline = [
            {
                $match: {
                    category: categoryId,
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            { $sort: sortOptions },
            { $skip: (page - 1) * limit },
            { $limit: limit }
        ];

        const products = await Product.aggregate(pipeline);

        // ✅ FIX: Price calculations (categoryData is object after $unwind)
        products.forEach(product => {
            if (product.categoryData) {
                product.category = product.categoryData;
                delete product.categoryData;
            }

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
                product.hasOffer = true;
                product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
            } else {
                product.finalPrice = product.salePrice;
                product.hasOffer = false;
                product.discountAmount = 0;
            }
        });

        // Get total count for pagination
        const totalProducts = await Product.countDocuments({
            category: categoryId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        });
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            category: {
                _id: category._id,
                name: category.name
            },
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error fetching products by category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
};

const getFeaturedProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;

        // Use aggregation with category filtering
        const pipeline = [
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: limit }
        ];

        const products = await Product.aggregate(pipeline);

        // ✅ FIX: Add price calculations (categoryData is object after $unwind)
        products.forEach(product => {
            if (product.categoryData) {
                product.category = product.categoryData;
                delete product.categoryData;
            }

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
                product.hasOffer = true;
                product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
            } else {
                product.finalPrice = product.salePrice;
                product.hasOffer = false;
                product.discountAmount = 0;
            }
        });

        res.json({
            success: true,
            products
        });
    } catch (error) {
        console.error('Error fetching featured products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch featured products'
        });
    }
};

const searchProducts = async (req, res) => {
    try {
        const query = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;

        if (!query.trim()) {
            return res.json({
                success: true,
                products: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalProducts: 0,
                    hasNextPage: false,
                    hasPrevPage: false
                }
            });
        }

        // Use aggregation with category filtering
        const pipeline = [
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false,
                    $or: [
                        { productName: { $regex: query, $options: 'i' } },
                        { brand: { $regex: query, $options: 'i' } },
                        { description: { $regex: query, $options: 'i' } }
                    ]
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit }
        ];

        const products = await Product.aggregate(pipeline);

        // ✅ FIX: Add price calculations (categoryData is object after $unwind)
        products.forEach(product => {
            if (product.categoryData) {
                product.category = product.categoryData;
                delete product.categoryData;
            }

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
                product.hasOffer = true;
                product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
            } else {
                product.finalPrice = product.salePrice;
                product.hasOffer = false;
                product.discountAmount = 0;
            }
        });

        // Get total count for pagination
        const countPipeline = [
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false,
                    $or: [
                        { productName: { $regex: query, $options: 'i' } },
                        { brand: { $regex: query, $options: 'i' } },
                        { description: { $regex: query, $options: 'i' } }
                    ]
                }
            },
            { $count: "total" }
        ];

        const countResult = await Product.aggregate(countPipeline);
        const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(totalProducts / limit);

        res.json({
            success: true,
            query: query,
            products,
            pagination: {
                currentPage: page,
                totalPages,
                totalProducts,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error('Error searching products:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search products'
        });
    }
};

const getShopPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        let pipeline = [
            // Join with categories
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
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
            }
        ];

        // Category filter
        if (req.query.category && req.query.category !== 'all') {
            if (Array.isArray(req.query.category)) {
                pipeline[2].$match.category = { $in: req.query.category.map(id => new mongoose.Types.ObjectId(id)) }; // ✅ FIX: Add new
            } else {
                pipeline[2].$match.category = new mongoose.Types.ObjectId(req.query.category); // ✅ FIX: Add new
            }
        }

        // Price range filter
        if (req.query.minPrice || req.query.maxPrice) {
            pipeline[2].$match.salePrice = {};
            if (req.query.minPrice) {
                pipeline.$match.salePrice.$gte = parseFloat(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                pipeline[2].$match.salePrice.$lte = parseFloat(req.query.maxPrice);
            }
        }

        // Search filter
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            pipeline[2].$match.$or = [
                { productName: searchRegex },
                { brand: searchRegex },
                { description: searchRegex }
            ];
        }

        // Availability filter
        if (req.query.availability) {
            if (req.query.availability === 'in-stock') {
                pipeline[2].$match.quantity = { $gt: 0 };
            } else if (req.query.availability === 'on-sale') {
                pipeline[2].$match.productOffer = { $gt: 0 };
            }
        }

        // Build sort object
        let sort = {};
        switch (req.query.sort) {
            case 'price-low':
                sort.salePrice = 1;
                break;
            case 'price-high':
                sort.salePrice = -1;
                break;
            case 'name-az':
                sort.productName = 1;
                break;
            case 'name-za':
                sort.productName = -1;
                break;
            case 'oldest':
                sort.createdAt = 1;
                break;
            case 'newest':
            default:
                sort.createdAt = -1;
                break;
        }

        pipeline.push({ $sort: sort });
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const products = await Product.aggregate(pipeline);

        // ✅ FIX: Add price calculations (categoryData is object after $unwind)
        products.forEach(product => {
            if (product.categoryData) {
                product.category = product.categoryData;
                delete product.categoryData;
            }

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
                product.hasOffer = true;
                product.discountAmount = parseFloat((product.salePrice - product.finalPrice).toFixed(2));
            } else {
                product.finalPrice = product.salePrice;
                product.hasOffer = false;
                product.discountAmount = 0;
            }
        });

        // Get total count for pagination
        const countPipeline = [
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
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
            { $count: "total" }
        ];

        const countResult = await Product.aggregate(countPipeline);
        const totalProducts = countResult.length > 0 ? countResult[0].total : 0;
        const totalPages = Math.ceil(totalProducts / limit);

        // Get only active categories for filter dropdown
        const categories = await Category.find({
            isListed: true,
            isDeleted: false
        }).lean();

        // ✅ FIX: Get user's wishlist data and count
        let userWishlistIds = [];
        let wishlistCount = 0;
        if (req.session.userId) { // ✅ FIX: Use session.userId consistently
            const Wishlist = require('../../models/wishlist-schema');
            const wishlist = await Wishlist.findOne({ userId: req.session.userId }).lean();
            if (wishlist && wishlist.products) {
                userWishlistIds = wishlist.products.map(item => item.productId.toString());
                wishlistCount = wishlist.products.length;
            }
        }

        // Create pagination object
        const pagination = {
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalProducts,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page + 1,
            prevPage: page - 1,
            pages: []
        };

        // Generate page numbers for pagination
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(totalPages, page + 2);
        for (let i = startPage; i <= endPage; i++) {
            pagination.pages.push(i);
        }

        // Build query string for pagination links
        const queryParams = { ...req.query };
        delete queryParams.page;
        const queryString = Object.keys(queryParams).length > 0
            ? '&' + new URLSearchParams(queryParams).toString()
            : '';

        res.render('user/shop', {
            products,
            categories,
            pagination,
            totalProducts,
            queryString,
            userWishlistIds,
            wishlistCount,
            filters: {
                category: req.query.category || '',
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || '',
                search: req.query.search || '',
                availability: req.query.availability || '',
                sort: req.query.sort || 'newest'
            },
            user: req.session.user || null, // ✅ FIX: Use session.user consistently
            isAuthenticated: !!req.session.userId,
            currentPage: 'shop'
        });

    } catch (error) {
        console.error('Error loading shop page:', error);
        res.status(500).render('error', {
            error: {
                status: 500,
                message: 'Error loading shop page: ' + error.message
            },
            message: error.message,
            user: req.session.user || null
        });
    }
};

// ✅ COMPLETELY FIXED: Product Details function
const getProductDetails = async (req, res) => {
    try {
        // ✅ FIX: Define user and userId consistently
        const user = req.session.user || null;
        const userId = req.session.userId || null;
        const productId = req.params.id;

        // Fetch COMPLETE user profile data if needed
        let userProfile = null;
        if (userId) {
            userProfile = await User.findById(userId).select('fullName email name displayName googleName profilePhoto').lean();
        }

        // ✅ FIX: Use aggregation with proper ObjectId handling
        const productPipeline = [
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(productId), // ✅ FIX: Add new
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "category",
                    foreignField: "_id",
                    as: "categoryData"
                }
            },
            {
                $unwind: "$categoryData" // ✅ ADD: Unwind for proper filtering
            },
            {
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            }
        ];

        const productResult = await Product.aggregate(productPipeline);

        if (!productResult || productResult.length === 0) {
            return res.status(404).render('pageNotFound', {
                message: 'Product not found or not available',
                user: userProfile || user,
                wishlistCount: 0
            });
        }

        const product = productResult[0];

        // ✅ FIX: Convert categoryData object (after $unwind)
        if (product.categoryData) {
            product.category = product.categoryData;
            delete product.categoryData;
        }

        // ✅ FIX: Related products query with proper ObjectId
        const relatedProducts = await Product.aggregate([
            {
                $match: {
                    _id: { $ne: new mongoose.Types.ObjectId(productId) }, // ✅ FIX: Add new
                    isListed: true,
                    isDeleted: false,
                    isBlocked: false,
                    status: "Available",
                    category: product.category._id
                }
            },
            { $sample: { size: 4 } }
        ]);

        // Add calculated fields for related products
        relatedProducts.forEach(relatedProduct => {
            if (relatedProduct.productOffer && relatedProduct.productOffer > 0) {
                relatedProduct.finalPrice = parseFloat((relatedProduct.salePrice * (1 - relatedProduct.productOffer / 100)).toFixed(2));
                relatedProduct.hasOffer = true;
            } else {
                relatedProduct.finalPrice = relatedProduct.salePrice;
                relatedProduct.hasOffer = false;
            }

            const now = new Date();
            const createdAt = new Date(relatedProduct.createdAt);
            const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24);
            relatedProduct.isNew = diffDays <= 30;
        });

        // Add calculated fields for main product
        let finalPrice = product.salePrice;
        let hasOffer = false;
        let discountAmount = 0;

        if (product.productOffer && product.productOffer > 0) {
            finalPrice = parseFloat((product.salePrice * (1 - product.productOffer / 100)).toFixed(2));
            hasOffer = true;
            discountAmount = parseFloat((product.salePrice - finalPrice).toFixed(2));
        }

        product.finalPrice = finalPrice;
        product.hasOffer = hasOffer;
        product.discountAmount = discountAmount;

        // Get user's cart and wishlist data and counts
        let userWishlistIds = [];
        let wishlistCount = 0;
        let cartCount = 0;
        let isInCart = false;
        let isWishlisted = false;

        if (userId) {
            // GET CART COUNT
            const Cart = require('../../models/cart-schema');
            const cart = await Cart.findOne({ userId: userId }).lean();
            if (cart && cart.items) {
                cartCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
                // CHECK if current product is in cart
                isInCart = cart.items.some(item => item.productId.toString() === productId);
            }

            // GET WISHLIST COUNT
            const Wishlist = require('../../models/wishlist-schema');
            const wishlist = await Wishlist.findOne({ userId: userId }).lean();
            if (wishlist && wishlist.products) {
                userWishlistIds = wishlist.products.map(item => item.productId.toString());
                wishlistCount = wishlist.products.length;
                // CHECK if current product is in wishlist
                isWishlisted = wishlist.products.some(item => item.productId.toString() === productId);
            }
        }

        // Render with all data
        res.render('user/product-details', {
            product,
            relatedProducts,
            userWishlistIds,
            wishlistCount,
            cartCount,
            isInCart,
            isWishlisted,
            user: userProfile || user, // Use detailed user profile if available
            isAuthenticated: !!userId,
            currentPage: 'product-details'
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        
        // Better error handling
        if (error.name === 'CastError') {
            return res.status(404).render('pageNotFound', {
                message: 'Invalid product ID format',
                user: req.session.user || null,
                wishlistCount: 0
            });
        }

        res.status(500).render('error', {
            error: {
                status: 500,
                message: 'Error loading product details: ' + error.message
            },
            message: error.message,
            user: req.session.user || null,
            wishlistCount: 0
        });
    }
};

module.exports = {
    getProducts,
    getProductById,
    getProductsByCategory,
    getFeaturedProducts,
    searchProducts,
    getShopPage,
    getProductDetails
};
