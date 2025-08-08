const ShippingMethod = require('../models/ShippingMethod');
const axios = require('axios');
const geolib = require('geolib');
const moment = require('moment-timezone');

class ShippingService {
  constructor() {
    this.carriers = {
      fedex: this.calculateFedExRate.bind(this),
      ups: this.calculateUPSRate.bind(this),
      usps: this.calculateUSPSRate.bind(this),
      dhl: this.calculateDHLRate.bind(this)
    };
  }

  async calculateShippingCost(cart, destination, method = null) {
    const weight = await this.calculateTotalWeight(cart);
    const dimensions = await this.calculatePackageDimensions(cart);
    const zone = await this.determineShippingZone(destination);

    let shippingMethods;
    
    if (method) {
      shippingMethods = await ShippingMethod.find({ 
        code: method,
        enabled: true
      });
    } else {
      shippingMethods = await ShippingMethod.find({ 
        enabled: true
      }).sort('displayOrder');
    }

    const rates = [];

    for (const shippingMethod of shippingMethods) {
      const rate = await this.calculateMethodRate(
        shippingMethod,
        cart,
        weight,
        dimensions,
        zone,
        destination
      );

      if (rate) {
        rates.push(rate);
      }
    }

    return rates.sort((a, b) => a.cost - b.cost);
  }

  async calculateMethodRate(method, cart, weight, dimensions, zone, destination) {
    if (this.checkFreeShipping(method, cart)) {
      return {
        method: method.name,
        code: method.code,
        cost: 0,
        estimatedDays: method.rates[0]?.estimatedDays || { min: 3, max: 5 },
        carrier: method.rates[0]?.carrier,
        isFree: true
      };
    }

    const applicableRate = method.rates.find(rate => 
      this.isRateApplicable(rate, zone, destination)
    );

    if (!applicableRate) {
      return null;
    }

    let cost = 0;

    switch (applicableRate.calculation) {
      case 'flat':
        cost = applicableRate.rates.flat;
        break;
      case 'weight':
        cost = this.calculateWeightBasedRate(weight, applicableRate.rates.weightBased);
        break;
      case 'price':
        cost = this.calculatePriceBasedRate(cart.totals.subtotal, applicableRate.rates.priceBased);
        break;
      case 'quantity':
        cost = this.calculateQuantityBasedRate(cart.itemCount, applicableRate.rates.quantityBased);
        break;
      case 'dimensional':
        cost = this.calculateDimensionalRate(weight, dimensions, applicableRate.rates.dimensional);
        break;
      case 'api':
        cost = await this.calculateAPIRate(applicableRate.carrier, destination, weight, dimensions);
        break;
    }

    return {
      method: method.name,
      code: method.code,
      cost,
      estimatedDays: applicableRate.estimatedDays,
      carrier: applicableRate.carrier,
      service: applicableRate.service
    };
  }

  checkFreeShipping(method, cart) {
    const freeShippingRules = method.rates.map(r => r.freeShipping).filter(fs => fs?.enabled);

    for (const rule of freeShippingRules) {
      if (rule.minOrderValue && cart.totals.subtotal >= rule.minOrderValue) {
        return true;
      }

      if (rule.minQuantity && cart.itemCount >= rule.minQuantity) {
        return true;
      }

      if (rule.applicableProducts?.length > 0) {
        const hasApplicableProduct = cart.items.some(item =>
          rule.applicableProducts.includes(item.product._id)
        );
        if (hasApplicableProduct) {
          return true;
        }
      }
    }

    return false;
  }

  calculateWeightBasedRate(weight, rates) {
    const applicableRate = rates.find(r => 
      weight >= r.min && weight <= r.max
    );
    return applicableRate?.rate || 0;
  }

  calculatePriceBasedRate(price, rates) {
    const applicableRate = rates.find(r => 
      price >= r.min && price <= r.max
    );
    return applicableRate?.rate || 0;
  }

