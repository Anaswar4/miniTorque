const mongoose = require('mongoose');  
const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');


const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'newest';

        //  Build aggregation pipeline
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
            // Filter products and categories
            {
                $match: {
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    //  Only products from active categories
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            }
        ];

        // Add category filter
        if (category) {
            pipeline[1].$match.category = new mongoose.Types.ObjectId(category);
        }

        // Add search filter
        if (search) {
            pipeline[1].$match.$or = [
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

        //  Add price calculations
        products.forEach(product => {
            // Convert categoryData array to single object
            if (product.categoryData && product.categoryData.length > 0) {
                product.category = product.categoryData[0];
            }
            delete product.categoryData;

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
                product.hasOffer = true;
                product.discountAmount = product.salePrice - product.finalPrice;
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
        const productId = req.params.id;

        //  Use aggregation to check category status
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
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            }
        ];

        const productResult = await Product.aggregate(productPipeline);
        
        if (!productResult || productResult.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        const product = productResult[0];
        
        // Convert categoryData array to single object
        if (product.categoryData && product.categoryData.length > 0) {
            product.category = product.categoryData[0];
        }
        delete product.categoryData;

        //  Add price calculations
        if (product.productOffer && product.productOffer > 0) {
            product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
            product.hasOffer = true;
            product.discountAmount = product.salePrice - product.finalPrice;
        } else {
            product.finalPrice = product.salePrice;
            product.hasOffer = false;
            product.discountAmount = 0;
        }

        res.json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
};


const getProductsByCategory = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const sortBy = req.query.sortBy || 'newest';

        //  Check if category exists and is active 
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

        // aggregation for products
        const pipeline = [
            {
                $match: {
                    category: new mongoose.Types.ObjectId(categoryId),
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

        //  price calculations
        products.forEach(product => {
            if (product.categoryData && product.categoryData.length > 0) {
                product.category = product.categoryData[0];
            }
            delete product.categoryData;

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
                product.hasOffer = true;
                product.discountAmount = product.salePrice - product.finalPrice;
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

        //  Use aggregation with category filtering
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

        // Add price calculations
        products.forEach(product => {
            if (product.categoryData && product.categoryData.length > 0) {
                product.category = product.categoryData[0];
            }
            delete product.categoryData;

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
                product.hasOffer = true;
                product.discountAmount = product.salePrice - product.finalPrice;
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

        //  Use aggregation with category filtering
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

        //  Add price calculations
        products.forEach(product => {
            if (product.categoryData && product.categoryData.length > 0) {
                product.category = product.categoryData[0];
            }
            delete product.categoryData;

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
                product.hasOffer = true;
                product.discountAmount = product.salePrice - product.finalPrice;
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
                pipeline[1].$match.category = { $in: req.query.category.map(id => new mongoose.Types.ObjectId(id)) };
            } else {
                pipeline[1].$match.category = new mongoose.Types.ObjectId(req.query.category);
            }
        }
        
        // Price range filter
        if (req.query.minPrice || req.query.maxPrice) {
            pipeline[1].$match.salePrice = {};
            if (req.query.minPrice) {
                pipeline[1].$match.salePrice.$gte = parseFloat(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                pipeline[1].$match.salePrice.$lte = parseFloat(req.query.maxPrice);
            }
        }
        
        // Search filter
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            pipeline[1].$match.$or = [
                { productName: searchRegex },
                { brand: searchRegex },
                { description: searchRegex }
            ];
        }
        
        // Availability filter
        if (req.query.availability) {
            if (req.query.availability === 'in-stock') {
                pipeline[1].$match.quantity = { $gt: 0 };
            } else if (req.query.availability === 'on-sale') {
                pipeline[1].$match.productOffer = { $gt: 0 };
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

        //  Add price calculations
        products.forEach(product => {
            if (product.categoryData && product.categoryData.length > 0) {
                product.category = product.categoryData[0];
            }
            delete product.categoryData;

            if (product.productOffer && product.productOffer > 0) {
                product.finalPrice = product.salePrice * (1 - product.productOffer / 100);
                product.hasOffer = true;
                product.discountAmount = product.salePrice - product.finalPrice;
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
        
        //  only active categories for filter dropdown
        const categories = await Category.find({ 
            isListed: true, 
            isDeleted: false 
        }).lean();
        
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
            filters: {
                category: req.query.category || '',
                minPrice: req.query.minPrice || '',
                maxPrice: req.query.maxPrice || '',
                search: req.query.search || '',
                availability: req.query.availability || '',
                sort: req.query.sort || 'newest'
            },
            user: req.user || null,
            currentPage: 'shop'
        });
        
    } catch (error) {
        console.error('Error loading shop page:', error);
        res.status(500).render('error', { 
            message: 'Error loading shop page',
            user: req.user || null 
        });
    }
};

const getProductDetails = async (req, res) => {
    try {
        const userId = req.session.user_id || null;
        const productId = req.params.id;

        //  Use aggregation to check category status
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
                user: userId ? { id: userId } : null
            });
        }

        const product = productResult[0];
        
        // Convert categoryData array to single object
        if (product.categoryData && product.categoryData.length > 0) {
            product.category = product.categoryData[0];
        }
        delete product.categoryData;

        // Get related products from same category (only active categories)
        const relatedProducts = await Product.aggregate([
            {
                $match: {
                    _id: { $ne: new mongoose.Types.ObjectId(productId) },
                    category: product.category._id,
                    isDeleted: false,
                    isBlocked: false,
                    isListed: true,
                    status: "Available"
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
                $match: {
                    "categoryData.isListed": true,
                    "categoryData.isDeleted": false
                }
            },
            { $sort: { createdAt: -1 } },
            { $limit: 4 }
        ]);

        // Add calculated fields for related products
        relatedProducts.forEach(relatedProduct => {
            // Convert categoryData array to single object
            if (relatedProduct.categoryData && relatedProduct.categoryData.length > 0) {
                relatedProduct.category = relatedProduct.categoryData[0];
            }
            delete relatedProduct.categoryData;
            
            if (relatedProduct.productOffer && relatedProduct.productOffer > 0) {
                relatedProduct.finalPrice = relatedProduct.salePrice * (1 - relatedProduct.productOffer / 100);
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
            finalPrice = product.salePrice * (1 - product.productOffer / 100);
            hasOffer = true;
            discountAmount = product.salePrice - finalPrice;
        }

        product.finalPrice = finalPrice;
        product.hasOffer = hasOffer;
        product.discountAmount = discountAmount;

        // Debug logging
        console.log('Product details loaded:', {
            productName: product.productName,
            brand: product.brand,
            salePrice: product.salePrice,
            finalPrice: finalPrice,
            productOffer: product.productOffer,
            hasOffer: hasOffer,
            quantity: product.quantity,
            status: product.status,
            relatedProductsCount: relatedProducts.length
        });

        res.render('user/product-details', {
            product,
            relatedProducts,
            user: userId ? { id: userId } : null,
            isAuthenticated: !!userId,
            currentPage: 'product-details'
        });

    } catch (error) {
        console.error('Error fetching product details:', error);
        res.status(500).render('pageNotFound', {
            message: 'Error loading product details',
            user: req.session.user_id ? { id: req.session.user_id } : null
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
