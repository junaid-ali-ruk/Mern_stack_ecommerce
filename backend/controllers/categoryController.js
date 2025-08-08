const Category = require('../models/Category');
const Product = require('../models/Product');
const { validationResult } = require('express-validator');

exports.createCategory = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const category = await Category.create(req.body);

    res.status(201).json({
      success: true,
      category
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Category slug already exists' 
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      success: true,
      category
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);
    
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const productCount = await Product.countDocuments({ category: id });
    
    if (productCount > 0) {
      return res.status(400).json({ 
        message: `Cannot delete category with ${productCount} products` 
      });
    }

    const descendants = await category.getAllDescendants();
    
    if (descendants.length > 0) {
      return res.status(400).json({ 
        message: 'Cannot delete category with subcategories' 
      });
    }

    await category.deleteOne();

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { parent, level, isActive = true } = req.query;

    const query = {};
    
    if (parent !== undefined) {
      query.parent = parent === 'null' ? null : parent;
    }
    if (level !== undefined) {
      query.level = parseInt(level);
    }
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const categories = await Category.find(query)
      .populate('parent', 'name slug')
      .sort('displayOrder name');

    res.json({
      success: true,
      categories
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCategoryTree = async (req, res) => {
  try {
    const tree = await Category.buildTree();

    res.json({
      success: true,
      tree
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id)
      .populate('parent', 'name slug')
      .populate('ancestors', 'name slug');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const children = await Category.find({ parent: id })
      .select('name slug productCount')
      .sort('displayOrder name');

    res.json({
      success: true,
      category,
      children
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCategoryBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({ slug, isActive: true })
      .populate('ancestors', 'name slug');

    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const children = await Category.find({ 
      parent: category._id, 
      isActive: true 
    })
      .select('name slug productCount image')
      .sort('displayOrder name');

    res.json({
      success: true,
      category,
      children
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reorderCategories = async (req, res) => {
  try {
    const { categories } = req.body;

    const bulkOps = categories.map((cat, index) => ({
      updateOne: {
        filter: { _id: cat.id },
        update: { $set: { displayOrder: index } }
      }
    }));

    await Category.bulkWrite(bulkOps);

    res.json({
      success: true,
      message: 'Categories reordered successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};