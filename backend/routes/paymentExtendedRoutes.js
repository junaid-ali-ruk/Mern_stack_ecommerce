// routes/paymentExtendedRoutes.js
const express = require('express');
const router = express.Router();
const discountController = require('../controllers/discountController');
const shippingController = require('../controllers/shippingController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');

// Discount routes
router.post('/discounts/validate',
  authenticate,
  discountController.validateDiscountCode
);

router.post('/discounts',
  authenticate,
  checkPermission('orders', 'create'),
  discountController.createDiscountCode
);

router.post('/discounts/bulk',
  authenticate,
  checkPermission('orders', 'create'),
  discountController.generateBulkCodes
);

router.get('/discounts/analytics',
  authenticate,
  checkPermission('analytics', 'read'),
  discountController.getDiscountAnalytics
);

// Gift card routes
router.post('/giftcards/balance',
  discountController.checkGiftCardBalance
);

router.post('/giftcards/purchase',
  authenticate,
  discountController.purchaseGiftCard
);

router.post('/giftcards/bulk',
  authenticate,
  checkPermission('orders', 'create'),
  discountController.createBulkGiftCards
);

// Payment routes
router.post('/payments/partial',
  authenticate,
  discountController.processPartialPayment
);

router.post('/payments/:transactionId/retry',
  authenticate,
  discountController.retryPayment
);

router.post('/payments/:transactionId/schedule-retry',
  authenticate,
  discountController.schedulePaymentRetry
);

// Shipping routes
router.post('/shipping/calculate',
  shippingController.calculateShipping
);

router.get('/shipping/pickup-locations',
  shippingController.getPickupLocations
);

router.post('/shipping/validate-pickup',
  shippingController.validatePickup
);

router.get('/shipping/delivery-slots',
  shippingController.getDeliverySlots
);

router.post('/shipping/book-slot',
  authenticate,
  shippingController.bookDeliverySlot
);

router.get('/shipping/methods',
  shippingController.getShippingMethods
);

router.post('/shipping/methods',
  authenticate,
  checkPermission('settings', 'update'),
  shippingController.createShippingMethod
);

router.put('/shipping/methods/:methodId',
  authenticate,
  checkPermission('settings', 'update'),
  shippingController.updateShippingMethod
);

router.post('/shipping/methods/:methodId/generate-slots',
  authenticate,
  checkPermission('settings', 'update'),
  shippingController.generateDeliverySlots
);

router.get('/shipping/track/:carrier/:trackingNumber',
  shippingController.trackShipment
);

router.post('/shipping/insurance',
  shippingController.calculateInsurance
);

module.exports = router;