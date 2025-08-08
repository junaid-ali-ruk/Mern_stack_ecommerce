const orderService = require('../services/orderService');
const { validationResult } = require('express-validator');

exports.createOrder = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const orderData = {
      ...req.body,
      userId: req.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceType: req.device?.type
    };

    const order = await orderService.createOrder(orderData);

    res.status(201).json({
      success: true,
      order,
      message: 'Order created successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await orderService.getOrder(orderId, req.userId);

    res.json({
      success: true,
      order
    });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

exports.getUserOrders = async (req, res) => {
  try {
    const result = await orderService.getUserOrders(req.userId, req.query);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, note } = req.body;

    const order = await orderService.updateOrderStatus(
      orderId,
      status,
      req.userId,
      note
    );

    res.json({
      success: true,
      order,
      message: 'Order status updated successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await orderService.cancelOrder(
      orderId,
      req.userId,
      reason
    );

    res.json({
      success: true,
      order,
      message: 'Order cancelled successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.requestRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const refundData = req.body;

    const refund = await orderService.requestRefund(
      orderId,
      req.userId,
      refundData
    );

    res.json({
      success: true,
      refund,
      message: 'Refund request submitted successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.processRefund = async (req, res) => {
  try {
    const { orderId, refundId } = req.params;
    const { approved, notes } = req.body;

    const refund = await orderService.processRefund(
      orderId,
      refundId,
      approved,
      req.userId,
      notes
    );

    res.json({
      success: true,
      refund,
      message: `Refund ${approved ? 'approved' : 'rejected'} successfully`
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.generateInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;

    const invoiceUrl = await orderService.generateInvoice(orderId);

    res.json({
      success: true,
      invoiceUrl,
      message: 'Invoice generated successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await orderService.getOrder(orderId, req.userId);
    
    if (!order.invoice?.url) {
      await orderService.generateInvoice(orderId);
    }
    
    res.redirect(order.invoice.url);
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

exports.getOrderStats = async (req, res) => {
  try {
    const Order = require('../models/Order');
    const stats = await Order.getOrderStats(req.userId, req.query.period);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrderAnalytics = async (req, res) => {
  try {
    const analytics = await orderService.getOrderAnalytics(req.query);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    
    const Order = require('../models/Order');
    const order = await Order.findOne({ orderNumber })
      .select('orderNumber status statusHistory fulfillment createdAt');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json({
      success: true,
      tracking: {
        orderNumber: order.orderNumber,
        currentStatus: order.status,
        statusHistory: order.statusHistory,
        fulfillment: order.fulfillment,
        orderDate: order.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};