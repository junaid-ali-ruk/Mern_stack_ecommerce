const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const crypto = require('crypto');

class PaymentService {
  constructor() {
    this.initializePayPal();
    this.providers = {
      stripe: this.processStripePayment.bind(this),
      paypal: this.processPayPalPayment.bind(this),
      cod: this.processCODPayment.bind(this)
    };
  }

  initializePayPal() {
    const environment = process.env.NODE_ENV === 'production' ?
      new paypal.core.LiveEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
      ) :
      new paypal.core.SandboxEnvironment(
        process.env.PAYPAL_CLIENT_ID,
        process.env.PAYPAL_CLIENT_SECRET
      );
    
    this.paypalClient = new paypal.core.PayPalHttpClient(environment);
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
      if (!provider) {
        throw new Error(`Unsupported payment method: ${method}`);
      }

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

  async processPayPalPayment(paymentData, transaction) {
    try {
      const { amount, currency, paymentDetails } = paymentData;

      if (paymentDetails.orderId) {
        const request = new paypal.orders.OrdersCaptureRequest(paymentDetails.orderId);
        request.requestBody({});

        const capture = await this.paypalClient.execute(request);

        if (capture.result.status === 'COMPLETED') {
          return {
            status: 'completed',
            transactionId: capture.result.id,
            paymentIntentId: capture.result.purchase_units[0].payments.captures[0].id,
            rawResponse: capture.result
          };
        } else {
          throw new Error(`Payment status: ${capture.result.status}`);
        }
      } else {
        const request = new paypal.orders.OrdersCreateRequest();
        request.prefer("return=representation");
        request.requestBody({
          intent: 'CAPTURE',
          purchase_units: [{
            amount: {
              currency_code: currency,
              value: amount.toFixed(2)
            },
            reference_id: paymentData.orderId.toString()
          }]
        });

        const order = await this.paypalClient.execute(request);

        return {
          status: 'processing',
          transactionId: order.result.id,
          approvalUrl: order.result.links.find(link => link.rel === 'approve').href,
          rawResponse: order.result
        };
      }
    } catch (error) {
      throw {
        code: 'PAYPAL_ERROR',
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

    if (!transaction) {
      throw new Error('Transaction not found');
    }

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
      } else if (transaction.gateway.provider === 'paypal') {
        refundResult = await this.processPayPalRefund(
          transaction.gateway.captureId,
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

  async processPayPalRefund(captureId, amount) {
    const request = new paypal.payments.CapturesRefundRequest(captureId);
    request.requestBody({
      amount: {
        value: amount.toFixed(2),
        currency_code: 'USD'
      }
    });

    const refund = await this.paypalClient.execute(request);
    return refund.result;
  }

  async verifyWebhook(provider, headers, body) {
    if (provider === 'stripe') {
      return this.verifyStripeWebhook(headers, body);
    } else if (provider === 'paypal') {
      return this.verifyPayPalWebhook(headers, body);
    }

    throw new Error('Unsupported webhook provider');
  }

  verifyStripeWebhook(headers, body) {
    const signature = headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    try {
      const event = stripe.webhooks.constructEvent(
        body,
        signature,
        endpointSecret
      );

      return {
        valid: true,
        event
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async verifyPayPalWebhook(headers, body) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const transmissionTime = headers['paypal-transmission-time'];
    const certUrl = headers['paypal-cert-url'];

    const request = new paypal.notifications.VerifyWebhookSignatureRequest();
    request.requestBody({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: headers['paypal-auth-algo'],
      transmission_sig: transmissionSig,
      webhook_id: webhookId,
      webhook_event: body
    });

    try {
      const response = await this.paypalClient.execute(request);
      return {
        valid: response.result.verification_status === 'SUCCESS',
        event: body
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  async handleWebhookEvent(provider, event) {
    if (provider === 'stripe') {
      return this.handleStripeWebhook(event);
    } else if (provider === 'paypal') {
      return this.handlePayPalWebhook(event);
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

  async handlePayPalWebhook(event) {
    const handlers = {
      'PAYMENT.CAPTURE.COMPLETED': this.handlePaymentSuccess.bind(this),
      'PAYMENT.CAPTURE.DENIED': this.handlePaymentFailure.bind(this),
      'PAYMENT.CAPTURE.REFUNDED': this.handleRefundUpdate.bind(this)
    };

    const handler = handlers[event.event_type];
    if (handler) {
      await handler(event.resource);
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
      automatic_payment_methods: {
        enabled: true
      },
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
    
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id
    });

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
      metadata: {
        userId: userId.toString()
      }
    });

    user.stripeCustomerId = customer.id;
    await user.save();

    return customer;
  }
}

module.exports = new PaymentService();