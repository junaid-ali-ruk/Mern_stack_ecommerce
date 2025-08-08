const Warehouse = require('../models/Warehouse');
const { Client } = require('@googlemaps/google-maps-services-js');
const geolib = require('geolib');

class AdvancedShippingService {
  constructor() {
    this.googleMapsClient = new Client({});
  }

  async findOptimalWarehouse(items, destination) {
    const warehouses = await Warehouse.find({ active: true });
    
    const eligibleWarehouses = [];
    
    for (const warehouse of warehouses) {
      let canFulfill = true;
      let totalStock = true;
      
      for (const item of items) {
        if (!warehouse.checkStock(item.productId, item.variantId, item.quantity)) {
          canFulfill = false;
          break;
        }
      }
      
      if (canFulfill && warehouse.canDeliverTo(destination)) {
        const distance = warehouse.calculateDistance(destination.coordinates);
        eligibleWarehouses.push({
          warehouse,
          distance,
          score: this.calculateWarehouseScore(warehouse, distance)
        });
      }
    }
    
    eligibleWarehouses.sort((a, b) => b.score - a.score);
    
    return eligibleWarehouses[0]?.warehouse || null;
  }

  calculateWarehouseScore(warehouse, distance) {
    let score = 100;
    
    score -= distance * 0.1;
    score += warehouse.performance.accuracy * 0.3;
    score += warehouse.performance.onTimeDelivery * 0.3;
    score -= warehouse.performance.averageFulfillmentTime * 0.2;
    
    return Math.max(0, score);
  }

  async allocateInventory(orderId, items, destination) {
    const allocations = [];
    const remainingItems = [...items];
    
    while (remainingItems.length > 0) {
      const warehouse = await this.findOptimalWarehouse(remainingItems, destination);
      
      if (!warehouse) {
        throw new Error('Unable to fulfill order from available warehouses');
      }
      
      const warehouseItems = [];
      const newRemainingItems = [];
      
      for (const item of remainingItems) {
        if (warehouse.checkStock(item.productId, item.variantId, item.quantity)) {
          warehouseItems.push(item);
        } else {
          const availableQty = warehouse.inventory.find(i =>
            i.product.toString() === item.productId.toString()
          )?.available || 0;
          
          if (availableQty > 0) {
            warehouseItems.push({
              ...item,
              quantity: availableQty
            });
            newRemainingItems.push({
              ...item,
              quantity: item.quantity - availableQty
            });
          } else {
            newRemainingItems.push(item);
          }
        }
      }
      
      if (warehouseItems.length > 0) {
        const reservation = await warehouse.reserveStock(warehouseItems);
        allocations.push({
          warehouse: warehouse._id,
          items: warehouseItems,
          reservation
        });
      }
      
      remainingItems.splice(0, remainingItems.length, ...newRemainingItems);
      
      if (allocations.length > 3) {
        throw new Error('Order requires too many shipments');
      }
    }
    
    return allocations;
  }

  async calculateLocalDelivery(origin, destination, items) {
    try {
      const response = await this.googleMapsClient.distancematrix({
        params: {
          origins: [`${origin.latitude},${origin.longitude}`],
          destinations: [`${destination.latitude},${destination.longitude}`],
          mode: 'driving',
          key: process.env.GOOGLE_MAPS_API_KEY
        }
      });
      
      const element = response.data.rows[0].elements[0];
      
      if (element.status === 'OK') {
        const distance = element.distance.value / 1000;
        const duration = element.duration.value / 60;
        
        const cost = this.calculateLocalDeliveryCost(distance, items);
        
        return {
          available: distance <= 50,
          distance,
          duration,
          cost,
          estimatedTime: this.calculateLocalDeliveryTime(duration)
        };
      }
    } catch (error) {
      console.error('Google Maps API error:', error);
    }
    
    return {
      available: false,
      reason: 'Unable to calculate local delivery'
    };
  }

  calculateLocalDeliveryCost(distance, items) {
    const baseCost = 5;
    const perKm = 0.5;
    const perItem = 0.2;
    
    let cost = baseCost + (distance * perKm);
    cost += items.reduce((sum, item) => sum + (item.quantity * perItem), 0);
    
    return Math.round(cost * 100) / 100;
  }

