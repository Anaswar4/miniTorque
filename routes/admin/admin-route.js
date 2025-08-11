const express = require("express");
const adminRoute = express.Router();

const adminController = require("../../controllers/admin/admin-controller");
const getUsersController = require("../../controllers/admin/get-usersController");
const getCategoryController = require("../../controllers/admin/get-categoryController");
const dashboardController = require("../../controllers/admin/dashboard-controller");
const { isAdminAuthenticated, preventCache, redirectIfAdminAuthenticated } = require('../../middlewares/auth-middleware');


adminRoute.get("/admin-login", preventCache, redirectIfAdminAuthenticated, adminController.getAdminLogin);
adminRoute.post("/admin-login", redirectIfAdminAuthenticated, adminController.postAdminLogin);



//Admin Dashboard
adminRoute.get("/admin-dashboard", isAdminAuthenticated, preventCache, adminController.getAdminDashboard);
adminRoute.get("/admin-logout", isAdminAuthenticated, preventCache, adminController.logoutAdminDashboard);


//User Management
adminRoute.get("/get-user", isAdminAuthenticated, preventCache, getUsersController.getUsers);
adminRoute.get("/get-users", isAdminAuthenticated, preventCache, getUsersController.getUsersApi);
adminRoute.get("/get-users/:id", isAdminAuthenticated, preventCache, getUsersController.getUserById);
adminRoute.put("/get-users/:id/block", isAdminAuthenticated, preventCache, getUsersController.blockUser);
adminRoute.put("/get-users/:id/unblock", isAdminAuthenticated, preventCache, getUsersController.unblockUser);

//Category Management
adminRoute.get('/get-category', isAdminAuthenticated, preventCache, getCategoryController.renderCategoryManagementPage);
adminRoute.get('/get-categories', isAdminAuthenticated, preventCache, getCategoryController.getAllCategoriesAPI);
adminRoute.post('/get-categories', isAdminAuthenticated, preventCache, getCategoryController.addCategoryAPI);
adminRoute.put('/get-categories/:id', isAdminAuthenticated, preventCache, getCategoryController.updateCategoryAPI);
adminRoute.patch('/get-categories/:id/status', isAdminAuthenticated, preventCache, getCategoryController.toggleCategoryStatusAPI);
adminRoute.delete('/get-categories/:id', isAdminAuthenticated, preventCache, getCategoryController.deleteCategoryAPI);





module.exports = adminRoute;