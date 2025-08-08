const Cart = require('../models/Cart');
const SavedCart = require('../models/SavedCart');
const GuestSession = require('../models/GuestSession');
const PriceHistory = require('../models/PriceHistory');
const Product = require('../models/Product');
const Bull = require('bull');
const Redis = require('ioredis');

class EnhancedCartService {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
    
    this.priceUpdateQueue = new Bull('price-updates', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });
    
    this.initializeQueues();
  }

  initializeQueues() {
    this.priceUpdateQueue.process(async (job) => {
      const { cartId } = job.data;
      await this.updateCartPrices(cartId);
    });
  }

  async createGuestCart(sessionId, metadata = {}) {
    let guestSession = await GuestSession.findOne({ sessionId });
    
    if (!guestSession) {
      guestSession = await GuestSession.create({
        sessionId,
        ...metadata
      });
    }
    
    let cart = null;
    if (guestSession.cart) {
      cart = await Cart.findById(guestSession.cart);
    }
    
    if (!cart) {
      cart = await Cart.create({
        sessionId,
        metadata
      });
      
      guestSession.cart = cart._id;
      await guestSession.save();
    }
    
    return { cart, session: guestSession };
  }

  async convertGuestToUser(sessionId, userId) {
    const guestSession = await GuestSession.findOne({ sessionId });
    
    if (!guestSession) {
      throw new Error('Guest session not found');
    }
    
    await guestSession.convertToUser(userId);
    
    if (guestSession.cart) {
      const guestCart = await Cart.findById(guestSession.cart);
      const userCart = await Cart.findOne({ user: userId, abandoned: false });
      
      if (userCart && guestCart) {
        await userCart.merge(guestCart);
        return userCart;
      } else if (guestCart) {
        guestCart.user = userId;
        guestCart.sessionId = undefined;
        await guestCart.save();
        return guestCart;
      }
    }
    
    return null;
  }

  async saveCart(userId, cartId, options = {}) {
    const cart = await Cart.findById(cartId).populate('items.product');
    
    if (!cart) {
      throw new Error('Cart not found');
    }
    
    const savedCartData = {
      user: userId,
      name: options.name || `Saved Cart ${new Date().toLocaleDateString()}`,
      description: options.description,
      purpose: options.purpose,
      eventDate: options.eventDate,
      reminderEnabled: options.reminderEnabled,
      reminderDate: options.reminderDate,
      tags: options.tags,
      items: [],
      totalItemsWhenSaved: cart.itemCount,
      totalPriceWhenSaved: cart.totals.total
    };
    
    for (const item of cart.items) {
      savedCartData.items.push({
        product: item.product._id,
        variant: item.variant,
        quantity: item.quantity,
        savedPrice: item.price,
        currentPrice: item.price,
        notes: item.notes
      });
    }
    
    const savedCart = await SavedCart.create(savedCartData);
    
    if (options.clearCart) {
      await cart.clear();
    }
    
    return savedCart;
  }

  async getSavedCarts(userId) {
    const savedCarts = await SavedCart.find({ user: userId })
      .populate('items.product', 'name slug images')
      .sort('-createdAt');
    
    const cartsWithUpdates = [];
    
    for (const savedCart of savedCarts) {
      const priceUpdate = await savedCart.updatePrices();
      cartsWithUpdates.push({
        ...savedCart.toObject(),
        priceChanges: priceUpdate
      });
    }
    
    return cartsWithUpdates;
  }

  async activateSavedCart(userId, savedCartId) {
    const savedCart = await SavedCart.findOne({
      _id: savedCartId,
      user: userId
    });
    
    if (!savedCart) {
      throw new Error('Saved cart not found');
    }
    
    const cart = await savedCart.activateCart();
    return cart;
  }

  async updateCartPrices(cartId) {
    const cart = await Cart.findById(cartId);
    if (!cart || cart.items.length === 0) return;
    
    const updates = [];
    let hasChanges = false;
    
    for (const item of cart.items) {
      const product = await Product.findById(item.product);
      if (!product) continue;
      
      let currentPrice = product.basePrice;
      if (item.variant) {
        const variant = product.variants.id(item.variant);
        if (variant) currentPrice = variant.price;
      }
      
      if (currentPrice !== item.price) {
        const priceChange = {
          itemId: item._id,
          productId: item.product,
          productName: product.name,
          oldPrice: item.price,
          newPrice: currentPrice,
          difference: currentPrice - item.price,
          percentChange: ((currentPrice - item.price) / item.price * 100).toFixed(2)
        };
        
        updates.push(priceChange);
        item.price = currentPrice;
        item.metadata.priceChanged = true;
        item.metadata.lastPriceUpdate = new Date();
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      await cart.save();
      await this.notifyPriceChanges(cart, updates);
    }
    
    return updates;
  }

  async notifyPriceChanges(cart, priceChanges) {
    const cacheKey = `price_notification_${cart._id}`;
    const lastNotification = await this.redis.get(cacheKey);
    
    if (lastNotification) {
      const timeSinceLastNotification = Date.now() - parseInt(lastNotification);
      if (timeSinceLastNotification < 3600000) return;
    }
    
    if (cart.user) {
      console.log(`Notifying user ${cart.user} about price changes:`, priceChanges);
    }
    
    await this.redis.setex(cacheKey, 3600, Date.now());
  }

  async schedulePriceUpdates() {
    const carts = await Cart.find({
      abandoned: false,
      items: { $ne: [] }
    }).select('_id');
    
    for (const cart of carts) {
      await this.priceUpdateQueue.add(
        { cartId: cart._id },
        { 
          delay: Math.random() * 60000,
          removeOnComplete: true,
          removeOnFail: false
        }
      );
    }
  }

  async shareCart(cartId, userId, emails, permission = 'view') {
    const savedCart = await SavedCart.findOne({
      _id: cartId,
      user: userId
    });
    
    if (!savedCart) {
      throw new Error('Cart not found');
    }
    
    if (!savedCart.shareToken) {
      savedCart.generateShareToken();
    }
    
    for (const email of emails) {
      const existingShare = savedCart.sharedWith.find(s => s.email === email);
      
      if (existingShare) {
        existingShare.permission = permission;
      } else {
        savedCart.sharedWith.push({
          email,
          permission,
          sharedAt: new Date()
        });
      }
    }
    
    await savedCart.save();
    
    return {
      shareToken: savedCart.shareToken,
      shareUrl: `${process.env.FRONTEND_URL}/shared-cart/${savedCart.shareToken}`
    };
  }

  async getSharedCart(shareToken) {
    const savedCart = await SavedCart.findOne({ shareToken })
      .populate('items.product', 'name slug images basePrice')
      .populate('user', 'email');
    
    if (!savedCart) {
      throw new Error('Shared cart not found');
    }
    
    await savedCart.updatePrices();
    
    return savedCart;
  }

  async createCartTemplate(userId, cartId, templateData) {
    const cart = await Cart.findById(cartId);
    
    if (!cart) {
      throw new Error('Cart not found');
    }
    
    const template = await SavedCart.create({
      user: userId,
      name: templateData.name,
      description: templateData.description,
      isTemplate: true,
      items: cart.items.map(item => ({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        savedPrice: item.price,
        currentPrice: item.price
      })),
      autoReplenish: templateData.autoReplenish
    });
    
    return template;
  }

  async processAutoReplenish() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const templates = await SavedCart.find({
      isTemplate: true,
      'autoReplenish.enabled': true,
      'autoReplenish.nextDate': { $lte: today }
    });
    
    for (const template of templates) {
      try {
        const cart = await template.activateCart();
        
        let nextDate = new Date(template.autoReplenish.nextDate);
        switch (template.autoReplenish.frequency) {
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        }
        
        template.autoReplenish.nextDate = nextDate;
        await template.save();
        
        console.log(`Auto-replenished cart for user ${template.user}`);
      } catch (error) {
        console.error(`Failed to auto-replenish template ${template._id}:`, error);
      }
    }
  }

  async compareCartPrices(cartId, date) {
    const cart = await Cart.findById(cartId).populate('items.product');
    if (!cart) throw new Error('Cart not found');
    
    const comparison = {
      currentTotal: cart.totals.total,
      items: []
    };
    
    for (const item of cart.items) {
      const priceHistory = await PriceHistory.findOne({
        product: item.product._id,
        variant: item.variant,
        createdAt: { $lte: date }
      }).sort('-createdAt');
      
      if (priceHistory) {
        comparison.items.push({
          product: item.product.name,
          currentPrice: item.price,
          historicalPrice: priceHistory.price,
          difference: item.price - priceHistory.price,
          percentChange: ((item.price - priceHistory.price) / priceHistory.price * 100).toFixed(2)
        });
      }
    }
    
    comparison.historicalTotal = comparison.items.reduce((sum, item) => 
      sum + (item.historicalPrice || item.currentPrice), 0
    );
    
    comparison.totalDifference = comparison.currentTotal - comparison.historicalTotal;
    comparison.totalPercentChange = (
      (comparison.totalDifference / comparison.historicalTotal * 100)
    ).toFixed(2);
    
    return comparison;
  }

  async getCartRecommendations(cartId) {
    const cart = await Cart.findById(cartId).populate('items.product');
    if (!cart || cart.items.length === 0) return [];
    
    const productIds = cart.items.map(item => item.product._id);
    const categories = [...new Set(cart.items.map(item => item.product.category))];
    
    const relatedProducts = await Product.find({
      _id: { $nin: productIds },
      category: { $in: categories },
      status: 'published'
    })
    .limit(10)
    .select('name slug images basePrice rating');
    
    const frequentlyBoughtTogether = await this.getFrequentlyBoughtTogether(productIds);
    
    return {
      related: relatedProducts,
      frequentlyBoughtTogether
    };
  }

  async getFrequentlyBoughtTogether(productIds) {
    const Order = mongoose.model('Order');
    
    const orders = await Order.aggregate([
      {
        $match: {
          'items.product': { $in: productIds }
        }
      },
      {
        $unwind: '$items'
      },
      {
        $match: {
          'items.product': { $nin: productIds }
        }
      },
      {
        $group: {
          _id: '$items.product',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      {
        $unwind: '$product'
      },
      {
        $project: {
          product: {
            _id: '$product._id',
            name: '$product.name',
            slug: '$product.slug',
            image: { $arrayElemAt: ['$product.images.url', 0] },
            price: '$product.basePrice'
          },
          purchaseCount: '$count'
        }
      }
    ]);
    
    return orders.map(o => o.product);
  }
}

module.exports = new EnhancedCartService();