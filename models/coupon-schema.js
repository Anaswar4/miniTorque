const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    },
    description: {
        type: String,
        required: true,
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat'],
        required: true,
    },
    discount: {
        type: Number,
        required: true,
    },
    minPurchase: {
        type: Number,
        required: false,
        default: null,
    },
    maxDiscount: {
        type: Number,
        required: false,
        default: null,
    },
    startDate: {
        type: Date,
        required: true,
    },
    expiry: {
        type: Date,
        required: true,
    },
    usageLimit: {
        type: Number,
        default: null,
        required: false,
    },
    userUsageLimit: {
        type: Number,
        required: true,
    },
    usedCount: {
        type: Number,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
    }],
    applicableProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
    }],
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);