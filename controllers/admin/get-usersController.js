// Admin user management controller
const User = require("../../models/user-model");

// Utility function for consistent display name logic
const getDisplayName = (user) => {
  return user.fullName && user.fullName.trim() !== '' ? user.fullName : user.email.split('@')[0];
};

// Utility function for input sanitization
const sanitizeSearchTerm = (term) => {
  if (!term || typeof term !== 'string') return '';
  return term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special characters
};

// Standard error response format
const sendErrorResponse = (res, statusCode, message, isApi = false) => {
  const errorResponse = {
    success: false,
    message: message || 'Server error'
  };
  
  if (isApi) {
    return res.status(statusCode).json(errorResponse);
  } else {
    console.error('Server error:', message);
    return res.status(statusCode).send('Server error');
  }
};

// Standard success response format for API
const sendSuccessResponse = (res, data, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    ...data
  });
};

const getUsers = async (req, res) => {
  try {
    const searchTerm = sanitizeSearchTerm(req.query.search || '');
    const statusFilter = req.query.status || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;

    let searchQuery = {};
    if (searchTerm) {
      searchQuery.$or = [
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    const totalUsers = await User.countDocuments(searchQuery);
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullName email createdAt isBlocked _id')
      .lean();

    const modifiedUsers = users.map(user => ({
      ...user,
      displayName: getDisplayName(user)
    }));

    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    res.render('admin/customer-listing', {
      users: modifiedUsers,
      currentPage: page,
      totalPages,
      totalUsers,
      startIdx,
      endIdx,
      searchTerm: req.query.search || '',
      statusFilter,
    });
  } catch (error) {
    console.error('Error fetching users:', error.message);
    return sendErrorResponse(res, 500, 'Failed to load customers', false);
  }
};

const getUsersApi = async (req, res) => {
  try {
    const searchTerm = sanitizeSearchTerm(req.query.search || '');
    const statusFilter = req.query.status || '';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;

    let searchQuery = {};
    if (searchTerm) {
      searchQuery.$or = [
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    if (statusFilter) {
      searchQuery.isBlocked = statusFilter === 'blocked';
    }

    const totalUsers = await User.countDocuments(searchQuery);
    const users = await User.find(searchQuery)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullName email createdAt isBlocked _id')
      .lean();

    const modifiedUsers = users.map(user => ({
      ...user,
      displayName: getDisplayName(user)
    }));

    const totalPages = Math.ceil(totalUsers / limit);
    const startIdx = (page - 1) * limit;
    const endIdx = Math.min(startIdx + limit, totalUsers);

    return sendSuccessResponse(res, {
      users: modifiedUsers,
      currentPage: page,
      totalPages,
      totalUsers,
      startIdx,
      endIdx,
      filteredCount: users.length
    });
  } catch (error) {
    console.error('Error fetching users for API:', error.message);
    return sendErrorResponse(res, 500, 'Failed to fetch customers', true);
  }
};

const getUserById = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendErrorResponse(res, 400, 'Invalid user ID format', true);
    }

    const user = await User.findById(userId)
      .select('fullName email createdAt isBlocked _id')
      .lean();
      
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found', true);
    }

    return sendSuccessResponse(res, {
      user: {
        ...user,
        displayName: getDisplayName(user)
      }
    });
  } catch (error) {
    console.error('Error fetching user details:', error.message);
    return sendErrorResponse(res, 500, 'Failed to fetch user details', true);
  }
};

const blockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendErrorResponse(res, 400, 'Invalid user ID format', true);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isBlocked: true },
      { new: true, select: '_id isBlocked fullName email' }
    );
    
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found', true);
    }

    return sendSuccessResponse(res, {
      user: { 
        id: user._id, 
        isBlocked: user.isBlocked,
        displayName: getDisplayName(user)
      }
    }, 'User blocked successfully');
  } catch (error) {
    console.error('Error blocking user:', error.message);
    return sendErrorResponse(res, 500, 'Failed to block user', true);
  }
};

const unblockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Validate ObjectId format
    if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return sendErrorResponse(res, 400, 'Invalid user ID format', true);
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isBlocked: false },
      { new: true, select: '_id isBlocked fullName email' }
    );
    
    if (!user) {
      return sendErrorResponse(res, 404, 'User not found', true);
    }

    return sendSuccessResponse(res, {
      user: { 
        id: user._id, 
        isBlocked: user.isBlocked,
        displayName: getDisplayName(user)
      }
    }, 'User unblocked successfully');
  } catch (error) {
    console.error('Error unblocking user:', error.message);
    return sendErrorResponse(res, 500, 'Failed to unblock user', true);
  }
};

module.exports = { getUsers, getUsersApi, getUserById, blockUser, unblockUser };