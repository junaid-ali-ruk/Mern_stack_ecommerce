const monitoringService = require('../services/monitoringService');
const Monitoring = require('../models/Monitoring');

exports.getSystemHealth = async (req, res) => {
  try {
    const health = await monitoringService.generateHealthReport();
    res.json({ success: true, health });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAPIMetrics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const logs = await Monitoring.aggregate([
      { $unwind: '$apiLogs' },
      {
        $match: {
          'apiLogs.timestamp': {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$apiLogs.endpoint',
          calls: { $sum: 1 },
          avgResponseTime: { $avg: '$apiLogs.responseTime' },
          errors: {
            $sum: {
              $cond: [{ $gte: ['$apiLogs.statusCode', 400] }, 1, 0]
            }
          }
        }
      },
      { $sort: { calls: -1 } }
    ]);
    
    res.json({ success: true, metrics: logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getErrorLogs = async (req, res) => {
  try {
    const { resolved = false, severity } = req.query;
    
    const query = { 'errorLogs.resolved': resolved === 'true' };
    if (severity) {
      query['errorLogs.severity'] = severity;
    }
    
    const errors = await Monitoring.findOne()
      .select('errorLogs')
      .slice('errorLogs', 100);
    
    res.json({ success: true, errors: errors?.errorLogs || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackActiveUser = async (req, res) => {
  try {
    const { activity } = req.body;
    
    await monitoringService.trackActiveUser(req.userId, activity);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getActiveUsers = async (req, res) => {
  try {
    const { minutes = 30 } = req.query;
    
    const count = await monitoringService.getActiveUsersCount(parseInt(minutes));
    
    res.json({ success: true, activeUsers: count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const feedback = {
      ...req.body,
      user: req.userId
    };
    
    await monitoringService.collectUserFeedback(feedback);
    
    res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSecurityEvents = async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    
    const query = {};
    if (type) query['securityEvents.type'] = type;
    if (startDate && endDate) {
      query['securityEvents.timestamp'] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const events = await Monitoring.findOne(query)
      .select('securityEvents')
      .slice('securityEvents', 100);
    
    res.json({ success: true, events: events?.securityEvents || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};