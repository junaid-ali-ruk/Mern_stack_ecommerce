// routes/advancedRoutes.js
const express = require('express');
const router = express.Router();
const warehouseController = require('../controllers/warehouseController');
const reviewController = require('../controllers/reviewController');
const analyticsController = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');

// Warehouse routes
router.post('/warehouses',
  authenticate,
  checkPermission('settings', 'update'),
  warehouseController.createWarehouse
);

router.post('/warehouses/allocate',
  authenticate,
  checkPermission('orders', 'update'),
  warehouseController.allocateInventory
);

router.post('/delivery/local',
  warehouseController.calculateLocalDelivery
);

router.post('/packaging/calculate',
  warehouseController.calculatePackaging
);

router.post('/delivery/:orderId/confirm',
  authenticate,
  warehouseController.confirmDelivery
);

router.get('/tracking/:carrier/:trackingNumber/realtime',
  warehouseController.trackRealTimeShipment
);

// Review routes
router.post('/reviews',
  authenticate,
  reviewController.createReview
);

router.put('/reviews/:reviewId',
  authenticate,
  reviewController.updateReview
);

router.delete('/reviews/:reviewId',
  authenticate,
  reviewController.deleteReview
);

router.get('/reviews',
  reviewController.getReviews
);

router.post('/reviews/:reviewId/vote',
  authenticate,
  reviewController.voteReview
);

router.post('/reviews/:reviewId/report',
  authenticate,
  reviewController.reportReview
);

router.patch('/reviews/:reviewId/moderate',
  authenticate,
  checkPermission('products', 'update'),
  reviewController.moderateReview
);

router.get('/products/:productId/review-stats',
  reviewController.getReviewStats
);

router.get('/products/:productId/review-insights',
  reviewController.getReviewInsights
);

router.get('/products/:productId/fake-reviews',
  authenticate,
  checkPermission('products', 'read'),
  reviewController.detectFakeReviews
);

// Analytics routes
router.get('/analytics/dashboard',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getDashboardStats
);

router.get('/analytics/revenue',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getRevenueAnalysis
);

router.get('/analytics/sales-trend',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getSalesTrend
);

router.get('/analytics/top-products',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getTopProducts
);

router.get('/analytics/customer/:customerId/ltv',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getCustomerLifetimeValue
);

router.get('/analytics/customer-segments',
  authenticate,
  checkPermission('analytics', 'read'),
  analyticsController.getCustomerSegments
);

router.post('/analytics/event',
  analyticsController.recordEvent
);

module.exports = router;