const DiscountCode = require('../models/DiscountCode');
const GiftCard = require('../models/GiftCard');
const paymentServiceExtended = require('../services/paymentServiceExtended');

exports.validateDiscountCode = async (req, res) => {
  try {
    const { code, cartId } = req.body;
    
    const Cart = require('../models/Cart');
    const cart = await Cart.findById(cartId);
    
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const discountResult = await paymentServiceExtended.applyDiscountCode(
      code,
      cart,
      req.userId
    );

    res.json({
      success: true,
      discount: discountResult
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createDiscountCode = async (req, res) => {
  try {
    const discountData = {
      ...req.body,
      metadata: {
        ...req.body.metadata,
        createdBy: req.userId
      }
    };

    const discount = await DiscountCode.create(discountData);

    res.status(201).json({
      success: true,
      discount
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.generateBulkCodes = async (req, res) => {
  try {
    const { count, ...baseConfig } = req.body;

    const codes = await DiscountCode.createBulkCodes(baseConfig, count);

    res.json({
      success: true,
      codes: codes.map(c => ({
        id: c._id,
        code: c.code,
        type: c.type,
        value: c.value
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getDiscountAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await DiscountCode.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$type',
          totalCodes: { $sum: 1 },
          totalUsed: { $sum: '$usage.used' },
          totalRevenue: { $sum: '$analytics.revenue' },
          totalDiscounted: { $sum: '$analytics.totalDiscounted' },
          averageOrderValue: { $avg: '$analytics.averageOrderValue' }
        }
      }
    ]);

    res.json({
      success: true,
      analytics
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.checkGiftCardBalance = async (req, res) => {
  try {
    const { code, pin } = req.body;

    const balance = await paymentServiceExtended.validateGiftCard(code, pin);

    res.json({
      success: true,
      ...balance
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.purchaseGiftCard = async (req, res) => {
  try {
    const { value, recipient, type = 'digital' } = req.body;

    const giftCard = new GiftCard({
      initialValue: value,
      currentBalance: value,
      type,
      purchaser: {
        user: req.userId,
        email: req.user.email,
        name: req.user.name
      },
      recipient,
      metadata: {
        source: 'purchase'
      }
    });

    giftCard.generateCode();
    giftCard.generatePin();

    await giftCard.save();

    if (recipient?.email && recipient?.sendDate) {
      console.log('Schedule gift card email for', recipient.sendDate);
    }

    res.status(201).json({
      success: true,
      giftCard: {
        code: giftCard.code,
        pin: type === 'digital' ? giftCard.pin : undefined,
        value: giftCard.initialValue,
        recipient: giftCard.recipient
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createBulkGiftCards = async (req, res) => {
  try {
    const { count, value, options } = req.body;

    const cards = await GiftCard.createBulk(count, value, {
      ...options,
      metadata: {
        ...options.metadata,
        createdBy: req.userId
      }
    });

    res.json({
      success: true,
      cards: cards.map(card => ({
        code: card.code,
        pin: card.pin,
        value: card.initialValue,
        status: card.status
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.processPartialPayment = async (req, res) => {
  try {
    const { orderId, payments } = req.body;

    const result = await paymentServiceExtended.processPartialPayment(
      orderId,
      payments.map(p => ({ ...p, userId: req.userId }))
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.retryPayment = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { paymentMethod } = req.body;

    const result = await paymentServiceExtended.retryFailedPayment(
      transactionId,
      paymentMethod
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.schedulePaymentRetry = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { delayMinutes = 60 } = req.body;

    const result = await paymentServiceExtended.scheduleRetry(
      transactionId,
      delayMinutes
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};