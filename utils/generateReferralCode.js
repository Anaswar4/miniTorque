const User = require("../models/user-model"); 

/**
 * Generate a random referral code
 * @param {number} length - Length of the referral code (default: 8)
 * @returns {string} - Generated referral code
 */
const generateReferralCode = (length = 8) => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
};

/**
 * Generate a UNIQUE referral code (checks database)
 * @param {number} length - Length of the referral code (default: 8)
 * @returns {Promise<string>} - Unique referral code
 */
const generateUniqueReferralCode = async (length = 8) => {
  let code = generateReferralCode(length);
  let exists = await User.findOne({ referralCode: code });
  
  // Keep generating until we find a unique code
  while (exists) {
    code = generateReferralCode(length);
    exists = await User.findOne({ referralCode: code });
  }
  
  return code;
};

/**
 * Generate a unique referral code with prefix
 * @param {string} prefix - Prefix for the referral code (default: 'REF')
 * @param {number} length - Length of the random part (default: 6)
 * @returns {Promise<string>} - Generated referral code with prefix
 */
const generateUniqueReferralCodeWithPrefix = async (prefix = 'REF', length = 6) => {
  let code = `${prefix}${generateReferralCode(length)}`;
  let exists = await User.findOne({ referralCode: code });
  
  // Keep generating until unique
  while (exists) {
    code = `${prefix}${generateReferralCode(length)}`;
    exists = await User.findOne({ referralCode: code });
  }
  
  return code;
};

module.exports = {
  generateReferralCode,
  generateUniqueReferralCode,
  generateUniqueReferralCodeWithPrefix
};
