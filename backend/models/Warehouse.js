const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  reserved: {
    type: Number,
    default: 0,
    min: 0
  },
  available: {
    type: Number,
    default: 0
  },
  location: {
    aisle: String,
    rack: String,
    bin: String
  },
  lastRestocked: Date,
  reorderPoint: Number,
  reorderQuantity: Number
});

const warehouseSchema = new mongoose.Schema({
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
    enum: ['main', 'regional', 'distribution', 'fulfillment', 'returns'],
    default: 'main'
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
    manager: String,
    phone: String,
    email: String
  },
  operatingHours: [{
    dayOfWeek: Number,
    open: String,
    close: String
  }],
  capacity: {
    total: Number,
    used: Number,
    available: Number,
    units: {
      type: String,
      enum: ['sqft', 'sqm', 'pallets', 'units'],
      default: 'sqft'
    }
  },
  inventory: [inventorySchema],
  zones: [{
    name: String,
    postalCodes: [String],
    deliveryRadius: Number
  }],
  carriers: [{
    name: String,
    enabled: Boolean,
    priority: Number,
    cutoffTime: String
  }],
  capabilities: {
    shipping: Boolean,
    receiving: Boolean,
    returns: Boolean,
    crossDocking: Boolean,
    kitting: Boolean,
    customPackaging: Boolean
  },
  performance: {
    averageFulfillmentTime: Number,
    accuracy: Number,
    onTimeDelivery: Number
  },
  costs: {
    storage: {
      rate: Number,
      unit: String
    },
    handling: {
      inbound: Number,
      outbound: Number
    },
    packaging: {
      standard: Number,
      custom: Number,
      gift: Number
    }
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

warehouseSchema.index({ code: 1 });
warehouseSchema.index({ 'address.coordinates': '2dsphere' });
warehouseSchema.index({ active: 1 });

warehouseSchema.methods.checkStock = function(productId, variantId, quantity) {
  const item = this.inventory.find(i => 
    i.product.toString() === productId.toString() &&
    (!variantId || i.variant?.toString() === variantId)
  );
  
  return item ? item.available >= quantity : false;
};

warehouseSchema.methods.reserveStock = async function(items) {
  const reservations = [];
  
  for (const item of items) {
    const inventoryItem = this.inventory.find(i =>
      i.product.toString() === item.productId.toString() &&
      (!item.variantId || i.variant?.toString() === item.variantId)
    );
    
    if (!inventoryItem || inventoryItem.available < item.quantity) {
      throw new Error(`Insufficient stock in warehouse ${this.name}`);
    }
    
    inventoryItem.reserved += item.quantity;
    inventoryItem.available = inventoryItem.quantity - inventoryItem.reserved;
    
    reservations.push({
      warehouseId: this._id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity
    });
  }
  
  await this.save();
  return reservations;
};

warehouseSchema.methods.canDeliverTo = function(destination) {
  if (!this.zones || this.zones.length === 0) return true;
  
  for (const zone of this.zones) {
    if (zone.postalCodes.includes(destination.postalCode)) {
      return true;
    }
    
    if (zone.deliveryRadius && this.address.coordinates && destination.coordinates) {
      const distance = this.calculateDistance(destination.coordinates);
      if (distance <= zone.deliveryRadius) {
        return true;
      }
    }
  }
  
  return false;
};

warehouseSchema.methods.calculateDistance = function(coordinates) {
  const R = 6371;
  const dLat = (coordinates.latitude - this.address.coordinates.latitude) * Math.PI / 180;
  const dLon = (coordinates.longitude - this.address.coordinates.longitude) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.address.coordinates.latitude * Math.PI / 180) * 
            Math.cos(coordinates.latitude * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

module.exports = mongoose.model('Warehouse', warehouseSchema);