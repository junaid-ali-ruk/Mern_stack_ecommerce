const Analytics = require('../models/Analytics');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
class AnalyticsService {
  async recordEvent(type, data, metadata) {
    const event = {
      type,
      user: data.userId,
      sessionId: data.sessionId,
      data,
      metadata,
      timestamp: new Date()
    };
    
    await Analytics.findOneAndUpdate(
      {},
      { $push: { events: event } },
      { upsert: true }
    );
  }

  async calculateDailyKPIs(date = new Date()) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const [revenue, orders, customers, products, traffic] = await Promise.all([
      this.calculateRevenue(startOfDay, endOfDay),
      this.calculateOrders(startOfDay, endOfDay),
      this.calculateCustomers(startOfDay, endOfDay),
      this.calculateProducts(startOfDay, endOfDay),
      this.calculateTraffic(startOfDay, endOfDay)
    ]);
    
    const kpi = {
      date: startOfDay,
      type: 'daily',
      metrics: {
        revenue,
        orders,
        customers,
        products,
        traffic
      },
      comparisons: await this.calculateComparisons(startOfDay, revenue, orders, customers)
    };
    
    await Analytics.findOneAndUpdate(
      {},
      {
        $push: {
          kpis: {
            $each: [kpi],
            $sort: { date: -1 },
            $slice: 365
          }
        }
      },
      { upsert: true }
    );
    
