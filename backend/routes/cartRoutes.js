const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const wishlistController = require('../controllers/wishlistController');
const { authenticate } = require('../middleware/auth');
const {
  validateAddToCart,
  validateUpdateCartItem,
  validateCoupon,
  validateWishlistItem
} = require('../validators/cartValidator');

router.get('/cart', cartController.getCart);
router.post('/cart/items', validateAddToCart, cartController.addToCart);
router.patch('/cart/items/:itemId', validateUpdateCartItem, cartController.updateCartItem);
router.delete('/cart/items/:itemId', cartController.removeFromCart);
router.delete('/cart/clear', cartController.clearCart);
router.get('/cart/summary', cartController.getCartSummary);

router.post('/cart/coupon', validateCoupon, cartController.applyCoupon);
router.delete('/cart/coupon/:couponCode', cartController.removeCoupon);

router.post('/cart/sync', authenticate, cartController.syncCart);

router.get('/wishlist', authenticate, wishlistController.getWishlist);
router.post('/wishlist/items', authenticate, validateWishlistItem, wishlistController.addToWishlist);
router.delete('/wishlist/items/:itemId', authenticate, wishlistController.removeFromWishlist);
router.post('/wishlist/items/:itemId/move-to-cart', authenticate, wishlistController.moveToCart);
router.patch('/wishlist/items/:itemId/price-alert', authenticate, wishlistController.setPriceAlert);

router.get('/wishlists', authenticate, wishlistController.getUserWishlists);
router.post('/wishlists', authenticate, wishlistController.createWishlist);
router.patch('/wishlists/:wishlistId', authenticate, wishlistController.updateWishlist);
router.delete('/wishlists/:wishlistId', authenticate, wishlistController.deleteWishlist);

module.exports = router;