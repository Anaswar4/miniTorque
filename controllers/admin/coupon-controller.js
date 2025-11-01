// Admin coupon management controller
const Coupon = require('../../models/coupon-schema');
const Category = require('../../models/category-schema');
const Product = require('../../models/product-schema');
const { 
    validateAddCouponForm, 
    validateUpdateCouponForm, 
    checkCouponCodeExists 
} = require('../../validator/couponValidator');

const getCouponsPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;
        
        // Build query based on filters
        let query = { isDeleted: false };
        
        // Filter by status
        if (req.query.status && req.query.status !== 'all') {
            if (req.query.status === 'active') {
                query.isActive = true;
            } else if (req.query.status === 'inactive') {
                query.isActive = false;
            } else if (req.query.status === 'expired') {
                query.expiry = { $lt: new Date() };
            }
        }
        
        // Filter by type
        if (req.query.type && req.query.type !== 'all') {
            query.discountType = req.query.type;
        }
        
        // Search functionality
        if (req.query.search) {
            query.$or = [
                { code: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } }
            ];
        }
        
        const coupons = await Coupon.find(query)
            .populate('applicableCategories', 'name')
            .populate('applicableProducts', 'productName')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });
            
        const totalCoupons = await Coupon.countDocuments(query);
        const totalPages = Math.ceil(totalCoupons / limit);
        
        // Filters object for the template
        const filters = {
            search: req.query.search || '',
            status: req.query.status || 'all',
            type: req.query.type || 'all'
        };
        
        // Pagination object for the template
        const pagination = {
            currentPage: page,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null,
            start: totalCoupons > 0 ? skip + 1 : 0,
            end: Math.min(skip + limit, totalCoupons),
            totalCoupons,
            // Generate page numbers for pagination
            pages: (() => {
                const pages = [];
                const startPage = Math.max(1, page - 2);
                const endPage = Math.min(totalPages, page + 2);
                for (let i = startPage; i <= endPage; i++) {
                    pages.push(i);
                }
                return pages;
            })()
        };
        
        // Get categories and products for the template
        const categories = await Category.find({ isDeleted: false });
        const products = await Product.find({ isDeleted: false });
        
        res.render('admin/coupons', { 
            coupons, 
            filters,
            pagination,
            categories,
            products,
            currentPage: page,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
            //  Success and error message handling
            success: req.query.success || null,
            error: req.query.error || null
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).render('admin/coupons', {
            coupons: [],
            filters: { search: '', status: 'all', type: 'all' },
            pagination: {
                currentPage: 1,
                totalPages: 0,
                hasNext: false,
                hasPrev: false,
                start: 0,
                end: 0,
                totalCoupons: 0,
                pages: []
            },
            categories: [],
            products: [],
            currentPage: 1,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            //  Success and error message handling
            success: null,
            error: 'Error loading coupons. Please try again.'
        });
    }
};


const getAddCouponPage = async (req, res) => {
    try {
        //  redirect to main page
        res.redirect('/admin/coupons');
    } catch (error) {
        // error, redirect to main page
        console.error('Error in getAddCouponPage:', error);
        res.redirect('/admin/coupons?error=Unable to access add coupon form');
    }
};


const addCoupon = async (req, res) => {
    try {
        console.log("📝 FORM DATA:", JSON.stringify(req.body, null, 2));
        
        const validation = validateAddCouponForm(req.body);
        console.log(" VALIDATION:", validation);
        
        if (!validation.isValid) {
            console.log(" VALIDATION ERRORS:", validation.errors);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }

        console.log(" VALIDATED DATA:", validation.validatedData);

        const codeCheck = await checkCouponCodeExists(validation.validatedData.code, null, Coupon);
        console.log(" CODE CHECK:", codeCheck);
        
        if (codeCheck.exists) {
            //  Return JSON instead of redirect
            return res.status(400).json({
                success: false,
                message: codeCheck.error
            });
        }

        console.log(" CREATING COUPON...");
        const newCoupon = new Coupon(validation.validatedData);
        console.log(" COUPON OBJECT:", newCoupon);
        
        const savedCoupon = await newCoupon.save();
        console.log(" COUPON SAVED!");
        return res.status(201).json({
            success: true,
            message: 'Coupon added successfully',
            coupon: {
                id: savedCoupon._id,
                code: savedCoupon.code,
                description: savedCoupon.description,
                discountType: savedCoupon.discountType,
                discount: savedCoupon.discount
            }
        });
        
    } catch (error) {
        console.error(' ERROR:', error);
        return res.status(500).json({
            success: false,
            message: 'Error adding coupon. Please try again.',
            error: error.message
        });
    }
};




const getEditCouponPage = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId)
            .populate('applicableCategories')
            .populate('applicableProducts');
        
        if (!coupon) {
            return res.status(404).json({ 
                success: false,
                message: 'Coupon not found' 
            });
        }
        res.json({
            success: true,
            coupon: coupon
        });
        
    } catch (error) {
        console.error('Error fetching coupon for edit:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error loading coupon for editing' 
        });
    }
};


const updateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const validation = validateUpdateCouponForm(req.body, couponId);
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: validation.errors
            });
        }

        const codeCheck = await checkCouponCodeExists(validation.validatedData.code, couponId, Coupon);
        if (codeCheck.exists) {
            //  Return JSON instead of redirect
            return res.status(400).json({
                success: false,
                message: codeCheck.error
            });
        }

        const updatedCoupon = await Coupon.findByIdAndUpdate(couponId, validation.validatedData, { new: true });
        
        if (!updatedCoupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: {
                id: updatedCoupon._id,
                code: updatedCoupon.code,
                description: updatedCoupon.description,
                discountType: updatedCoupon.discountType,
                discount: updatedCoupon.discount,
                isActive: updatedCoupon.isActive
            }
        });
        
    } catch (error) {
        console.error('Error updating coupon:', error);
        
        if (error.name === 'ValidationError') {
            const errors = [];
            Object.keys(error.errors).forEach(key => {
                errors.push(error.errors[key].message);
            });
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: errors
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Error updating coupon. Please try again.',
            error: error.message
        });
    }
};



const toggleCouponStatus = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating coupon status'
        });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        const coupon = await Coupon.findById(couponId);
        
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        if (coupon.isDeleted) {
            return res.status(400).json({
                success: false,
                message: 'Coupon is already deleted'
            });
        }

        coupon.isDeleted = true;
        coupon.deletedAt = new Date();
        await coupon.save();

        res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting coupon'
        });
    }
};

module.exports = {
    getCouponsPage,
    getAddCouponPage,
    addCoupon,
    getEditCouponPage,
    updateCoupon,
    toggleCouponStatus,
    deleteCoupon
};