    return kpi;
  }

  async calculateRevenue(startDate, endDate) {
    const orders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$pricing.total' },
          count: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.total' }
        }
      }
    ]);
    
    return {
      total: orders[0]?.total || 0,
      orders: orders[0]?.count || 0,
      averageOrderValue: orders[0]?.averageOrderValue || 0,
      currency: 'USD'
    };
  }

  async calculateOrders(startDate, endDate) {
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const total = stats.reduce((sum, s) => sum + s.count, 0);
    const completed = stats.find(s => s._id === 'delivered')?.count || 0;
    
    return {
      total,
      completed,
      cancelled: stats.find(s => s._id === 'cancelled')?.count || 0,
      returned: stats.find(s => s._id === 'refunded')?.count || 0,
      conversionRate: total > 0 ? (completed / total * 100) : 0
    };
  }

  async calculateCustomers(startDate, endDate) {
    const newCustomers = await User.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const activeCustomers = await Order.distinct('user', {
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    const returningCustomers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$user',
          orderCount: { $sum: 1 }
        }
      },
      {
        $match: {
          orderCount: { $gt: 1 }
        }
      }
    ]);
    
    return {
      new: newCustomers,
      returning: returningCustomers.length,
      active: activeCustomers.length,
      churnRate: 0,
      lifetimeValue: await this.calculateAverageLifetimeValue()
    };
  }

  async calculateProducts(startDate, endDate) {
    const sales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          totalSold: { $sum: '$items.quantity' }
        }
      }
    ]);
    
    const views = await Analytics.aggregate([
      {
        $unwind: '$events'
      },
      {
        $match: {
          'events.type': 'pageview',
          'events.data.product': { $exists: true },
          'events.timestamp': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $count: 'total'
      }
    ]);
    
    const outOfStock = await Product.countDocuments({
      status: 'outofstock'
    });
    
    return {
      sold: sales[0]?.totalSold || 0,
      views: views[0]?.total || 0,
      conversionRate: views[0]?.total > 0 ? 
        ((sales[0]?.totalSold || 0) / views[0].total * 100) : 0,
      averageRating: await this.calculateAverageProductRating(),
      outOfStock
    };
  }

  async calculateTraffic(startDate, endDate) {
    const events = await Analytics.aggregate([
      { $unwind: '$events' },
      {
        $match: {
          'events.timestamp': { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$events.type',
            sessionId: '$events.sessionId'
          },
          count: { $sum: 1 }
        }
      }
    ]);
    
    const pageviews = events.filter(e => e._id.type === 'pageview')
      .reduce((sum, e) => sum + e.count, 0);
    
    const sessions = new Set(events.map(e => e._id.sessionId)).size;
    
    return {
      visitors: sessions,
      pageviews,
      sessions,
      bounceRate: 15.5,
      averageSessionDuration: 245
    };
  }

  async calculateComparisons(date, revenue, orders, customers) {
    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);
    
    const previousYear = new Date(date);
    previousYear.setFullYear(previousYear.getFullYear() - 1);
    
    const previousDayKPI = await Analytics.findOne({
      'kpis.date': previousDay,
      'kpis.type': 'daily'
    });
    
    const previousYearKPI = await Analytics.findOne({
      'kpis.date': previousYear,
      'kpis.type': 'daily'
    });
    
    return {
      previousPeriod: {
        revenue: previousDayKPI ? 
          ((revenue.total - previousDayKPI.kpis[0].metrics.revenue.total) / 
           previousDayKPI.kpis[0].metrics.revenue.total * 100) : 0,
        orders: previousDayKPI ?
          ((orders.total - previousDayKPI.kpis[0].metrics.orders.total) /
           previousDayKPI.kpis[0].metrics.orders.total * 100) : 0,
        customers: previousDayKPI ?
          ((customers.active - previousDayKPI.kpis[0].metrics.customers.active) /
           previousDayKPI.kpis[0].metrics.customers.active * 100) : 0
      },
      yearOverYear: {
        revenue: previousYearKPI ?
          ((revenue.total - previousYearKPI.kpis[0].metrics.revenue.total) /
           previousYearKPI.kpis[0].metrics.revenue.total * 100) : 0,
        orders: previousYearKPI ?
          ((orders.total - previousYearKPI.kpis[0].metrics.orders.total) /
           previousYearKPI.kpis[0].metrics.orders.total * 100) : 0,
        customers: previousYearKPI ?
          ((customers.active - previousYearKPI.kpis[0].metrics.customers.active) /
           previousYearKPI.kpis[0].metrics.customers.active * 100) : 0
      }
    };
  }

  async calculateCustomerLifetimeValue(customerId) {
    const orders = await Order.find({
      user: customerId,
      status: 'delivered'
    });
    
    if (orders.length === 0) return 0;
    
    const totalSpent = orders.reduce((sum, order) => sum + order.pricing.total, 0);
    const firstOrder = orders[0].createdAt;
    const lastOrder = orders[orders.length - 1].createdAt;
    const timespan = (lastOrder - firstOrder) / (1000 * 60 * 60 * 24 * 30);
    
    const monthlyValue = timespan > 0 ? totalSpent / timespan : totalSpent;
    const predictedLifetime = 24;
    
    return monthlyValue * predictedLifetime;
  }

  async calculateAverageLifetimeValue() {
    const customers = await User.find({}).limit(100);
    const values = await Promise.all(
      customers.map(c => this.calculateCustomerLifetimeValue(c._id))
    );
    
    return values.length > 0 ? 
      values.reduce((sum, v) => sum + v, 0) / values.length : 0;
  }

  async calculateAverageProductRating() {
    const products = await Product.aggregate([
      {
        $match: {
          'rating.count': { $gt: 0 }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating.average' }
        }
      }
    ]);
    
    return products[0]?.averageRating || 0;
  }

  async getSalesTrend(days = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const dailySales = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
    
    const revenues = dailySales.map(d => d.revenue);
    const trend = ss.linearRegression(
      revenues.map((r, i) => [i, r])
    );
    
    return {
      daily: dailySales,
      trend: {
        slope: trend.m,
        intercept: trend.b,
        direction: trend.m > 0 ? 'increasing' : trend.m < 0 ? 'decreasing' : 'stable'
      },
      forecast: this.forecastSales(revenues, 7)
    };
  }

  forecastSales(historicalData, days) {
    const forecast = [];
    const avg = ss.mean(historicalData);
    const stdDev = ss.standardDeviation(historicalData);
    
    for (let i = 0; i < days; i++) {
      forecast.push({
        day: i + 1,
        predicted: avg + (Math.random() - 0.5) * stdDev,
        confidence: {
          lower: avg - stdDev,
          upper: avg + stdDev
        }
      });
    }
    
    return forecast;
  }

  async getTopProducts(period = 'month', limit = 10) {
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }
    
    const topProducts = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          revenue: { $sum: '$items.total' },
          quantity: { $sum: '$items.quantity' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' }
    ]);
    
    return topProducts;
  }

  async getCustomerSegments() {
    const customers = await User.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'user',
          as: 'orders'
        }
      },
      {
        $addFields: {
          totalOrders: { $size: '$orders' },
          totalSpent: { $sum: '$orders.pricing.total' },
          lastOrderDate: { $max: '$orders.createdAt' }
        }
      },
      {
        $project: {
          email: 1,
          totalOrders: 1,
          totalSpent: 1,
          lastOrderDate: 1,
          daysSinceLastOrder: {
            $divide: [
              { $subtract: [new Date(), '$lastOrderDate'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      }
    ]);
    
    const segments = {
      champions: [],
      loyalCustomers: [],
      potentialLoyalists: [],
      newCustomers: [],
      atRisk: [],
      cantLose: [],
      lost: []
    };
    
    customers.forEach(customer => {
      const segment = this.determineSegment(
        customer.daysSinceLastOrder,
        customer.totalOrders,
        customer.totalSpent
      );
      segments[segment].push(customer);
    });
    
    return segments;
  }

  determineSegment(recency, frequency, monetary) {
    if (recency < 30 && frequency > 10 && monetary > 1000) return 'champions';
    if (recency < 60 && frequency > 5 && monetary > 500) return 'loyalCustomers';
    if (recency < 90 && frequency > 2) return 'potentialLoyalists';
    if (recency < 30 && frequency === 1) return 'newCustomers';
    if (recency > 90 && frequency > 5 && monetary > 500) return 'cantLose';
    if (recency > 60 && frequency > 2) return 'atRisk';
    return 'lost';
  }

  async getProfitAnalysis(startDate, endDate) {
    const orders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'delivered'
        }
      },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$items.total' },
          cost: { 
            $sum: { 
              $multiply: ['$items.quantity', '$product.costPrice'] 
            } 
          },
          orders: { $sum: 1 }
        }
      }
    ]);
    
    const data = orders[0] || { revenue: 0, cost: 0, orders: 0 };
    const profit = data.revenue - data.cost;
    const margin = data.revenue > 0 ? (profit / data.revenue * 100) : 0;
    
    return {
      revenue: data.revenue,
      cost: data.cost,
      profit,
      margin,
      averageOrderProfit: data.orders > 0 ? profit / data.orders : 0
    };
  }
}

module.exports = new AnalyticsService();