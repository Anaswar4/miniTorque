const mongoose = require('mongoose');
const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');
const User = require('../../models/user-model');
const Wishlist = require('../../models/wishlist-schema');
const Cart= require('../../models/cart-schema')




const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'newest';

        let pipeline = [
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
            // Filter products and categories
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            }
        ];

        // Add category filter
        if (category) {
            pipeline[2].$match.category = new mongoose.Types.ObjectId(category); 
        }

        // Add search filter
        if (search) {
            pipeline[2].$match.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // ADD CALCULATED FINAL PRICE FIELD
        pipeline.push({
            $addFields: {
                finalSellingPrice: {
                    $cond: {
                        if: { $and: [{ $gt: ["$productOffer", 0] }, { $ne: ["$productOffer", null] }] },
                        then: {
                            $multiply: [
                                "$salePrice",
                                { $subtract: [1, { $divide: ["$productOffer", 100] }] }
                            ]
                        },
                        else: "$salePrice"
                    }
                }
            }
        });

        // Build sort options - UPDATED to use calculated final price for price sorting
        let sortOptions = { createdAt: -1 }; 
        switch (sortBy) {
            case 'price-low':
                sortOptions = { finalSellingPrice: 1 };
                break;
            case 'price-high':
                sortOptions = { finalSellingPrice: -1 };
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

        //  Add price calculations 
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

            // Remove the temporary field
            delete product.finalSellingPrice;
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
                $unwind: "$categoryData" 
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

        //  Additional useful fields
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
        const categoryId = new mongoose.Types.ObjectId(req.params.categoryId); 
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
                $unwind: "$categoryData" 
            },
            {
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            // ADD CALCULATED FINAL PRICE FIELD
            {
                $addFields: {
                    finalSellingPrice: {
                        $cond: {
                            if: { $and: [{ $gt: ["$productOffer", 0] }, { $ne: ["$productOffer", null] }] },
                            then: {
                                $multiply: [
                                    "$salePrice",
                                    { $subtract: [1, { $divide: ["$productOffer", 100] }] }
                                ]
                            },
                            else: "$salePrice"
                        }
                    }
                }
            }
        ];

        // Build sort options - UPDATED
        let sortOptions = { createdAt: -1 };
        switch (sortBy) {
            case 'price-low':
                sortOptions = { finalSellingPrice: 1 };
                break;
            case 'price-high':
                sortOptions = { finalSellingPrice: -1 };
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

        const products = await Product.aggregate(pipeline);

        //  Price calculations 
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

            // Remove the temporary field
            delete product.finalSellingPrice;
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
                $unwind: "$categoryData" 
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

        //  Add price calculations 
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
                $unwind: "$categoryData" 
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

        // Add price calculations 
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
                $unwind: "$categoryData" 
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

        // Build the base match conditions
        let baseMatch = {
            isListed: true,
            isDeleted: false,
            isBlocked: false,
            status: "Available",
            "categoryData.isListed": true,
            "categoryData.isDeleted": false
        };

        // Apply filters to base match
        // Category filter
        if (req.query.category && req.query.category !== 'all') {
            if (Array.isArray(req.query.category)) {
                baseMatch.category = { $in: req.query.category.map(id => new mongoose.Types.ObjectId(id)) };
            } else {
                baseMatch.category = new mongoose.Types.ObjectId(req.query.category);
            }
        }

        // Price range filter
        if (req.query.minPrice || req.query.maxPrice) {
            baseMatch.salePrice = {};
            if (req.query.minPrice) {
                baseMatch.salePrice.$gte = parseFloat(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                baseMatch.salePrice.$lte = parseFloat(req.query.maxPrice);
            }
        }

    // Search filter
        if(req.query.search){
            const searchQuery = req.query.search;
            baseMatch.$or = [
                {productName:{$regex:searchQuery,$options:'i'}},
                 { brand: { $regex: `^${searchQuery}`, $options: 'i' } },
                 { description: { $regex: `^${searchQuery}`, $options: 'i' } }
            ]
        }

        // Availability filter
        if (req.query.availability) {
            if (req.query.availability === 'in-stock') {
                baseMatch.quantity = { $gt: 0 };
            } else if (req.query.availability === 'on-sale') {
                baseMatch.productOffer = { $gt: 0 };
            }
        }

        // Products pipeline
        let pipeline = [
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
                $match: baseMatch
            },
            // ADD CALCULATED FINAL PRICE FIELD
            {
                $addFields: {
                    finalSellingPrice: {
                        $cond: {
                            if: { $and: [{ $gt: ["$productOffer", 0] }, { $ne: ["$productOffer", null] }] },
                            then: {
                                $multiply: [
                                    "$salePrice",
                                    { $subtract: [1, { $divide: ["$productOffer", 100] }] }
                                ]
                            },
                            else: "$salePrice"
                        }
                    }
                }
            }
        ];

        // Build sort object - UPDATED
        let sort = {};
        switch (req.query.sort) {
            case 'price-low':
                sort.finalSellingPrice = 1;
                break;
            case 'price-high':
                sort.finalSellingPrice = -1;
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

        // Add price calculations
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

            // Remove the temporary field
            delete product.finalSellingPrice;
        });

        //  Get total count with SAME filters as main pipeline
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
                $unwind: "$categoryData"
            },
            {
                $match: baseMatch  
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

        // Get user's wishlist and cart data
        let userWishlistIds = [];
        let wishlistCount = 0;
        let cartCount = 0;
        const userId = req.session.userId || req.session.googleUserId;
        if (userId) {
            // Get wishlist data
            const wishlist = await Wishlist.findOne({ userId: userId }).lean();
            if (wishlist && wishlist.products) {
                userWishlistIds = wishlist.products.map(item => item.productId.toString());
                wishlistCount = wishlist.products.length;
            }

            // Get cart count
            const cart = await Cart.findOne({ userId: userId }).lean();
            if (cart && cart.items) {
                cartCount = cart.items.length;
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
            pages: [],
            showPagination: totalPages > 1  
        };

        // Generate page numbers for pagination only if needed
        if (totalPages > 1) {
            const startPage = Math.max(1, page - 2);
            const endPage = Math.min(totalPages, page + 2);
            for (let i = startPage; i <= endPage; i++) {
                pagination.pages.push(i);
            }
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
            cartCount,
            filters: {
                category: req.query.category || '',
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || '',
                search: req.query.search || '',
                availability: req.query.availability || '',
                sort: req.query.sort || 'newest'
            },
            user: res.locals.user || null,
            isAuthenticated: !!(req.session.userId || req.session.googleUserId),
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
            user: res.locals.user || null
        });
    }
};

