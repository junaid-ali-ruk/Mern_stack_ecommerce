const shippingService = require('../services/shippingService');
const ShippingMethod = require('../models/ShippingMethod');

exports.calculateShipping = async (req, res) => {
  try {
    const { cartId, destination, method } = req.body;

    const Cart = require('../models/Cart');
    const cart = await Cart.findById(cartId);

    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const rates = await shippingService.calculateShippingCost(
      cart,
      destination,
      method
    );

    res.json({
      success: true,
      rates
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPickupLocations = async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;

    const userLocation = latitude && longitude ? {
      coordinates: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      }
    } : null;

    const locations = await shippingService.getPickupLocations(
      userLocation,
      parseInt(radius)
    );

    res.json({
      success: true,
      locations
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.validatePickup = async (req, res) => {
  try {
    const { locationCode, pickupTime } = req.body;

    const availability = await shippingService.validatePickupAvailability(
      locationCode,
      pickupTime
    );

    res.json({
      success: true,
      ...availability
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getDeliverySlots = async (req, res) => {
  try {
    const { zone, startDate, days = 7 } = req.query;

    const slots = await shippingService.getAvailableDeliverySlots(
      zone,
      startDate ? new Date(startDate) : new Date(),
      parseInt(days)
    );

    res.json({
      success: true,
      slots
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.bookDeliverySlot = async (req, res) => {
  try {
    const { slotId, orderId } = req.body;

    const booking = await shippingService.bookDeliverySlot(
      slotId,
      orderId,
      req.userId
    );

    res.json({
      success: true,
      booking
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createShippingMethod = async (req, res) => {
  try {
    const method = await ShippingMethod.create(req.body);

    res.status(201).json({
      success: true,
      method
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateShippingMethod = async (req, res) => {
  try {
    const { methodId } = req.params;

    const method = await ShippingMethod.findByIdAndUpdate(
      methodId,
      req.body,
      { new: true, runValidators: true }
    );

    if (!method) {
      return res.status(404).json({ message: 'Shipping method not found' });
    }

    res.json({
      success: true,
      method
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getShippingMethods = async (req, res) => {
  try {
    const { enabled = true } = req.query;

    const methods = await ShippingMethod.find({
      enabled: enabled === 'true'
    }).sort('displayOrder');

    res.json({
      success: true,
      methods
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateDeliverySlots = async (req, res) => {
  try {
    const { methodId } = req.params;
    const { startDate, endDate, config } = req.body;

    const slots = await shippingService.generateDeliverySlots(
      methodId,
      new Date(startDate),
      new Date(endDate),
      config
    );

    res.json({
      success: true,
      slotsGenerated: slots.length
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.trackShipment = async (req, res) => {
  try {
    const { carrier, trackingNumber } = req.params;

    const tracking = {
      carrier,
      trackingNumber,
      status: 'in_transit',
      currentLocation: 'Distribution Center',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      events: [
        {
          status: 'picked_up',
          location: 'Origin Facility',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          description: 'Package picked up'
        },
        {
          status: 'in_transit',
          location: 'Distribution Center',
          timestamp: new Date(),
          description: 'Package in transit'
        }
      ]
    };

    res.json({
      success: true,
      tracking
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.calculateInsurance = async (req, res) => {
  try {
    const { value, shippingMethod } = req.body;

    const method = await ShippingMethod.findOne({ code: shippingMethod });

    if (!method || !method.insurance.available) {
      return res.json({
        success: false,
        message: 'Insurance not available for this shipping method'
      });
    }

    const insuranceCost = Math.min(
      value * method.insurance.rate,
      method.insurance.maxCoverage * method.insurance.rate
    );

    res.json({
      success: true,
      insuranceCost,
      coverage: Math.min(value, method.insurance.maxCoverage),
      mandatory: method.insurance.mandatory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};