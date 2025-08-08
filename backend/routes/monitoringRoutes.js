// routes/monitoringRoutes.js
const express = require('express');
const router = express.Router();
const monitoringController = require('../controllers/monitoringController');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');
const { apiLimiter } = require('../middleware/security');

router.use(apiLimiter);

router.get('/health',
  monitoringController.getSystemHealth
);

router.get('/metrics/api',
  authenticate,
  checkPermission('analytics', 'read'),
  monitoringController.getAPIMetrics
);

router.get('/errors',
  authenticate,
  checkPermission('analytics', 'read'),
  monitoringController.getErrorLogs
);

router.post('/users/activity',
  authenticate,
  monitoringController.trackActiveUser
);

router.get('/users/active',
  authenticate,
  checkPermission('analytics', 'read'),
  monitoringController.getActiveUsers
);

router.post('/feedback',
  authenticate,
  monitoringController.submitFeedback
);

router.get('/security/events',
  authenticate,
  checkPermission('analytics', 'read'),
  monitoringController.getSecurityEvents
);

module.exports = router;