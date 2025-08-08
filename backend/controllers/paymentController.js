const paymentService = require('../services/paymentService');
const currencyService = require('../services/currencyService');

exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, currency, metadata } = req.body;

    const intent = await paymentService.createPaymentIntent(
      amount,
      currency,
      {
        ...metadata,
        userId: req.userId
      }
    );

    res.json({
      success: true,
      ...intent
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.confirmPayment = async (req, res) => {
  try {
    const { paymentIntentId, paymentMethodId } = req.body;

    const result = await paymentService.confirmPayment(
      paymentIntentId,
      paymentMethodId
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getPaymentMethods = async (req, res) => {
  try {
    const methods = await paymentService.getPaymentMethods(req.userId);

    res.json({
      success: true,
      paymentMethods: methods
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.savePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodId } = req.body;

    await paymentService.savePaymentMethod(req.userId, paymentMethodId);

    res.json({
      success: true,
      message: 'Payment method saved successfully'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.handleStripeWebhook = async (req, res) => {
  try {
    const verification = paymentService.verifyWebhook(
      'stripe',
      req.headers,
      req.rawBody
    );

    if (!verification.valid) {
      return res.status(400).json({ message: 'Invalid webhook signature' });
    }

    await paymentService.handleWebhookEvent('stripe', verification.event);

    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

 

exports.convertCurrency = async (req, res) => {
  try {
    const { amount, from, to } = req.query;

    const conversion = await currencyService.convert(
      parseFloat(amount),
      from.toUpperCase(),
      to.toUpperCase()
    );

    res.json({
      success: true,
      ...conversion
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getExchangeRates = async (req, res) => {
  try {
    const { base = 'USD' } = req.query;

    const rates = await currencyService.getExchangeRates(base.toUpperCase());

    res.json({
      success: true,
      base: base.toUpperCase(),
      rates
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.detectUserCurrency = async (req, res) => {
  try {
    const currency = currencyService.detectUserCurrency(req);

    res.json({
      success: true,
      currency,
      formatted: currencyService.formatCurrency(100, currency)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};