const mongoose = require('mongoose');

const shippingZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  countries: [String],
  states: [String],
  postalCodes: [{
    from: String,
    to: String
  }],
  cities: [String]
});

const shippingRateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  carrier: {
    type: String,
    enum: ['fedex', 'ups', 'usps', 'dhl', 'local', 'custom'],
    required: true
  },
  service: String,
  calculation: {
    type: String,
    enum: ['flat', 'weight', 'price', 'quantity', 'dimensional', 'api'],
    required: true
  },
  rates: {
    flat: Number,
    weightBased: [{
      min: Number,
      max: Number,
      rate: Number
    }],
    priceBased: [{
      min: Number,
      max: Number,
      rate: Number
    }],
    quantityBased: [{
      min: Number,
      max: Number,
      rate: Number
    }],
    dimensional: {
      factor: Number,
      minimumCharge: Number
    }
  },
  freeShipping: {
    enabled: Boolean,
    minOrderValue: Number,
    minQuantity: Number,
    applicableProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    excludedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }]
  },
  estimatedDays: {
    min: Number,
    max: Number
  },
  cutoffTime: {
    hour: Number,
    minute: Number,
    timezone: String
  },
  availability: {
    daysOfWeek: [Number],
    excludedDates: [Date],
    startDate: Date,
    endDate: Date
  }
});

const pickupLocationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    unique: true,
    required: true
  },
  type: {
    type: String,
    enum: ['store', 'warehouse', 'partner', 'locker'],
    default: 'store'
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  contact: {
    phone: String,
    email: String,
    manager: String
  },
  operatingHours: [{
    dayOfWeek: Number,
    open: String,
    close: String,
    breaks: [{
      start: String,
      end: String
    }]
  }],
  capacity: {
    daily: Number,
    hourly: Number
  },
  services: [String],
  active: {
    type: Boolean,
    default: true
  }
});

const deliverySlotSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    index: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  booked: {
    type: Number,
    default: 0
  },
  available: {
    type: Number,
    default: function() {
      return this.capacity;
    }
  },
  zone: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShippingZone'
  },
  price: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['available', 'full', 'blocked'],
    default: 'available'
  },
  bookings: [{
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    bookedAt: Date
  }]
});

deliverySlotSchema.index({ date: 1, status: 1 });
deliverySlotSchema.index({ zone: 1, date: 1 });

const shippingMethodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    unique: true,
    required: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ['standard', 'express', 'overnight', 'pickup', 'scheduled'],
    required: true
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },
  zones: [shippingZoneSchema],
  rates: [shippingRateSchema],
  pickupLocations: [pickupLocationSchema],
  deliverySlots: [deliverySlotSchema],
  restrictions: {
    maxWeight: Number,
    maxDimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    restrictedProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    requiredDocuments: [String]
  },
  tracking: {
    enabled: Boolean,
    urlTemplate: String,
    apiEndpoint: String
  },
  insurance: {
    available: Boolean,
    mandatory: Boolean,
    rate: Number,
    maxCoverage: Number
  },
  displayOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

shippingMethodSchema.index({ code: 1, enabled: 1 });

module.exports = mongoose.model('ShippingMethod', shippingMethodSchema);