const adminDashboardService = require('../services/adminDashboardService');
const deliveryService = require('../services/deliveryService');
const Address = require('../models/Address');

exports.getAdminDashboard = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    
    const dashboard = await adminDashboardService.getOverview(period);

    res.json({
      success: true,
      dashboard
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrdersByStatus = async (req, res) => {
  try {
    const orders = await adminDashboardService.getOrdersByStatus();

    res.json({
      success: true,
      orders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSalesTrend = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const trend = await adminDashboardService.getSalesTrend(parseInt(days));

    res.json({
      success: true,
      trend
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.calculateDeliveryEstimate = async (req, res) => {
  try {
    const { origin, destination, method, carrier } = req.body;

    const estimate = await deliveryService.calculateDeliveryDate(
      origin,
      destination,
      method,
      carrier
    );

    res.json({
      success: true,
      estimate
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackShipment = async (req, res) => {
  try {
    const { carrier, trackingNumber } = req.params;

    const tracking = await deliveryService.trackShipment(carrier, trackingNumber);

    res.json({
      success: true,
      tracking
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUserAddresses = async (req, res) => {
  try {
    const addresses = await Address.getUserAddresses(req.userId);

    res.json({
      success: true,
      addresses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const addressData = {
      ...req.body,
      user: req.userId
    };

    const address = await Address.create(addressData);

    res.status(201).json({
      success: true,
      address
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOneAndUpdate(
      { _id: addressId, user: req.userId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json({
      success: true,
      address
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOneAndDelete({
      _id: addressId,
      user: req.userId
    });

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json({
      success: true,
      message: 'Address deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.params;

    const address = await Address.findOne({
      _id: addressId,
      user: req.userId
    });

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    address.isDefault = true;
    await address.save();

    res.json({
      success: true,
      address
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};