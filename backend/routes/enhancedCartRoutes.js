const express = require('express');
const router = express.Router();
const enhancedCartController = require('../controllers/enhancedCartController');
const { authenticate } = require('../middleware/auth');

router.post('/cart/guest', enhancedCartController.createGuestCart);
router.post('/cart/convert', authenticate, enhancedCartController.convertGuestCart);

router.post('/cart/:cartId/save', authenticate, enhancedCartController.saveCart);
router.get('/saved-carts', authenticate, enhancedCartController.getSavedCarts);
router.post('/saved-carts/:savedCartId/activate', authenticate, enhancedCartController.activateSavedCart);

router.get('/cart/:cartId/price-updates', enhancedCartController.checkPriceUpdates);
router.get('/cart/:cartId/price-comparison', enhancedCartController.compareCartPrices);

router.post('/cart/:cartId/share', authenticate, enhancedCartController.shareCart);
router.get('/shared-cart/:shareToken', enhancedCartController.getSharedCart);

router.post('/cart/:cartId/template', authenticate, enhancedCartController.createCartTemplate);

router.get('/cart/:cartId/recommendations', enhancedCartController.getCartRecommendations);

router.get('/products/:productId/price-history', enhancedCartController.getPriceHistory);

module.exports = router;