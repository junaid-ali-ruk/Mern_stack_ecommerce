const cron = require('node-cron');
const enhancedCartService = require('../services/enhancedCartService');
const Product = require('../models/Product');
const PriceHistory = require('../models/PriceHistory');

const updateProductPrices = async () => {
  try {
    console.log('Starting price update job...');
    
    await enhancedCartService.schedulePriceUpdates();
    
    const products = await Product.find({ status: 'published' });
    
    for (const product of products) {
      const lastHistory = await PriceHistory.findOne({
        product: product._id,
        variant: null
      }).sort('-createdAt');
      
      if (!lastHistory || lastHistory.price !== product.basePrice) {
        await PriceHistory.recordPriceChange(
          product._id,
          product.basePrice,
          {
            comparePrice: product.comparePrice,
            automatic: true,
            reason: 'Scheduled price update'
          }
        );
      }
      
      for (const variant of product.variants) {
        const lastVariantHistory = await PriceHistory.findOne({
          product: product._id,
          variant: variant._id
        }).sort('-createdAt');
        
        if (!lastVariantHistory || lastVariantHistory.price !== variant.price) {
          await PriceHistory.recordPriceChange(
            product._id,
            variant.price,
            {
              variantId: variant._id,
              comparePrice: variant.comparePrice,
              automatic: true,
              reason: 'Scheduled price update'
            }
          );
        }
      }
    }
    
    console.log('Price update job completed');
  } catch (error) {
    console.error('Price update job failed:', error);
  }
};

const processAutoReplenish = async () => {
  try {
    console.log('Processing auto-replenish orders...');
    await enhancedCartService.processAutoReplenish();
    console.log('Auto-replenish processing completed');
  } catch (error) {
    console.error('Auto-replenish job failed:', error);
  }
};

cron.schedule('0 */6 * * *', updateProductPrices);

cron.schedule('0 9 * * *', processAutoReplenish);

module.exports = {
  updateProductPrices,
  processAutoReplenish
};