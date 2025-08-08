const Product = require('../models/Product');
const Category = require('../models/Category');
const { validationResult } = require('express-validator');
const cloudinary = require('../config/cloudinary');

exports.createProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const productData = {
      ...req.body,
      createdBy: req.userId,
      updatedBy: req.userId
    };

    if (productData.variants && productData.variants.length > 0) {
      productData.hasVariants = true;
      
      const variantAttributes = {};
      productData.variants.forEach(variant => {
        Object.keys(variant.attributes || {}).forEach(key => {
          if (!variantAttributes[key]) {
            variantAttributes[key] = new Set();
          }
          if (variant.attributes[key]) {
            variantAttributes[key].add(variant.attributes[key]);
          }
        });
      });

      productData.variantAttributes = Object.entries(variantAttributes).map(([name, values]) => ({
        name,
        values: Array.from(values)
      }));
    }

    const product = await Product.create(productData);

    await Category.findByIdAndUpdate(
      product.category,
      { $inc: { productCount: 1 } }
    );

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name slug')
      .populate('subcategories', 'name slug')
      .populate('brand', 'name slug');

    res.status(201).json({
      success: true,
      product: populatedProduct
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.userId
    };

    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const oldCategory = product.category;

    if (updateData.variants && updateData.variants.length > 0) {
      updateData.hasVariants = true;
      
      const variantAttributes = {};
      updateData.variants.forEach(variant => {
        Object.keys(variant.attributes || {}).forEach(key => {
          if (!variantAttributes[key]) {
            variantAttributes[key] = new Set();
          }
          if (variant.attributes[key]) {
            variantAttributes[key].add(variant.attributes[key]);
          }
        });
      });

      updateData.variantAttributes = Object.entries(variantAttributes).map(([name, values]) => ({
        name,
        values: Array.from(values)
      }));
    } else {
      updateData.hasVariants = false;
      updateData.variantAttributes = [];
    }

    Object.assign(product, updateData);
    await product.save();

    if (oldCategory.toString() !== product.category.toString()) {
      await Category.findByIdAndUpdate(
        oldCategory,
        { $inc: { productCount: -1 } }
      );
      await Category.findByIdAndUpdate(
        product.category,
        { $inc: { productCount: 1 } }
      );
    }

    const populatedProduct = await Product.findById(product._id)
      .populate('category', 'name slug')
      .populate('subcategories', 'name slug')
      .populate('brand', 'name slug');

    res.json({
      success: true,
      product: populatedProduct
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists` 
      });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.images && product.images.length > 0) {
      const deletePromises = product.images.map(image => 
        cloudinary.uploader.destroy(image.publicId)
      );
      await Promise.all(deletePromises);
    }

    if (product.variants && product.variants.length > 0) {
      const variantImagePromises = [];
      product.variants.forEach(variant => {
        if (variant.images && variant.images.length > 0) {
          variant.images.forEach(image => {
            variantImagePromises.push(
              cloudinary.uploader.destroy(image.publicId)
            );
          });
        }
      });
      await Promise.all(variantImagePromises);
    }

    await Category.findByIdAndUpdate(
      product.category,
      { $inc: { productCount: -1 } }
    );

    await product.deleteOne();

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id)
      .populate('category', 'name slug ancestors')
      .populate('subcategories', 'name slug')
      .populate('brand', 'name slug logo')
      .populate('createdBy', 'email')
      .populate('updatedBy', 'email');

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await Product.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

    res.json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sort = '-createdAt',
      category,
      subcategory,
      brand,
      minPrice,
      maxPrice,
      status = 'published',
      search,
      tags,
      inStock
    } = req.query;

    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (subcategory) query.subcategories = subcategory;
    if (brand) query.brand = brand;
    if (tags) query.tags = { $in: tags.split(',') };

    if (minPrice || maxPrice) {
      query.basePrice = {};
      if (minPrice) query.basePrice.$gte = parseFloat(minPrice);
      if (maxPrice) query.basePrice.$lte = parseFloat(maxPrice);
    }

    if (inStock === 'true') {
      query.$or = [
        { 'stock.trackInventory': false },
        { 'stock.available': { $gt: 0 } },
        { 'stock.allowBackorder': true }
      ];
    }

    if (search) {
      query.$text = { $search: search };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [
        { path: 'category', select: 'name slug' },
        { path: 'brand', select: 'name slug' }
      ]
    };

    const products = await Product.paginate(query, options);

    res.json({
      success: true,
      products: products.docs,
      totalProducts: products.totalDocs,
      totalPages: products.totalPages,
      currentPage: products.page,
      hasNextPage: products.hasNextPage,
      hasPrevPage: products.hasPrevPage
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, operation = 'set', variantId } = req.body;

    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (variantId) {
      const variant = product.variants.id(variantId);
      if (!variant) {
        return res.status(404).json({ message: 'Variant not found' });
      }

      if (operation === 'set') {
        variant.stock.quantity = quantity;
      } else if (operation === 'add') {
        variant.stock.quantity += quantity;
      } else if (operation === 'subtract') {
        variant.stock.quantity = Math.max(0, variant.stock.quantity - quantity);
      }

      variant.stock.available = Math.max(0, variant.stock.quantity - variant.stock.reserved);
    } else {
      await product.updateStock(quantity, operation);
    }

    await product.save();

    res.json({
      success: true,
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bulkUpdateProducts = async (req, res) => {
  try {
    const { updates } = req.body;
    
    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.id },
        update: {
          $set: {
            ...update.data,
            updatedBy: req.userId,
            updatedAt: new Date()
          }
        }
      }
    }));

    const result = await Product.bulkWrite(bulkOps);

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      matchedCount: result.matchedCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductVariants = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id).select('variants variantAttributes hasVariants');
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json({
      success: true,
      variants: product.variants,
      variantAttributes: product.variantAttributes,
      hasVariants: product.hasVariants
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createProductVariant = async (req, res) => {
  try {
    const { id } = req.params;
    const variantData = req.body;

    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.variants.push(variantData);
    product.hasVariants = true;

    const variantAttributes = {};
    product.variants.forEach(variant => {
      Object.keys(variant.attributes || {}).forEach(key => {
        if (!variantAttributes[key]) {
          variantAttributes[key] = new Set();
        }
        if (variant.attributes[key]) {
          variantAttributes[key].add(variant.attributes[key]);
        }
      });
    });

    product.variantAttributes = Object.entries(variantAttributes).map(([name, values]) => ({
      name,
      values: Array.from(values)
    }));

    await product.save();

    res.json({
      success: true,
      variant: product.variants[product.variants.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProductVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;
    const updateData = req.body;

    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variant = product.variants.id(variantId);
    
    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    Object.assign(variant, updateData);
    await product.save();

    res.json({
      success: true,
      variant
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProductVariant = async (req, res) => {
  try {
    const { id, variantId } = req.params;

    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variant = product.variants.id(variantId);
    
    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    if (variant.images && variant.images.length > 0) {
      const deletePromises = variant.images.map(image => 
        cloudinary.uploader.destroy(image.publicId)
      );
      await Promise.all(deletePromises);
    }

    product.variants.pull(variantId);
    
    if (product.variants.length === 0) {
      product.hasVariants = false;
      product.variantAttributes = [];
    }

    await product.save();

    res.json({
      success: true,
      message: 'Variant deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};