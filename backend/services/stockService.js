const Product = require('../models/Product');
const mongoose = require('mongoose');

class StockService {
  async checkAvailability(productId, quantity, variantId = null) {
    const product = await Product.findById(productId);
    
    if (!product) {
      throw new Error('Product not found');
    }

    if (variantId) {
      const variant = product.variants.id(variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }
      
      if (!variant.stock.trackInventory) {
        return { available: true, inStock: Infinity };
      }
      
      const available = variant.stock.available >= quantity || variant.stock.allowBackorder;
      return {
        available,
        inStock: variant.stock.available,
        allowBackorder: variant.stock.allowBackorder
      };
    }

    if (!product.stock.trackInventory) {
      return { available: true, inStock: Infinity };
    }

    const available = product.stock.available >= quantity || product.stock.allowBackorder;
    return {
      available,
      inStock: product.stock.available,
      allowBackorder: product.stock.allowBackorder
    };
  }

  async reserveStock(items) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const reservations = [];

      for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        if (item.variantId) {
          const variant = product.variants.id(item.variantId);
          if (!variant) {
            throw new Error(`Variant ${item.variantId} not found`);
          }

          if (variant.stock.trackInventory) {
            if (variant.stock.available < item.quantity && !variant.stock.allowBackorder) {
              throw new Error(`Insufficient stock for variant ${variant.sku}`);
            }

            variant.stock.reserved += item.quantity;
            variant.stock.available = Math.max(0, variant.stock.quantity - variant.stock.reserved);
          }

          reservations.push({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            reservedAt: new Date()
          });
        } else {
          if (product.stock.trackInventory) {
            if (product.stock.available < item.quantity && !product.stock.allowBackorder) {
              throw new Error(`Insufficient stock for product ${product.sku || product.name}`);
            }

            product.stock.reserved += item.quantity;
            product.stock.available = Math.max(0, product.stock.quantity - product.stock.reserved);
          }

          reservations.push({
            productId: item.productId,
            quantity: item.quantity,
            reservedAt: new Date()
          });
        }

