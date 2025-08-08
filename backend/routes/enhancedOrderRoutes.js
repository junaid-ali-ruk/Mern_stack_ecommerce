// routes/enhancedOrderRoutes.js
const express = require('express');
const router = express.Router();
const enhancedOrderController = require('../controllers/enhancedOrderController');
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');

router.get('/admin/dashboard',
  authenticate,
  checkPermission('analytics', 'read'),
  enhancedOrderController.getAdminDashboard
);

router.get('/admin/orders/by-status',
  authenticate,
  checkPermission('orders', 'read'),
  enhancedOrderController.getOrdersByStatus
);

router.get('/admin/sales-trend',
  authenticate,
  checkPermission('analytics', 'read'),
  enhancedOrderController.getSalesTrend
);

router.post('/delivery/estimate',
  enhancedOrderController.calculateDeliveryEstimate
);

router.get('/tracking/:carrier/:trackingNumber',
  enhancedOrderController.trackShipment
);

router.get('/addresses',
  authenticate,
  enhancedOrderController.getUserAddresses
);

router.post('/addresses',
  authenticate,
  enhancedOrderController.addAddress
);

router.put('/addresses/:addressId',
  authenticate,
  enhancedOrderController.updateAddress
);

router.delete('/addresses/:addressId',
  authenticate,
  enhancedOrderController.deleteAddress
);

router.patch('/addresses/:addressId/default',
  authenticate,
  enhancedOrderController.setDefaultAddress
);

router.post('/payments/intent',
  authenticate,
  paymentController.createPaymentIntent
);

router.post('/payments/confirm',
  authenticate,
  paymentController.confirmPayment
);

router.get('/payments/methods',
  authenticate,
  paymentController.getPaymentMethods
);

router.post('/payments/methods',
  authenticate,
  paymentController.savePaymentMethod
);

router.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  paymentController.handleStripeWebhook
);

 

router.get('/currency/convert',
  paymentController.convertCurrency
);

router.get('/currency/rates',
  paymentController.getExchangeRates
);

router.get('/currency/detect',
  paymentController.detectUserCurrency
);

module.exports = router;