  calculateQuantityBasedRate(quantity, rates) {
    const applicableRate = rates.find(r => 
      quantity >= r.min && quantity <= r.max
    );
    return applicableRate?.rate || 0;
  }

  calculateDimensionalRate(weight, dimensions, config) {
    const dimensionalWeight = (dimensions.length * dimensions.width * dimensions.height) / config.factor;
    const chargeableWeight = Math.max(weight, dimensionalWeight);
    return Math.max(chargeableWeight * config.factor, config.minimumCharge);
  }

  async calculateAPIRate(carrier, destination, weight, dimensions) {
    if (this.carriers[carrier]) {
      return await this.carriers[carrier](destination, weight, dimensions);
    }
    return 0;
  }

  async calculateFedExRate(destination, weight, dimensions) {
    try {
      const response = await axios.post(process.env.FEDEX_API_URL, {
        accountNumber: process.env.FEDEX_ACCOUNT,
        destination,
        weight,
        dimensions
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.FEDEX_API_KEY}`
        }
      });

      return response.data.rate;
    } catch (error) {
      console.error('FedEx API error:', error);
      return null;
    }
  }

  async calculateUPSRate(destination, weight, dimensions) {
    return null;
  }

  async calculateUSPSRate(destination, weight, dimensions) {
    return null;
  }

  async calculateDHLRate(destination, weight, dimensions) {
    return null;
  }

  async calculateTotalWeight(cart) {
    let totalWeight = 0;

    for (const item of cart.items) {
      const product = await mongoose.model('Product').findById(item.product);
      if (product?.weight?.value) {
        totalWeight += product.weight.value * item.quantity;
      }
    }

    return totalWeight || 1;
  }

  async calculatePackageDimensions(cart) {
    let totalVolume = 0;
    let maxLength = 0;
    let maxWidth = 0;
    let maxHeight = 0;

    for (const item of cart.items) {
      const product = await mongoose.model('Product').findById(item.product);
      if (product?.dimensions) {
        const dims = product.dimensions;
        totalVolume += (dims.length * dims.width * dims.height) * item.quantity;
        maxLength = Math.max(maxLength, dims.length);
        maxWidth = Math.max(maxWidth, dims.width);
        maxHeight = Math.max(maxHeight, dims.height);
      }
    }

    return {
      length: maxLength || 10,
      width: maxWidth || 10,
      height: Math.max(maxHeight, Math.cbrt(totalVolume)) || 10,
      volume: totalVolume
    };
  }

  async determineShippingZone(destination) {
    const zones = await ShippingMethod.distinct('zones');
    
    for (const zone of zones) {
      if (zone.countries?.includes(destination.country)) {
        if (zone.states?.includes(destination.state)) {
          return zone;
        }
        if (zone.postalCodes?.some(pc => 
          destination.postalCode >= pc.from && destination.postalCode <= pc.to
        )) {
          return zone;
        }
        if (zone.cities?.includes(destination.city)) {
          return zone;
        }
        return zone;
      }
    }

    return null;
  }

  isRateApplicable(rate, zone, destination) {
    return true;
  }

  async getPickupLocations(userLocation = null, radius = 10) {
    const methods = await ShippingMethod.find({
      type: 'pickup',
      enabled: true,
      'pickupLocations.active': true
    });

    let locations = [];

    methods.forEach(method => {
      locations = locations.concat(method.pickupLocations.filter(loc => loc.active));
    });

    if (userLocation && userLocation.coordinates) {
      locations = locations.filter(location => {
        if (!location.address.coordinates) return true;
        
        const distance = geolib.getDistance(
          userLocation.coordinates,
          location.address.coordinates
        );

        return distance <= radius * 1000;
      }).map(location => ({
        ...location.toObject(),
        distance: geolib.getDistance(
          userLocation.coordinates,
          location.address.coordinates
        )
      })).sort((a, b) => a.distance - b.distance);
    }

    return locations;
  }

  async bookDeliverySlot(slotId, orderId, userId) {
    const ShippingMethod = mongoose.model('ShippingMethod');
    
    const method = await ShippingMethod.findOne({
      'deliverySlots._id': slotId
    });

    if (!method) {
      throw new Error('Delivery slot not found');
    }

    const slot = method.deliverySlots.id(slotId);

    if (slot.status !== 'available' || slot.available <= 0) {
      throw new Error('Delivery slot is not available');
    }

    slot.bookings.push({
      order: orderId,
      customer: userId,
      bookedAt: new Date()
    });

    slot.booked += 1;
    slot.available = slot.capacity - slot.booked;

    if (slot.available === 0) {
      slot.status = 'full';
    }

    await method.save();

    return {
      slotId: slot._id,
      date: slot.date,
      time: `${slot.startTime} - ${slot.endTime}`,
      price: slot.price
    };
  }

  async getAvailableDeliverySlots(zone, startDate = new Date(), days = 7) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + days);

    const methods = await ShippingMethod.find({
      type: 'scheduled',
      enabled: true,
      'deliverySlots.date': {
        $gte: startDate,
        $lte: endDate
      },
      'deliverySlots.status': 'available',
      'deliverySlots.available': { $gt: 0 }
    });

    const slots = [];

    methods.forEach(method => {
      method.deliverySlots.forEach(slot => {
        if (slot.date >= startDate && 
            slot.date <= endDate && 
            slot.status === 'available' &&
            slot.available > 0) {
          slots.push({
            id: slot._id,
            methodId: method._id,
            methodName: method.name,
            date: slot.date,
            startTime: slot.startTime,
            endTime: slot.endTime,
            available: slot.available,
            price: slot.price
          });
        }
      });
    });

    return slots.sort((a, b) => a.date - b.date);
  }

  async generateDeliverySlots(methodId, startDate, endDate, config) {
    const method = await ShippingMethod.findById(methodId);
    
    if (!method) {
      throw new Error('Shipping method not found');
    }

    const slots = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      if (!config.excludedDates?.includes(current.toDateString())) {
        const dayOfWeek = current.getDay();
        
        if (!config.daysOfWeek || config.daysOfWeek.includes(dayOfWeek)) {
          for (const timeSlot of config.timeSlots) {
            slots.push({
              date: new Date(current),
              startTime: timeSlot.start,
              endTime: timeSlot.end,
              capacity: config.capacity,
              price: config.price || 0,
              zone: config.zone
            });
          }
        }
      }
      
      current.setDate(current.getDate() + 1);
    }

    method.deliverySlots.push(...slots);
    await method.save();

    return slots;
  }

  async validatePickupAvailability(locationCode, requestedTime) {
    const methods = await ShippingMethod.findOne({
      'pickupLocations.code': locationCode
    });

    if (!methods) {
      throw new Error('Pickup location not found');
    }

    const location = methods.pickupLocations.find(loc => loc.code === locationCode);

    if (!location.active) {
      throw new Error('Pickup location is not active');
    }

    const requestedDate = new Date(requestedTime);
    const dayOfWeek = requestedDate.getDay();
    const time = moment(requestedDate).format('HH:mm');

    const operatingHours = location.operatingHours.find(oh => oh.dayOfWeek === dayOfWeek);

    if (!operatingHours) {
      throw new Error('Location is closed on requested day');
    }

    if (time < operatingHours.open || time > operatingHours.close) {
      throw new Error('Requested time is outside operating hours');
    }

    for (const breakTime of operatingHours.breaks || []) {
      if (time >= breakTime.start && time <= breakTime.end) {
        throw new Error('Requested time falls during break hours');
      }
    }

    return {
      available: true,
      location,
      pickupCode: this.generatePickupCode()
    };
  }

  generatePickupCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }
}

module.exports = new ShippingService();