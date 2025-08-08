const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const crypto = require('crypto');

class PaymentService {
  constructor() {
    this.providers = {
      stripe: this.processStripePayment.bind(this),
      cod: this.processCODPayment.bind(this)
    };
  }

  async processPayment(paymentData) {
    const {
      orderId,
      amount,
      currency = 'USD',
      method,
      paymentDetails,
      userId,
      metadata
    } = paymentData;

    const transaction = await Transaction.create({
      order: orderId,
      user: userId,
      type: 'payment',
      status: 'pending',
      amount: {
        value: amount,
        currency
      },
      metadata
    });

    try {
      const provider = this.providers[method];
      if (!provider) throw new Error(`Unsupported payment method: ${method}`);

      const result = await provider(paymentData, transaction);

      transaction.status = result.status;
      transaction.gateway = {
        provider: method,
        transactionId: result.transactionId,
        paymentIntentId: result.paymentIntentId,
        rawResponse: result.rawResponse
      };

      await transaction.save();

      return {
        success: result.status === 'completed',
        transactionId: transaction._id,
        ...result
      };
    } catch (error) {
      transaction.status = 'failed';
      transaction.errorDetails = {
        code: error.code,
        message: error.message
      };
      await transaction.save();
      throw error;
    }
  }

  async processStripePayment(paymentData, transaction) {
    try {
      const { amount, currency, paymentDetails } = paymentData;
      let paymentIntent;

      if (paymentDetails.paymentMethodId) {
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(amount * 100),
          currency: currency.toLowerCase(),
          payment_method: paymentDetails.paymentMethodId,
          confirm: true,
          automatic_payment_methods: {
            enabled: true,
            allow_redirects: 'never'
          },
          metadata: {
            orderId: paymentData.orderId.toString(),
            userId: paymentData.userId.toString()
          }
        });
      } else if (paymentDetails.paymentIntentId) {
        paymentIntent = await stripe.paymentIntents.confirm(
          paymentDetails.paymentIntentId
        );
      }

      if (paymentIntent.status === 'succeeded') {
        return {
          status: 'completed',
          transactionId: paymentIntent.id,
          paymentIntentId: paymentIntent.id,
          rawResponse: paymentIntent
        };
      } else if (paymentIntent.status === 'requires_action') {
        return {
          status: 'processing',
          transactionId: paymentIntent.id,
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          requiresAction: true,
          rawResponse: paymentIntent
        };
      } else {
        throw new Error(`Payment failed with status: ${paymentIntent.status}`);
      }
    } catch (error) {
      throw {
        code: error.code,
        message: error.message,
        details: error
      };
    }
  }

  async processCODPayment(paymentData, transaction) {
    const verificationCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    return {
      status: 'pending',
      transactionId: `COD-${Date.now()}`,
      verificationCode,
      message: 'Cash on delivery order confirmed',
      rawResponse: {
        method: 'cod',
        verificationCode,
        amount: paymentData.amount
      }
    };
  }

  async processRefund(transactionId, amount, reason) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) throw new Error('Transaction not found');

    const refundTransaction = await Transaction.create({
      order: transaction.order,
      user: transaction.user,
      type: 'refund',
      status: 'pending',
      amount: {
        value: amount,
        currency: transaction.amount.currency
      }
    });

    try {
      let refundResult;

      if (transaction.gateway.provider === 'stripe') {
        refundResult = await this.processStripeRefund(
          transaction.gateway.paymentIntentId,
          amount
        );
      } else {
        throw new Error('Refund not supported for this payment method');
      }

      refundTransaction.status = 'completed';
      refundTransaction.gateway = {
        provider: transaction.gateway.provider,
        transactionId: refundResult.id,
        referenceId: transaction.gateway.transactionId
      };

      transaction.refunds.push({
        amount,
        reason,
        refundId: refundResult.id,
        status: 'completed',
        processedAt: new Date()
      });

      await transaction.save();
      await refundTransaction.save();

      return {
        success: true,
        refundId: refundResult.id,
        amount
      };
    } catch (error) {
      refundTransaction.status = 'failed';
      refundTransaction.errorDetails = {
        message: error.message
      };
      await refundTransaction.save();
      throw error;
    }
  }

  async processStripeRefund(paymentIntentId, amount) {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: Math.round(amount * 100)
    });

    return refund;
  }

  verifyStripeWebhook(headers, body) {
    const signature = headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const event = stripe.webhooks.constructEvent(body, signature, endpointSecret);
      return { valid: true, event };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async handleWebhookEvent(provider, event) {
    if (provider === 'stripe') {
      return this.handleStripeWebhook(event);
    }
  }

  async handleStripeWebhook(event) {
    const handlers = {
      'payment_intent.succeeded': this.handlePaymentSuccess.bind(this),
      'payment_intent.payment_failed': this.handlePaymentFailure.bind(this),
      'charge.refunded': this.handleRefundUpdate.bind(this)
    };

    const handler = handlers[event.type];
    if (handler) {
      await handler(event.data.object);
    }
  }

  async handlePaymentSuccess(paymentData) {
    const transactionId = paymentData.metadata?.orderId || paymentData.reference_id;
    const order = await Order.findById(transactionId);

    if (order) {
      order.payment.status = 'completed';
      order.payment.paidAt = new Date();
      order.status = 'confirmed';
      await order.save();
    }
  }

  async handlePaymentFailure(paymentData) {
    const transactionId = paymentData.metadata?.orderId || paymentData.reference_id;
    const order = await Order.findById(transactionId);

    if (order) {
      order.payment.status = 'failed';
      await order.save();
    }
  }

  async handleRefundUpdate(refundData) {
    console.log('Refund webhook received:', refundData);
  }

  async createPaymentIntent(amount, currency = 'USD', metadata = {}) {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      metadata
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    };
  }

  async confirmPayment(paymentIntentId, paymentMethodId) {
    const paymentIntent = await stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId
    });

    return {
      status: paymentIntent.status,
      paymentIntent
    };
  }

  async getPaymentMethods(userId) {
    const customer = await this.getOrCreateStripeCustomer(userId);
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: 'card'
    });

    return paymentMethods.data.map(method => ({
      id: method.id,
      type: method.type,
      card: {
        brand: method.card.brand,
        last4: method.card.last4,
        expMonth: method.card.exp_month,
        expYear: method.card.exp_year
      }
    }));
  }

  async savePaymentMethod(userId, paymentMethodId) {
    const customer = await this.getOrCreateStripeCustomer(userId);
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    return { success: true };
  }

  async getOrCreateStripeCustomer(userId) {
    const User = require('../models/User');
    const user = await User.findById(userId);

    if (user.stripeCustomerId) {
      return await stripe.customers.retrieve(user.stripeCustomerId);
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: userId.toString() }
    });

    user.stripeCustomerId = customer.id;
    await user.save();

    return customer;
  }
}

module.exports = new PaymentService();