        await product.save({ session });
      }

      await session.commitTransaction();
      return reservations;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async releaseStock(items) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        
        if (!product) continue;

        if (item.variantId) {
          const variant = product.variants.id(item.variantId);
          if (variant && variant.stock.trackInventory) {
            variant.stock.reserved = Math.max(0, variant.stock.reserved - item.quantity);
            variant.stock.available = variant.stock.quantity - variant.stock.reserved;
          }
        } else {
          if (product.stock.trackInventory) {
            product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
            product.stock.available = product.stock.quantity - product.stock.reserved;
          }
        }

        await product.save({ session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async commitStock(items) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const item of items) {
        const product = await Product.findById(item.productId).session(session);
        
        if (!product) continue;

        if (item.variantId) {
          const variant = product.variants.id(item.variantId);
          if (variant && variant.stock.trackInventory) {
            variant.stock.quantity = Math.max(0, variant.stock.quantity - item.quantity);
            variant.stock.reserved = Math.max(0, variant.stock.reserved - item.quantity);
            variant.stock.available = variant.stock.quantity - variant.stock.reserved;
            
            if (variant.stock.quantity <= variant.stock.lowStockThreshold) {
              await this.triggerLowStockAlert(product, variant);
            }
          }
        } else {
          if (product.stock.trackInventory) {
            product.stock.quantity = Math.max(0, product.stock.quantity - item.quantity);
            product.stock.reserved = Math.max(0, product.stock.reserved - item.quantity);
            product.stock.available = product.stock.quantity - product.stock.reserved;
            
            if (product.stock.quantity <= product.stock.lowStockThreshold) {
              await this.triggerLowStockAlert(product);
            }
          }
        }

        product.soldCount += item.quantity;
        await product.save({ session });
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async adjustStock(productId, adjustment, reason, variantId = null) {
    const product = await Product.findById(productId);
    
    if (!product) {
      throw new Error('Product not found');
    }

    const stockHistory = {
      date: new Date(),
      type: adjustment > 0 ? 'addition' : 'deduction',
      quantity: Math.abs(adjustment),
      reason,
      previousStock: 0,
      newStock: 0
    };

    if (variantId) {
      const variant = product.variants.id(variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }

      stockHistory.previousStock = variant.stock.quantity;
      variant.stock.quantity = Math.max(0, variant.stock.quantity + adjustment);
      variant.stock.available = variant.stock.quantity - variant.stock.reserved;
      stockHistory.newStock = variant.stock.quantity;
    } else {
      stockHistory.previousStock = product.stock.quantity;
      product.stock.quantity = Math.max(0, product.stock.quantity + adjustment);
      product.stock.available = product.stock.quantity - product.stock.reserved;
      stockHistory.newStock = product.stock.quantity;
    }

    if (!product.stockHistory) {
      product.stockHistory = [];
    }
    product.stockHistory.push(stockHistory);

    await product.save();
    return stockHistory;
  }

  async getLowStockProducts(threshold = null) {
    const query = {
      'stock.trackInventory': true,
      status: 'published'
    };

    if (threshold) {
      query['stock.quantity'] = { $lte: threshold };
    } else {
      query.$expr = {
        $lte: ['$stock.quantity', '$stock.lowStockThreshold']
      };
    }

    const products = await Product.find(query)
      .select('name sku stock.quantity stock.lowStockThreshold category')
      .populate('category', 'name');

    const variantQuery = {
      'variants.stock.trackInventory': true,
      status: 'published'
    };

    const productsWithLowVariants = await Product.aggregate([
      { $match: variantQuery },
      { $unwind: '$variants' },
      {
        $match: {
          'variants.stock.trackInventory': true,
          $expr: {
            $lte: ['$variants.stock.quantity', '$variants.stock.lowStockThreshold']
          }
        }
      },
      {
        $project: {
          name: 1,
          sku: 1,
          variant: '$variants'
        }
      }
    ]);

    return {
      products,
      variants: productsWithLowVariants
    };
  }

  async triggerLowStockAlert(product, variant = null) {
    console.log(`Low stock alert: ${product.name} ${variant ? `- ${variant.name}` : ''}`);
  }

  async getStockReport(filters = {}) {
    const pipeline = [
      { $match: { status: 'published' } }
    ];

    if (filters.category) {
      pipeline.push({ $match: { category: mongoose.Types.ObjectId(filters.category) } });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: 1,
          sku: 1,
          category: '$categoryInfo.name',
          stockValue: { $multiply: ['$stock.quantity', '$costPrice'] },
          retailValue: { $multiply: ['$stock.quantity', '$basePrice'] },
          quantity: '$stock.quantity',
          reserved: '$stock.reserved',
          available: '$stock.available',
          lowStock: {
            $lte: ['$stock.quantity', '$stock.lowStockThreshold']
          },
          outOfStock: {
            $lte: ['$stock.available', 0]
          }
        }
      }
    );

    if (filters.lowStock) {
      pipeline.push({ $match: { lowStock: true } });
    }

    if (filters.outOfStock) {
      pipeline.push({ $match: { outOfStock: true } });
    }

    const report = await Product.aggregate(pipeline);

    const summary = await Product.aggregate([
      { $match: { status: 'published' } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: '$stock.quantity' },
          totalReserved: { $sum: '$stock.reserved' },
          totalValue: { $sum: { $multiply: ['$stock.quantity', '$costPrice'] } },
          retailValue: { $sum: { $multiply: ['$stock.quantity', '$basePrice'] } },
          lowStockCount: {
            $sum: {
              $cond: [
                { $lte: ['$stock.quantity', '$stock.lowStockThreshold'] },
                1,
                0
              ]
            }
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $lte: ['$stock.available', 0] }, 1, 0]
            }
          }
        }
      }
    ]);

    return {
      items: report,
      summary: summary[0] || {}
    };
  }
}

module.exports = new StockService();