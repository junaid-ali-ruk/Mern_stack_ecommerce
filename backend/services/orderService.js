const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const stockService = require('./stockService');
const paymentService = require('./paymentService');
const invoiceService = require('./invoiceService');
const emailService = require('./emailService');
const mongoose = require('mongoose');

class OrderService {
  async createOrder(orderData) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const cart = await Cart.findById(orderData.cartId).populate('items.product');
      
      if (!cart || cart.items.length === 0) {
        throw new Error('Cart is empty or not found');
      }
      
      const stockReservations = await this.validateAndReserveStock(cart.items);
      
      const orderItems = await this.prepareOrderItems(cart.items);
      
      const pricing = await this.calculatePricing(
        orderItems,
        orderData.shippingMethod,
        orderData.couponCodes
      );
      
      const order = new Order({
        user: orderData.userId,
        items: orderItems,
        status: 'pending',
        payment: {
          method: orderData.paymentMethod,
          status: 'pending'
        },
        pricing,
        addresses: {
          billing: orderData.billingAddress,
          shipping: orderData.shippingAddress || orderData.billingAddress
        },
        fulfillment: {
          type: orderData.fulfillmentType || 'delivery',
          expectedDelivery: this.calculateExpectedDelivery(orderData.shippingMethod)
        },
        notes: {
          customer: orderData.customerNotes
        },
        metadata: {
          source: orderData.source || 'web',
          deviceType: orderData.deviceType,
          ipAddress: orderData.ipAddress,
          userAgent: orderData.userAgent,
          affiliateCode: orderData.affiliateCode,
          utmParams: orderData.utmParams
        },
        flags: {
          isFirstOrder: await this.isFirstOrder(orderData.userId),
          giftOrder: orderData.isGift || false
        }
      });
      
      await order.save({ session });
      
      if (orderData.paymentMethod === 'cod') {
        order.payment.status = 'pending';
        order.status = 'confirmed';
      } else {
        const paymentResult = await paymentService.processPayment({
          orderId: order._id,
          amount: order.pricing.total,
          method: orderData.paymentMethod,
          paymentDetails: orderData.paymentDetails
        });
        
        order.payment.status = paymentResult.status;
        order.payment.transactionId = paymentResult.transactionId;
        order.payment.paymentIntentId = paymentResult.paymentIntentId;
        
        if (paymentResult.status === 'completed') {
          order.payment.paidAt = new Date();
          order.status = 'confirmed';
          
          await stockService.commitStock(stockReservations);
        } else {
          throw new Error('Payment failed');
        }
      }
      
      await order.save({ session });
      
      await cart.clear();
      
      await session.commitTransaction();
      
      await this.sendOrderConfirmation(order);
      
      return order;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async validateAndReserveStock(items) {
    const reservations = [];
    
    for (const item of items) {
      const availability = await stockService.checkAvailability(
        item.product._id,
        item.quantity,
        item.variant
      );
      
      if (!availability.available) {
        throw new Error(`${item.product.name} is out of stock`);
      }
      
      reservations.push({
        productId: item.product._id,
        variantId: item.variant,
        quantity: item.quantity
      });
    }
    
    return await stockService.reserveStock(reservations);
  }

  async prepareOrderItems(cartItems) {
    const orderItems = [];
    
    for (const item of cartItems) {
      const product = await Product.findById(item.product._id);
      
      let price = product.basePrice;
      let sku = product.sku;
      
      if (item.variant) {
        const variant = product.variants.id(item.variant);
        price = variant.price;
        sku = variant.sku;
      }
      
      orderItems.push({
        product: item.product._id,
        variant: item.variant,
        productSnapshot: {
          name: product.name,
          sku: sku,
          image: product.images[0]?.url,
          category: product.category
        },
        quantity: item.quantity,
        price: price,
        comparePrice: item.comparePrice,
        discount: item.discount,
        tax: {
          rate: 0.08,
          amount: 0
        },
        customization: item.customization,
        gift: item.gift
      });
    }
    
    return orderItems;
  }

  async calculatePricing(items, shippingMethod, couponCodes = []) {
    let subtotal = 0;
    let totalDiscount = 0;
    
    for (const item of items) {
      subtotal += item.price * item.quantity;
      if (item.discount?.amount) {
        totalDiscount += item.discount.amount;
      }
    }
    
    const couponDiscount = await this.applyCoupons(subtotal, couponCodes);
    totalDiscount += couponDiscount.amount;
    
    const taxableAmount = subtotal - totalDiscount;
    const taxAmount = taxableAmount * 0.08;
    
    const shippingCost = await this.calculateShipping(items, shippingMethod);
    
    const total = subtotal - totalDiscount + taxAmount + shippingCost;
    
    return {
      subtotal,
      discount: {
        amount: totalDiscount,
        codes: couponDiscount.codes
      },
      tax: {
        rate: 0.08,
        amount: taxAmount
      },
      shipping: {
        method: shippingMethod,
        cost: shippingCost
      },
      total
    };
  }

