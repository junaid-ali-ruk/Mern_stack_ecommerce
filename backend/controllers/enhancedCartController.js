const enhancedCartService = require('../services/enhancedCartService');
const PriceHistory = require('../models/PriceHistory');

exports.createGuestCart = async (req, res) => {
  try {
    const sessionId = req.sessionId || req.cookies.sessionId;
    
    const metadata = {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer,
      landingPage: req.body.landingPage,
      utmParams: {
        source: req.query.utm_source,
        medium: req.query.utm_medium,
        campaign: req.query.utm_campaign,
        term: req.query.utm_term,
        content: req.query.utm_content
      }
    };
    
    const { cart, session } = await enhancedCartService.createGuestCart(
      sessionId,
      metadata
    );
    
    res.json({
      success: true,
      cart,
      sessionId: session.sessionId
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.convertGuestCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const sessionId = req.cookies.sessionId || req.body.sessionId;
    
    const cart = await enhancedCartService.convertGuestToUser(
      sessionId,
      req.userId
    );
    
    res.json({
      success: true,
      cart,
      message: 'Guest cart converted successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.saveCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { cartId } = req.params;
    const options = req.body;
    
    const savedCart = await enhancedCartService.saveCart(
      req.userId,
      cartId,
      options
    );
    
    res.json({
      success: true,
      savedCart,
      message: 'Cart saved successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getSavedCarts = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const savedCarts = await enhancedCartService.getSavedCarts(req.userId);
    
    res.json({
      success: true,
      savedCarts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.activateSavedCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { savedCartId } = req.params;
    
    const cart = await enhancedCartService.activateSavedCart(
      req.userId,
      savedCartId
    );
    
    res.json({
      success: true,
      cart,
      message: 'Saved cart activated successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.checkPriceUpdates = async (req, res) => {
  try {
    const { cartId } = req.params;
    
    const updates = await enhancedCartService.updateCartPrices(cartId);
    
    res.json({
      success: true,
      priceUpdates: updates,
      hasChanges: updates.length > 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.shareCart = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { cartId } = req.params;
    const { emails, permission } = req.body;
    
    const shareInfo = await enhancedCartService.shareCart(
      cartId,
      req.userId,
      emails,
      permission
    );
    
    res.json({
      success: true,
      ...shareInfo,
      message: 'Cart shared successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getSharedCart = async (req, res) => {
  try {
    const { shareToken } = req.params;
    
    const cart = await enhancedCartService.getSharedCart(shareToken);
    
    res.json({
      success: true,
      cart
    });
  } catch (error) {
    res.status(404).json({ message: error.message });
  }
};

exports.createCartTemplate = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const { cartId } = req.params;
    const templateData = req.body;
    
    const template = await enhancedCartService.createCartTemplate(
      req.userId,
      cartId,
      templateData
    );
    
    res.json({
      success: true,
      template,
      message: 'Cart template created successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.compareCartPrices = async (req, res) => {
  try {
    const { cartId } = req.params;
    const { date } = req.query;
    
    const comparison = await enhancedCartService.compareCartPrices(
      cartId,
      new Date(date || Date.now() - 30 * 24 * 60 * 60 * 1000)
    );
    
    res.json({
      success: true,
      comparison
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCartRecommendations = async (req, res) => {
  try {
    const { cartId } = req.params;
    
    const recommendations = await enhancedCartService.getCartRecommendations(cartId);
    
    res.json({
      success: true,
      recommendations
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPriceHistory = async (req, res) => {
  try {
    const { productId } = req.params;
    const { days = 30, variantId } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const query = {
      product: productId,
      createdAt: { $gte: startDate }
    };
    
    if (variantId) {
      query.variant = variantId;
    }
    
    const priceHistory = await PriceHistory.find(query)
      .sort('createdAt')
      .select('price comparePrice createdAt changeType changeAmount changePercent');
    
    const chartData = priceHistory.map(record => ({
      date: record.createdAt,
      price: record.price,
      comparePrice: record.comparePrice
    }));
    
    const statistics = {
      currentPrice: priceHistory[priceHistory.length - 1]?.price || 0,
      lowestPrice: Math.min(...priceHistory.map(r => r.price)),
      highestPrice: Math.max(...priceHistory.map(r => r.price)),
      averagePrice: priceHistory.reduce((sum, r) => sum + r.price, 0) / priceHistory.length,
      priceChanges: priceHistory.filter(r => r.changeType !== 'initial').length
    };
    
    res.json({
      success: true,
      history: priceHistory,
      chartData,
      statistics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};