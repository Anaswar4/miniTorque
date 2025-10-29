const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema({
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true  // Add index here
  },
  referred: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true  // Add index here
  },
  status: {
    type: String,
    enum: ["pending", "completed", "rewarded", "cancelled", "expired"],
    default: "pending",
    index: true  // Add index for filtering
  },
  rewardAmount: {
    type: Number,
    default: 50,  // Default reward in rupees
    min: 0
  },
  rewardGiven: {
    type: Boolean,
    default: false,
  },
  completedAt: {
    type: Date,
    default: null
  },
  rewaredAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true  // Auto-creates createdAt & updatedAt
});

// Compound index for efficient queries
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referred: 1, status: 1 });

module.exports = mongoose.model("Referral", referralSchema);