//  Product Details function
const getProductDetails = async (req, res) => {
    try {
        //  Define user and userId consistently for both auth methods
        const user = req.session.user || null;
        const userId = req.session.userId || req.session.googleUserId;
        const productId = req.params.id;

        // Fetch COMPLETE user profile data if needed
        let userProfile = null;
        if (userId) {
            userProfile = await User.findById(userId).select('fullName email name displayName googleName profilePhoto').lean();
        }

        //  Use aggregation with proper ObjectId handling
        const productPipeline = [
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(productId), 
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

        //  Convert categoryData object 
        if (product.categoryData) {
            product.category = product.categoryData;
            delete product.categoryData;
        }

        //  Related products query with proper ObjectId
        const relatedProducts = await Product.aggregate([
            {
                $match: {
                    _id: { $ne: new mongoose.Types.ObjectId(productId) }, 
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
            const cart = await Cart.findOne({ userId: userId }).lean();
            if (cart && cart.items) {
                cartCount = cart.items.length;
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

        
        res.render('user/product-details', {
            product,
            relatedProducts,
            userWishlistIds,
            wishlistCount,
            cartCount,
            isInCart,
            isWishlisted,
            user: userProfile || user, 
            isAuthenticated: !!userId,
            currentPage: 'product-details'
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        
        // Better error handling
        if (error.name === 'CastError') {
            return res.status(404).render('pageNotFound', {
                message: 'Invalid product ID format',
                user: res.locals.user || null,  
                wishlistCount: 0
            });
        }

        res.status(500).render('error', {
            error: {
                status: 500,
                message: 'Error loading product details: ' + error.message
            },
            message: error.message,
            user: res.locals.user || null,  
            wishlistCount: 0
        });
    }
};

// Get wishlist IDs for authenticated user
const getUserWishlistIds = async (req, res) => {
    try {
        const userId = req.session.userId || req.session.googleUserId;
        
        if (!userId) {
            return res.json({
                success: true,
                wishlistIds: [],
                wishlistCount: 0
            });
        }

        const wishlist = await Wishlist.findOne({ userId }).lean();
        
        if (!wishlist || !wishlist.products) {
            return res.json({
                success: true,
                wishlistIds: [],
                wishlistCount: 0
            });
        }

        const wishlistIds = wishlist.products.map(item => item.productId.toString());
        
        res.json({
            success: true,
            wishlistIds,
            wishlistCount: wishlist.products.length
        });

    } catch (error) {
        console.error('Error fetching user wishlist:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist'
        });
    }
};

// Add to cart API endpoint
const addToCart = async (req, res) => {
    try {
        const userId = req.session.userId || req.session.googleUserId;
        const { productId, quantity = 1 } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to add items to cart'
            });
        }

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        // Validate product exists and is available
        const product = await Product.findOne({
            _id: new mongoose.Types.ObjectId(productId),
            isListed: true,
            isDeleted: false,
            isBlocked: false,
            quantity: { $gt: 0 }
        }).populate('category');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found or out of stock'
            });
        }

        // Check if category is active
        if (!product.category || !product.category.isListed || product.category.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Product category is not available'
            });
        }

        // Find or create cart
        let cart = await Cart.findOne({ userId });
        
        if (!cart) {
            cart = new Cart({
                userId,
                items: []
            });
        }

        // Check if product already in cart
        const existingItemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId
        );

        if (existingItemIndex > -1) {
            // Update quantity if product already in cart
            const newQuantity = cart.items[existingItemIndex].quantity + parseInt(quantity);
            
            if (newQuantity > product.quantity) {
                return res.status(400).json({
                    success: false,
                    message: 'Stock limit reached'
                });
            }

            cart.items[existingItemIndex].quantity = newQuantity;
            cart.items[existingItemIndex].price = product.salePrice;
            // FIXED: Add totalPrice calculation
            cart.items[existingItemIndex].totalPrice = product.salePrice * newQuantity;
        } else {
            // Add new item to cart
            cart.items.push({
                productId: new mongoose.Types.ObjectId(productId),
                quantity: parseInt(quantity),
                price: product.salePrice,
                // FIXED: Add totalPrice calculation
                totalPrice: product.salePrice * parseInt(quantity)
            });
        }

        await cart.save();

        // Calculate cart count
        const cartCount = cart.items.length;

        res.json({
            success: true,
            message: 'Product added to cart successfully',
            cartCount
        });

    } catch (error) {
        console.error('Error adding to cart:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to add product to cart'
        });
    }
};


