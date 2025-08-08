    const { body, param } = require('express-validator');

exports.validateOrder = [
  body('cartId')
    .notEmpty().withMessage('Cart ID is required')
    .isMongoId().withMessage('Invalid cart ID'),
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['card', 'paypal', 'stripe', 'cod', 'bank_transfer'])
    .withMessage('Invalid payment method'),
  body('billingAddress.fullName')
    .notEmpty().withMessage('Full name is required'),
  body('billingAddress.phone')
    .notEmpty().withMessage('Phone number is required'),
  body('billingAddress.addressLine1')
    .notEmpty().withMessage('Address is required'),
  body('billingAddress.city')
    .notEmpty().withMessage('City is required'),
  body('billingAddress.state')
    .notEmpty().withMessage('State is required'),
  body('billingAddress.postalCode')
    .notEmpty().withMessage('Postal code is required'),
  body('shippingMethod')
    .optional()
    .isIn(['standard', 'express', 'overnight'])
    .withMessage('Invalid shipping method')
];

exports.validateRefund = [
  body('reason')
    .notEmpty().withMessage('Refund reason is required'),
  body('description')
    .optional()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('items')
    .optional()
    .isArray().withMessage('Items must be an array'),
  body('totalAmount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Invalid refund amount')
];