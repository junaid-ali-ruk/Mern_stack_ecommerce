const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

class AdminDashboardService {
  async getOverview(period = 'today') {
    const dateRange = this.getDateRange(period);
    
    const [
      orderStats,
      revenueStats,
      customerStats,
      productStats,
      recentOrders,
      topProducts
    ] = await Promise.all([
      this.getOrderStats(dateRange),
      this.getRevenueStats(dateRange),
      this.getCustomerStats(dateRange),
      this.getProductStats(dateRange),
      this.getRecentOrders(),
      this.getTopProducts(dateRange)
    ]);

    return {
      period,
      dateRange,
      orderStats,
      revenueStats,
      customerStats,
      productStats,
      recentOrders,
      topProducts
    };
  }

  getDateRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case 'today':
        return {
          start: today,
          end: now
        };
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return {
          start: weekAgo,
          end: now
        };
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return {
          start: monthAgo,
          end: now
        };
      case 'year':
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        return {
          start: yearAgo,
          end: now
        };
      default:
        return {
          start: today,
          end: now
        };
    }
  }

  async getOrderStats(dateRange) {
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          averageOrderValue: { $avg: '$pricing.total' }
        }
      }
    ]);

    const previousPeriod = {
      start: new Date(dateRange.start.getTime() - (dateRange.end - dateRange.start)),
      end: dateRange.start
    };

    const previousStats = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: previousPeriod.start,
            $lte: previousPeriod.end
          }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$pricing.total' }
        }
      }
    ]);

    const current = stats[0] || {
      totalOrders: 0,
      pendingOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0,
      averageOrderValue: 0
    };

    const previous = previousStats[0] || {
      totalOrders: 0,
      averageOrderValue: 0
    };

    return {
      ...current,
      orderGrowth: previous.totalOrders > 0 ? 
        ((current.totalOrders - previous.totalOrders) / previous.totalOrders * 100).toFixed(2) : 0,
      aovGrowth: previous.averageOrderValue > 0 ?
        ((current.averageOrderValue - previous.averageOrderValue) / previous.averageOrderValue * 100).toFixed(2) : 0
    };
  }

  async getRevenueStats(dateRange) {
    const revenue = await Transaction.aggregate([
      {
        $match: {
          type: 'payment',
          status: 'completed',
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          dailyRevenue: { $sum: '$amount.value' },
          transactionCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    const totalRevenue = revenue.reduce((sum, day) => sum + day.dailyRevenue, 0);
    const totalTransactions = revenue.reduce((sum, day) => sum + day.transactionCount, 0);

    const refunds = await Transaction.aggregate([
      {
        $match: {
          type: 'refund',
          status: 'completed',
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRefunded: { $sum: '$amount.value' },
          refundCount: { $sum: 1 }
        }
      }
    ]);

    return {
      totalRevenue,
      netRevenue: totalRevenue - (refunds[0]?.totalRefunded || 0),
      totalTransactions,
      totalRefunded: refunds[0]?.totalRefunded || 0,
      refundCount: refunds[0]?.refundCount || 0,
      dailyRevenue: revenue,
      averageTransactionValue: totalTransactions > 0 ? totalRevenue / totalTransactions : 0
    };
  }

  async getCustomerStats(dateRange) {
    const newCustomers = await User.countDocuments({
      createdAt: {
        $gte: dateRange.start,
        $lte: dateRange.end
      }
    });

    const activeCustomers = await Order.distinct('user', {
      createdAt: {
        $gte: dateRange.start,
        $lte: dateRange.end
      }
    });

    const repeatCustomers = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          }
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
      },
      {
        $count: 'repeatCustomers'
      }
    ]);

    return {
      newCustomers,
      activeCustomers: activeCustomers.length,
      repeatCustomers: repeatCustomers[0]?.repeatCustomers || 0,
      repeatRate: activeCustomers.length > 0 ?
        ((repeatCustomers[0]?.repeatCustomers || 0) / activeCustomers.length * 100).toFixed(2) : 0
    };
  }

  async getProductStats(dateRange) {
    const productsSold = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          },
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          sku: '$product.sku',
          quantitySold: 1,
          revenue: 1
        }
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 10 }
    ]);

    const lowStock = await Product.find({
      'stock.trackInventory': true,
      $expr: { $lte: ['$stock.available', '$stock.lowStockThreshold'] }
    })
    .select('name sku stock.available stock.lowStockThreshold')
    .limit(10);

    return {
      topSellingProducts: productsSold,
      lowStockProducts: lowStock,
      totalProductsSold: productsSold.reduce((sum, p) => sum + p.quantitySold, 0)
    };
  }

  async getRecentOrders(limit = 10) {
    return Order.find()
      .sort('-createdAt')
      .limit(limit)
      .populate('user', 'email')
      .select('orderNumber status pricing.total createdAt user');
  }

  async getTopProducts(dateRange, limit = 5) {
    return Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: dateRange.start,
            $lte: dateRange.end
          },
          status: { $ne: 'cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          revenue: { $sum: '$items.total' },
          unitsSold: { $sum: '$items.quantity' },
          orderCount: { $sum: 1 }
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
      { $unwind: '$product' },
      {
        $project: {
          product: {
            _id: '$product._id',
            name: '$product.name',
            sku: '$product.sku',
            image: { $arrayElemAt: ['$product.images.url', 0] }
          },
          revenue: 1,
          unitsSold: 1,
          orderCount: 1
        }
      }
    ]);
  }

  async getOrdersByStatus() {
    return Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalValue: { $sum: '$pricing.total' }
        }
      },
      {
        $project: {
          status: '$_id',
          count: 1,
          totalValue: 1,
          _id: 0
        }
      }
    ]);
  }

  async getSalesTrend(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
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
          sales: { $sum: '$pricing.total' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          sales: 1,
          orders: 1,
          _id: 0
        }
      }
    ]);
  }
}

module.exports = new AdminDashboardService();