// Toggle wishlist API endpoint
const toggleWishlist = async (req, res) => {
    try {
        const userId = req.session.userId || req.session.googleUserId;
        const { productId } = req.body;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Please login to manage your wishlist'
            });
        }

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID is required'
            });
        }

        // Validate product exists
        const product = await Product.findOne({
            _id: new mongoose.Types.ObjectId(productId),
            isListed: true,
            isDeleted: false,
            isBlocked: false
        });

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Find or create wishlist
        let wishlist = await Wishlist.findOne({ userId });
        
        if (!wishlist) {
            wishlist = new Wishlist({
                userId,
                products: []
            });
        }

        // Check if product is already in wishlist
        const existingIndex = wishlist.products.findIndex(
            item => item.productId.toString() === productId
        );

        let action, message;

        if (existingIndex > -1) {
            // Remove from wishlist
            wishlist.products.splice(existingIndex, 1);
            action = 'removed';
            message = 'Removed from wishlist';
        } else {
            // Add to wishlist
            wishlist.products.push({
                productId: new mongoose.Types.ObjectId(productId),
                addedAt: new Date()
            });
            action = 'added';
            message = 'Added to wishlist';
        }

        await wishlist.save();

        res.json({
            success: true,
            message,
            action,
            wishlistCount: wishlist.products.length
        });

    } catch (error) {
        console.error('Error toggling wishlist:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update wishlist'
        });
    }
};

// Get cart count for navbar
const getCartCount = async (req, res) => {
    try {
        const userId = req.session.userId || req.session.googleUserId;
        
        if (!userId) {
            return res.json({
                success: true,
                cartCount: 0
            });
        }

        const cart = await Cart.findOne({ userId }).lean();
        const cartCount = cart && cart.items ? cart.items.length : 0;  


        res.json({
            success: true,
            cartCount
        });

    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch cart count'
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
    getProductDetails,
    getUserWishlistIds,
    addToCart,
    toggleWishlist,
    getCartCount
};
