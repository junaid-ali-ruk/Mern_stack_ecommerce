const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');
const { validateOrder, validateRefund } = require('../validators/orderValidator');

router.post('/orders', 
  authenticate, 
  validateOrder, 
  orderController.createOrder
);

router.get('/orders', 
  authenticate, 
  orderController.getUserOrders
);

router.get('/orders/stats', 
  authenticate, 
  orderController.getOrderStats
);

router.get('/orders/:orderId', 
  authenticate, 
  orderController.getOrder
);

router.patch('/orders/:orderId/status',
  authenticate,
  checkPermission('orders', 'update'),
  orderController.updateOrderStatus
);

router.post('/orders/:orderId/cancel',
  authenticate,
  orderController.cancelOrder
);

router.post('/orders/:orderId/refund',
  authenticate,
  validateRefund,
  orderController.requestRefund
);

router.patch('/orders/:orderId/refunds/:refundId',
  authenticate,
  checkPermission('orders', 'update'),
  orderController.processRefund
);

router.get('/orders/:orderId/invoice',
  authenticate,
  orderController.generateInvoice
);

router.get('/orders/:orderId/invoice/download',
  authenticate,
  orderController.downloadInvoice
);

router.get('/track/:orderNumber',
  orderController.trackOrder
);

router.get('/admin/orders/analytics',
  authenticate,
  checkPermission('analytics', 'read'),
  orderController.getOrderAnalytics
);

module.exports = router;