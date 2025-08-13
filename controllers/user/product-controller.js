const Product = require('../../models/product-schema');
const Category = require('../../models/category-schema');

/**
 * Get all products for user
 */
const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const search = req.query.search || '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'newest';

        // Build filter
        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

        // Add search filter
        if (search) {
            filter.$or = [
                { productName: { $regex: search, $options: 'i' } },
                { brand: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Add category filter
        if (category) {
            filter.category = category;
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

        // Get products
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
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

/**
 * Get single product by ID
 */
const getProductById = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        }).populate('category', 'name');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
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

/**
 * Get products by category
 */
const getProductsByCategory = async (req, res) => {
    try {
        const categoryId = req.params.categoryId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const sortBy = req.query.sortBy || 'newest';

        // Check if category exists and is active
        const category = await Category.findOne({
            _id: categoryId,
            isListed: true,
            $or: [
                { isDeleted: false },
                { isDeleted: { $exists: false } }
            ]
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        const filter = {
            category: categoryId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

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

        // Get products
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort(sortOptions)
            .skip((page - 1) * limit)
            .limit(limit);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
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

/**
 * Get featured products (for homepage)
 */
const getFeaturedProducts = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;

        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true
        };

        // Get featured products
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort({ createdAt: -1 })
            .limit(limit);

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

/**
 * Search products
 */
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

        const filter = {
            isDeleted: false,
            isBlocked: false,
            isListed: true,
            $or: [
                { productName: { $regex: query, $options: 'i' } },
                { brand: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ]
        };

        // Get products
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
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

/* Get shop page with server-side filtering and pagination*/
const getShopPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        
        // Build filter object
        let filter = { 
            isListed: true, 
            isDeleted: false, 
            isBlocked: false,
            status: "Available"
        };
        
        // Category filter
        if (req.query.category && req.query.category !== 'all') {
            if (Array.isArray(req.query.category)) {
                filter.category = { $in: req.query.category };
            } else {
                filter.category = req.query.category;
            }
        }
        
        // Price range filter
        if (req.query.minPrice || req.query.maxPrice) {
            filter.salePrice = {};
            if (req.query.minPrice) {
                filter.salePrice.$gte = parseFloat(req.query.minPrice);
            }
            if (req.query.maxPrice) {
                filter.salePrice.$lte = parseFloat(req.query.maxPrice);
            }
        }
        
        // Search filter
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            filter.$or = [
                { productName: searchRegex },
                { brand: searchRegex },
                { description: searchRegex }
            ];
        }
        
        // Availability filter
        if (req.query.availability) {
            if (req.query.availability === 'in-stock') {
                filter.quantity = { $gt: 0 };
            } else if (req.query.availability === 'on-sale') {
                filter.productOffer = { $gt: 0 };
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
        
        // Get products with pagination
        const products = await Product.find(filter)
            .populate('category', 'name')
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Get total count for pagination
        const totalProducts = await Product.countDocuments(filter);
        const totalPages = Math.ceil(totalProducts / limit);
        
        // Get all categories for filter dropdown
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

        // Find product and populate category
        const product = await Product.findOne({
            _id: productId,
            isDeleted: false,
            isBlocked: false,
            isListed: true
        }).populate('category', 'name description');

        // Check if product exists and is available
        if (!product) {
            return res.status(404).render('pageNotFound', {
                message: 'Product not found',
                user: userId ? { id: userId } : null
            });
        }

        // Get related products from same category (excluding current product)
        const relatedProducts = await Product.find({
            _id: { $ne: product._id },
            category: product.category._id,
            isDeleted: false,
            isBlocked: false,
            isListed: true,
            status: "Available"
        })
        .populate('category', 'name')
        .sort({ createdAt: -1 })
        .limit(4)
        .lean();

        // Add calculated fields for related products
        relatedProducts.forEach(relatedProduct => {
            // Calculate final price (with productOffer if any)
            if (relatedProduct.productOffer && relatedProduct.productOffer > 0) {
                relatedProduct.finalPrice = relatedProduct.salePrice * (1 - relatedProduct.productOffer / 100);
                relatedProduct.hasOffer = true;
            } else {
                relatedProduct.finalPrice = relatedProduct.salePrice;
                relatedProduct.hasOffer = false;
            }

            // Check if product is new (created within last 30 days)
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

        // Add calculated fields to product
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

        // Render the product details page
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
