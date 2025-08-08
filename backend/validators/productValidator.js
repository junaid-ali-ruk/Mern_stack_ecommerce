const { body, param } = require('express-validator');

exports.validateProduct = [
  body('name')
    .trim()
    .notEmpty().withMessage('Product name is required')
    .isLength({ max: 200 }).withMessage('Name must be less than 200 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 5000 }).withMessage('Description must be less than 5000 characters'),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isMongoId().withMessage('Invalid category ID'),
  body('basePrice')
    .isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('comparePrice')
    .optional()
    .isFloat({ min: 0 }).withMessage('Compare price must be a positive number'),
  body('sku')
    .optional()
    .trim()
    .toUpperCase(),
  body('stock.quantity')
    .optional()
    .isInt({ min: 0 }).withMessage('Stock quantity must be a positive integer'),
  body('variants')
    .optional()
    .isArray().withMessage('Variants must be an array'),
  body('variants.*.sku')
    .trim()
    .notEmpty().withMessage('Variant SKU is required')
    .toUpperCase(),
  body('variants.*.price')
    .isFloat({ min: 0 }).withMessage('Variant price must be positive'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived', 'outofstock']).withMessage('Invalid status')
];

exports.validateCategory = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required')
    .isLength({ max: 100 }).withMessage('Name must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
  body('parent')
    .optional()
    .isMongoId().withMessage('Invalid parent category ID'),
  body('displayOrder')
    .optional()
    .isInt({ min: 0 }).withMessage('Display order must be a positive integer')
];

exports.validateObjectId = [
  param('id').isMongoId().withMessage('Invalid ID format')
];