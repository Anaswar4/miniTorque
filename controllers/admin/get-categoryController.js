    const Category = require('../../models/category-schema');
    const mongoose = require('mongoose');

    const renderCategoryManagementPage = async (req, res) => {
    try {
        res.render('admin/get-category', {});
    } catch (error) {
        console.error("Error rendering category page:", error);
        res.status(500).send("Error loading the page.");
    }
    };

    const getAllCategoriesAPI = async (req, res) => {
    try {
        const categories = await Category.find({
        $or: [
            { isDeleted: false },
            { isDeleted: { $exists: false } }
        ]
        }).sort({ createdAt: -1 });

        const formattedCategories = categories.map(cat => ({
        _id: cat._id,
        name: cat.name,
        description: cat.description,
        isListed: cat.isListed,
        date: cat.createdAt.toISOString().split('T')[0]
        }));

        res.status(200).json(formattedCategories);
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
    };

    const addCategoryAPI = async (req, res) => {
    try {
        const { name, description, status } = req.body;

        if (!name) {
        return res.status(400).json({ message: 'Category name is required.' });
        }

        // ✅ Moved logic here: Check for case-insensitive duplicate name
        const existingCategory = await Category.findOne({
        name: new RegExp(`^${name.trim()}$`, 'i'),
        $or: [
            { isDeleted: false },
            { isDeleted: { $exists: false } }
        ]
        });
        if (existingCategory) {
        return res.status(409).json({ message: 'A category with this name already exists.' });
        }

        const newCategory = new Category({
        name: name.trim(),
        description,
        isListed: status !== undefined ? status : true
        });

        await newCategory.save();

        res.status(201).json({
        _id: newCategory._id,
        name: newCategory.name,
        description: newCategory.description,
        isListed: newCategory.isListed,
        date: newCategory.createdAt.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error adding category:", error);
        res.status(500).json({ message: 'Error adding category', error: error.message });
    }
    };

    const updateCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid category ID.' });
        }

        if (!name) {
        return res.status(400).json({ message: 'Category name is required.' });
        }

        // ✅ Moved logic here: Check if another category with same name exists
        const existingCategory = await Category.findOne({
        name: new RegExp(`^${name.trim()}$`, 'i'),
        _id: { $ne: id },
        $or: [
            { isDeleted: false },
            { isDeleted: { $exists: false } }
        ]
        });
        if (existingCategory) {
        return res.status(409).json({ message: 'Another category with this name already exists.' });
        }

        const updateData = { name: name.trim(), description };
        if (status !== undefined) {
        updateData.isListed = status;
        }

        const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

        if (!updatedCategory) {
        return res.status(404).json({ message: 'Category not found.' });
        }

        res.status(200).json({
        _id: updatedCategory._id,
        name: updatedCategory.name,
        description: updatedCategory.description,
        isListed: updatedCategory.isListed,
        date: updatedCategory.createdAt.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ message: 'Error updating category', error: error.message });
    }
    };

    const toggleCategoryStatusAPI = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid category ID.' });
        }
        if (typeof status !== 'boolean') {
        return res.status(400).json({ message: 'Invalid status value. Must be true or false.' });
        }

        const category = await Category.findById(id);
        if (!category) {
        return res.status(404).json({ message: 'Category not found.' });
        }

        category.isListed = status;
        await category.save();

        res.status(200).json({
        message: `Category "${category.name}" status updated.`,
        category: {
            _id: category._id,
            isListed: category.isListed
        }
        });
    } catch (error) {
        console.error("Error toggling category status:", error);
        res.status(500).json({ message: 'Error toggling category status', error: error.message });
    }
    };

    const deleteCategoryAPI = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid category ID.' });
        }

        const category = await Category.findById(id);
        if (!category) {
        return res.status(404).json({ message: 'Category not found.' });
        }

        if (category.isDeleted) {
        return res.status(400).json({ message: 'Category is already deleted.' });
        }

        category.isDeleted = true;
        category.isListed = false;
        await category.save();

        res.status(200).json({
        message: `Category "${category.name}" has been deleted successfully.`,
        category: {
            _id: category._id,
            name: category.name,
            isDeleted: category.isDeleted
        }
        });
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({ message: 'Error deleting category', error: error.message });
    }
    };

    module.exports = {
    renderCategoryManagementPage,
    getAllCategoriesAPI,
    addCategoryAPI,
    updateCategoryAPI,
    toggleCategoryStatusAPI,
    deleteCategoryAPI
    };
