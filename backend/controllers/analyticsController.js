const analyticsService = require('../services/analyticsService');

exports.getDashboardStats = async (req, res) => {
  try {
    const { date } = req.query;
    
    const kpis = await analyticsService.calculateDailyKPIs(
      date ? new Date(date) : new Date()
    );
    
    res.json({ success: true, kpis });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getRevenueAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const profit = await analyticsService.getProfitAnalysis(
      new Date(startDate),
      new Date(endDate)
    );
    
    res.json({ success: true, profit });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesTrend = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const trend = await analyticsService.getSalesTrend(parseInt(days));
    
    res.json({ success: true, trend });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTopProducts = async (req, res) => {
  try {
    const { period = 'month', limit = 10 } = req.query;
    
    const products = await analyticsService.getTopProducts(period, parseInt(limit));
    
    res.json({ success: true, products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomerLifetimeValue = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const ltv = await analyticsService.calculateCustomerLifetimeValue(customerId);
    
    res.json({ success: true, lifetimeValue: ltv });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCustomerSegments = async (req, res) => {
  try {
    const segments = await analyticsService.getCustomerSegments();
    
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.recordEvent = async (req, res) => {
  try {
    const { type, data } = req.body;
    
    await analyticsService.recordEvent(
      type,
      { ...data, userId: req.userId },
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};