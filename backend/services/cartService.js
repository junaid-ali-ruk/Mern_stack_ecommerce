const Cart = require('../models/Cart');
const Product = require('../models/Product');
const stockService = require('./stockService');
const Decimal = require('decimal.js');
const NodeCache = require('node-cache');

class CartService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 300 });
  }

  async getCart(identifier) {
    const cacheKey = `cart_${identifier.userId || identifier.sessionId}`;
    let cart = this.cache.get(cacheKey);

    if (!cart) {
      cart = await Cart.findOrCreate(identifier);
      await cart.populate([
        {
          path: 'items.product',
          select: 'name slug images basePrice comparePrice stock status'
        }
      ]);
      this.cache.set(cacheKey, cart);
    }

    await this.validateCartItems(cart);
    return cart;
  }

  async addToCart(identifier, productId, quantity = 1, options = {}) {
    const cart = await this.getCart(identifier);
    
    const availability = await stockService.checkAvailability(
      productId, 
      quantity, 
      options.variantId
    );

    if (!availability.available) {
      throw new Error(`Only ${availability.inStock} items available`);
    }

    await cart.addItem(productId, quantity, options);

    if (options.reserveStock) {
      try {
        const reservation = await stockService.reserveStock([{
          productId,
          variantId: options.variantId,
          quantity
        }]);

        const item = cart.items[cart.items.length - 1];
        item.reservationId = reservation[0].reservationId;
        item.reservationExpiry = new Date(Date.now() + 15 * 60 * 1000);
        await cart.save();
      } catch (error) {
        console.error('Stock reservation failed:', error);
      }
    }

    this.invalidateCache(identifier);
    
    await cart.populate([
      {
        path: 'items.product',
        select: 'name slug images basePrice comparePrice stock status'
      }
    ]);

    return cart;
  }

  async removeFromCart(identifier, itemId) {
    const cart = await this.getCart(identifier);
    await cart.removeItem(itemId);
    
    this.invalidateCache(identifier);
    
    await cart.populate([
      {
        path: 'items.product',
        select: 'name slug images basePrice comparePrice stock status'
      }
    ]);

    return cart;
  }

  async updateCartItemQuantity(identifier, itemId, quantity) {
    const cart = await this.getCart(identifier);
    const item = cart.items.id(itemId);
    
    if (!item) {
      throw new Error('Item not found in cart');
    }

    const availability = await stockService.checkAvailability(
      item.product, 
      quantity, 
      item.variant
    );

    if (!availability.available) {
      throw new Error(`Only ${availability.inStock} items available`);
    }

    await cart.updateItemQuantity(itemId, quantity);
    
    this.invalidateCache(identifier);
    
    await cart.populate([
      {
        path: 'items.product',
        select: 'name slug images basePrice comparePrice stock status'
      }
    ]);

    return cart;
  }

  async clearCart(identifier) {
    const cart = await this.getCart(identifier);
    await cart.clear();
    
    this.invalidateCache(identifier);
    
    return cart;
  }

  async mergeCarts(userId, sessionId) {
    const userCart = await Cart.findOne({ user: userId, abandoned: false });
    const sessionCart = await Cart.findOne({ sessionId, abandoned: false });

    if (!sessionCart || sessionCart.items.length === 0) {
      return userCart;
    }

    if (!userCart) {
      sessionCart.user = userId;
      sessionCart.sessionId = undefined;
      await sessionCart.save();
      return sessionCart;
    }

    await userCart.merge(sessionCart);
    
    this.invalidateCache({ userId });
    this.invalidateCache({ sessionId });
    
    return userCart;
  }

  async validateCartItems(cart) {
    const updates = [];
    const removals = [];

    for (const item of cart.items) {
      const product = await Product.findById(item.product);
      
      if (!product || product.status !== 'published') {
        removals.push(item._id);
        continue;
      }

      let currentPrice = product.basePrice;
      
      if (item.variant) {
        const variant = product.variants.id(item.variant);
        if (!variant || !variant.isActive) {
          removals.push(item._id);
          continue;
        }
        currentPrice = variant.price;
      }

      if (item.price !== currentPrice) {
        updates.push({
          itemId: item._id,
          oldPrice: item.price,
          newPrice: currentPrice
        });
        item.price = currentPrice;
      }

      const availability = await stockService.checkAvailability(
        product._id,
        item.quantity,
        item.variant
      );

      if (!availability.available && !availability.allowBackorder) {
        if (availability.inStock > 0) {
          item.quantity = availability.inStock;
          updates.push({
            itemId: item._id,
            type: 'quantity',
            newQuantity: availability.inStock
          });
        } else {
          removals.push(item._id);
        }
      }
    }

    for (const itemId of removals) {
      cart.items.pull(itemId);
    }

    if (updates.length > 0 || removals.length > 0) {
      await cart.save();
    }

    return { updates, removals };
  }

  async applyCoupon(identifier, couponCode) {
    const cart = await this.getCart(identifier);
    
    const coupon = await this.validateCoupon(couponCode, cart);
    
    const existingCoupon = cart.couponCodes.find(c => c.code === couponCode);
    if (existingCoupon) {
      throw new Error('Coupon already applied');
    }

    cart.couponCodes.push({
      code: couponCode,
      discount: coupon.discount,
      type: coupon.type,
      appliedAt: new Date()
    });

    await cart.save();
    this.invalidateCache(identifier);
    
    return cart;
  }

  async removeCoupon(identifier, couponCode) {
    const cart = await this.getCart(identifier);
    
    const couponIndex = cart.couponCodes.findIndex(c => c.code === couponCode);
    if (couponIndex === -1) {
      throw new Error('Coupon not found');
    }

    cart.couponCodes.splice(couponIndex, 1);
    await cart.save();
    
    this.invalidateCache(identifier);
    
    return cart;
  }

  async validateCoupon(code, cart) {
    return {
      code,
      discount: 10,
      type: 'percentage',
      valid: true
    };
  }

  async getCartSummary(identifier) {
    const cart = await this.getCart(identifier);
    
    const summary = {
      itemCount: cart.itemCount,
      uniqueItemCount: cart.uniqueItemCount,
      totals: cart.totals,
      savings: cart.totalSavings,
      appliedCoupons: cart.couponCodes.length,
      estimatedDelivery: this.calculateEstimatedDelivery()
    };

    return summary;
  }

  calculateEstimatedDelivery() {
    const businessDays = 5;
    const date = new Date();
    let daysAdded = 0;
    
    while (daysAdded < businessDays) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) {
        daysAdded++;
      }
    }
    
    return date;
  }

  async getAbandonedCarts(hours = 24) {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const abandonedCarts = await Cart.find({
      abandoned: false,
      items: { $ne: [] },
      updatedAt: { $lte: cutoffDate }
    })
    .populate('user', 'email')
    .populate('items.product', 'name price');

    for (const cart of abandonedCarts) {
      await cart.checkAbandonment();
    }

    return abandonedCarts;
  }

  async recoverCart(cartId, userId = null) {
    const cart = await Cart.findById(cartId);
    
    if (!cart) {
      throw new Error('Cart not found');
    }

    cart.abandoned = false;
    cart.abandonedAt = undefined;
    
    if (userId) {
      cart.user = userId;
    }

    await cart.save();
    return cart;
  }

  invalidateCache(identifier) {
    const cacheKey = `cart_${identifier.userId || identifier.sessionId}`;
    this.cache.del(cacheKey);
  }

  async cleanupExpiredReservations() {
    const carts = await Cart.find({
      'items.reservationExpiry': { $lte: new Date() }
    });

    for (const cart of carts) {
      const expiredItems = cart.items.filter(item => 
        item.reservationExpiry && item.reservationExpiry <= new Date()
      );

      if (expiredItems.length > 0) {
        const itemsToRelease = expiredItems.map(item => ({
          productId: item.product,
          variantId: item.variant,
          quantity: item.quantity
        }));

        await stockService.releaseStock(itemsToRelease);

        expiredItems.forEach(item => {
          item.reservationId = undefined;
          item.reservationExpiry = undefined;
        });

        await cart.save();
      }
    }

    return carts.length;
  }
}

module.exports = new CartService();