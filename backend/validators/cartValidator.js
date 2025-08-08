const { body, param } = require('express-validator');

exports.validateAddToCart = [
  body('productId')
    .notEmpty().withMessage('Product ID is required')
    .isMongoId().withMessage('Invalid product ID'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Quantity must be between 1 and 100'),
  body('variantId')
    .optional()
    .isMongoId().withMessage('Invalid variant ID')
];

exports.validateUpdateCartItem = [
  param('itemId')
    .isMongoId().withMessage('Invalid item ID'),
  body('quantity')
    .isInt({ min: 0, max: 100 }).withMessage('Quantity must be between 0 and 100')
];

exports.validateCoupon = [
  body('couponCode')
    .trim()
    .notEmpty().withMessage('Coupon code is required')
    .isAlphanumeric().withMessage('Invalid coupon code format')
];

exports.validateWishlistItem = [
  body('productId')
    .notEmpty().withMessage('Product ID is required')
    .isMongoId().withMessage('Invalid product ID'),
  body('variantId')
    .optional()
    .isMongoId().withMessage('Invalid variant ID')
];