  calculateLocalDeliveryTime(duration) {
    const preparationTime = 30;
    const totalMinutes = duration + preparationTime;
    
    const deliveryTime = new Date();
    deliveryTime.setMinutes(deliveryTime.getMinutes() + totalMinutes);
    
    return {
      earliest: deliveryTime,
      latest: new Date(deliveryTime.getTime() + 30 * 60 * 1000)
    };
  }

  async calculatePackaging(items) {
    const packages = [];
    let currentPackage = {
      items: [],
      weight: 0,
      volume: 0,
      type: 'standard'
    };
    
    const maxWeight = 30;
    const maxVolume = 50000;
    
    for (const item of items) {
      const Product = mongoose.model('Product');
      const product = await Product.findById(item.productId);
      
      if (!product) continue;
      
      const itemWeight = (product.weight?.value || 0.1) * item.quantity;
      const itemVolume = product.dimensions ? 
        (product.dimensions.length * product.dimensions.width * product.dimensions.height) * item.quantity :
        1000 * item.quantity;
      
      if (currentPackage.weight + itemWeight > maxWeight || 
          currentPackage.volume + itemVolume > maxVolume) {
        if (currentPackage.items.length > 0) {
          packages.push(currentPackage);
        }
        currentPackage = {
          items: [],
          weight: 0,
          volume: 0,
          type: 'standard'
        };
      }
      
      currentPackage.items.push(item);
      currentPackage.weight += itemWeight;
      currentPackage.volume += itemVolume;
      
      if (item.gift) {
        currentPackage.type = 'gift';
      }
    }
    
    if (currentPackage.items.length > 0) {
      packages.push(currentPackage);
    }
    
    return packages.map(pkg => ({
      ...pkg,
      boxSize: this.determineBoxSize(pkg.volume),
      cost: this.calculatePackagingCost(pkg)
    }));
  }

  determineBoxSize(volume) {
    if (volume < 1000) return 'small';
    if (volume < 8000) return 'medium';
    if (volume < 27000) return 'large';
    return 'extra-large';
  }

  calculatePackagingCost(package) {
    const costs = {
      small: { standard: 0.5, gift: 2.5 },
      medium: { standard: 1.0, gift: 3.5 },
      large: { standard: 1.5, gift: 4.5 },
      'extra-large': { standard: 2.5, gift: 5.5 }
    };
    
    const boxSize = this.determineBoxSize(package.volume);
    return costs[boxSize][package.type];
  }

  async confirmDelivery(orderId, signature = null, photo = null, location = null) {
    const Order = mongoose.model('Order');
    const order = await Order.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    order.fulfillment.deliveredAt = new Date();
    order.fulfillment.status = 'delivered';
    order.status = 'delivered';
    
    order.fulfillment.deliveryConfirmation = {
      signature,
      photo,
      location,
      timestamp: new Date()
    };
    
    await order.save();
    
    await this.sendDeliveryConfirmation(order);
    
    return {
      confirmed: true,
      deliveredAt: order.fulfillment.deliveredAt
    };
  }

  async trackRealTimeShipment(trackingNumber, carrier) {
    const mockData = {
      status: 'in_transit',
      currentLocation: {
        city: 'New York',
        state: 'NY',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060
        }
      },
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      events: [
        {
          status: 'picked_up',
          location: 'Los Angeles, CA',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          description: 'Package picked up'
        },
        {
          status: 'in_transit',
          location: 'Phoenix, AZ',
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          description: 'Departed facility'
        },
        {
          status: 'in_transit',
          location: 'Dallas, TX',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
          description: 'Arrived at facility'
        },
        {
          status: 'in_transit',
          location: 'New York, NY',
          timestamp: new Date(),
          description: 'Out for delivery'
        }
      ],
      lastUpdate: new Date()
    };
    
    return mockData;
  }

  async sendDeliveryConfirmation(order) {
    const notificationService = require('./notificationService');
    await notificationService.sendDeliveryConfirmation(order);
  }
}

module.exports = new AdvancedShippingService();