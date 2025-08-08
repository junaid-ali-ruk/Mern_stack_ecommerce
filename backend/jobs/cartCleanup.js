const Cart = require('../models/Cart');
const cartService = require('../services/cartService');

const cleanupCarts = async () => {
  try {
    const expiredCount = await Cart.cleanupExpired();
    console.log(`Cleaned up ${expiredCount} expired carts`);

    const reservations = await cartService.cleanupExpiredReservations();
    console.log(`Released ${reservations} expired stock reservations`);

    const abandonedCarts = await cartService.getAbandonedCarts(1);
    console.log(`Found ${abandonedCarts.length} abandoned carts`);

  } catch (error) {
    console.error('Cart cleanup error:', error);
  }
};

module.exports = { cleanupCarts };