  async applyCoupons(subtotal, couponCodes) {
    let totalDiscount = 0;
    const appliedCodes = [];
    
    for (const code of couponCodes) {
      appliedCodes.push({
        code,
        amount: subtotal * 0.1,
        type: 'percentage'
      });
      totalDiscount += subtotal * 0.1;
    }
    
    return {
      amount: totalDiscount,
      codes: appliedCodes
    };
  }

  async calculateShipping(items, method) {
    const shippingRates = {
      standard: 5.99,
      express: 14.99,
      overnight: 29.99,
      free: 0
    };
    
    return shippingRates[method] || 5.99;
  }

  calculateExpectedDelivery(shippingMethod) {
    const deliveryDays = {
      standard: 5,
      express: 2,
      overnight: 1
    };
    
    const days = deliveryDays[shippingMethod] || 5;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + days);
    
    return expectedDate;
  }

  async isFirstOrder(userId) {
    const orderCount = await Order.countDocuments({ 
      user: userId,
      status: { $ne: 'cancelled' }
    });
    
    return orderCount === 0;
  }

  async sendOrderConfirmation(order) {
    await order.populate('user', 'email');
    
    await emailService.sendOrderConfirmation(
      order.user.email,
      order
    );
  }

  async getOrder(orderId, userId = null) {
    const query = { _id: orderId };
    
    if (userId) {
      query.user = userId;
    }
    
    const order = await Order.findOne(query)
      .populate('items.product', 'name slug images')
      .populate('user', 'email phone');
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    return order;
  }

  async getUserOrders(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      sort = '-createdAt'
    } = options;
    
    const query = { user: userId };
    
    if (status) {
      query.status = status;
    }
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const orders = await Order.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('items.product', 'name slug images')
      .select('-payment.paymentDetails');
    
    const total = await Order.countDocuments(query);
    
    return {
      orders,
      totalOrders: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1
    };
  }

  async updateOrderStatus(orderId, newStatus, userId, note) {
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    await order.updateStatus(newStatus, note, userId);
    
    await this.sendStatusUpdateNotification(order);
    
    return order;
  }

  async cancelOrder(orderId, userId, reason) {
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    if (order.user.toString() !== userId.toString()) {
      const user = await User.findById(userId);
      if (!['admin', 'manager'].includes(user.role)) {
        throw new Error('Unauthorized to cancel this order');
      }
    }
    
    await order.cancel(userId, reason);
    
    await this.sendCancellationNotification(order);
    
    return order;
  }

  async requestRefund(orderId, userId, refundData) {
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    if (order.user.toString() !== userId.toString()) {
      throw new Error('Unauthorized to request refund for this order');
    }
    
    const refund = await order.requestRefund(refundData);
    
    await this.sendRefundRequestNotification(order, refund);
    
    return refund;
  }

  async processRefund(orderId, refundId, approved, userId, notes) {
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    const refund = await order.processRefund(refundId, approved, userId, notes);
    
    await this.sendRefundStatusNotification(order, refund);
    
    return refund;
  }

  async generateInvoice(orderId) {
    const order = await Order.findById(orderId)
      .populate('user', 'email name')
      .populate('items.product', 'name sku');
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    const invoiceData = order.generateInvoiceData();
    const invoiceUrl = await invoiceService.generateInvoice(invoiceData);
    
    order.invoice = {
      number: `INV-${order.orderNumber}`,
      generatedAt: new Date(),
      url: invoiceUrl
    };
    
    await order.save();
    
    return invoiceUrl;
  }

  async sendStatusUpdateNotification(order) {
    await order.populate('user', 'email');
    
    const templates = {
      confirmed: 'orderConfirmed',
      processing: 'orderProcessing',
      shipped: 'orderShipped',
      delivered: 'orderDelivered',
      cancelled: 'orderCancelled'
    };
    
    const template = templates[order.status];
    if (template) {
      await emailService.sendEmail(
        order.user.email,
        template,
        { order }
      );
    }
  }

  async sendCancellationNotification(order) {
    await order.populate('user', 'email');
    
    await emailService.sendEmail(
      order.user.email,
      'orderCancelled',
      {
        order,
        reason: order.cancellationReason
      }
    );
  }

  async sendRefundRequestNotification(order, refund) {
    await order.populate('user', 'email');
    
    await emailService.sendEmail(
      order.user.email,
      'refundRequested',
      {
        order,
        refund
      }
    );
  }

  async sendRefundStatusNotification(order, refund) {
    await order.populate('user', 'email');
    
    const template = refund.status === 'completed' ? 
      'refundCompleted' : 'refundRejected';
    
    await emailService.sendEmail(
      order.user.email,
      template,
      {
        order,
        refund
      }
    );
  }

  async getOrderAnalytics(filters = {}) {
    const pipeline = [];
    
    const matchStage = {};
    if (filters.startDate) {
      matchStage.createdAt = { $gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      matchStage.createdAt = { 
        ...matchStage.createdAt,
        $lte: new Date(filters.endDate)
      };
    }
    
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }
    
    pipeline.push(
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$pricing.total' },
          averageOrderValue: { $avg: '$pricing.total' },
          items: { $sum: { $size: '$items' } }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    );
    
    const analytics = await Order.aggregate(pipeline);
    
    return analytics;
  }
}

module.exports = new OrderService();