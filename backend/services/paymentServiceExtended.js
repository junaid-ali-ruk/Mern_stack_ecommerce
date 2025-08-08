const DiscountCode = require('../models/DiscountCode');
const GiftCard = require('../models/GiftCard');
const Transaction = require('../models/Transaction');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class PaymentServiceExtended {
  async applyDiscountCode(code, cart, customerId) {
    const discount = await DiscountCode.findOne({ 
      code: code.toUpperCase(),
      active: true
    });

    if (!discount) {
      throw new Error('Invalid discount code');
    }

    const result = discount.calculateDiscount(cart, customerId);
    
    if (!result.success) {
      throw new Error(result.message);
    }

    return {
      code: discount.code,
      type: discount.type,
      value: discount.value,
      discountAmount: result.discountAmount,
      description: discount.metadata.description
    };
  }

  async validateGiftCard(code, pin) {
    const giftCard = await GiftCard.findOne({ 
      code: code.toUpperCase()
    });

    if (!giftCard) {
      throw new Error('Invalid gift card code');
    }

    if (giftCard.pin !== pin.toUpperCase()) {
      throw new Error('Invalid gift card PIN');
    }

    const validation = giftCard.canBeUsed();
    
    if (!validation.valid) {
      throw new Error(validation.reason);
    }

    return giftCard.checkBalance();
  }

  async redeemGiftCard(code, pin, amount, orderId, userId) {
    const giftCard = await GiftCard.findOne({ 
      code: code.toUpperCase()
    });

    if (!giftCard || giftCard.pin !== pin.toUpperCase()) {
      throw new Error('Invalid gift card');
    }

    const transaction = await giftCard.redeem(amount, orderId, userId);
    
    return {
      success: true,
      transaction,
      remainingBalance: giftCard.currentBalance
    };
  }

  async processPartialPayment(orderId, payments) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
      const processedPayments = [];

      for (const payment of payments) {
        let result;

        switch (payment.method) {
          case 'card':
            result = await this.processCardPayment(payment);
            break;
          case 'giftcard':
            result = await this.redeemGiftCard(
              payment.code,
              payment.pin,
              payment.amount,
              orderId,
              payment.userId
            );
            break;
          case 'wallet':
            result = await this.processWalletPayment(payment);
            break;
          case 'points':
            result = await this.redeemLoyaltyPoints(payment);
            break;
          default:
            throw new Error(`Unsupported payment method: ${payment.method}`);
        }

        processedPayments.push({
          method: payment.method,
          amount: payment.amount,
          status: result.success ? 'completed' : 'failed',
          transactionId: result.transactionId,
          details: result
        });

        if (!result.success) {
          throw new Error(`Payment failed for method: ${payment.method}`);
        }
      }

      await session.commitTransaction();

      return {
        success: true,
        totalPaid: totalAmount,
        payments: processedPayments
      };
    } catch (error) {
      await session.abortTransaction();
      
      for (const payment of processedPayments) {
        if (payment.status === 'completed') {
          await this.reversePayment(payment);
        }
      }

      throw error;
    } finally {
      session.endSession();
    }
  }

  async savePaymentMethod(userId, paymentMethod) {
    const customer = await this.getOrCreateStripeCustomer(userId);

    if (paymentMethod.type === 'card') {
      const stripePaymentMethod = await stripe.paymentMethods.create({
        type: 'card',
        card: {
          token: paymentMethod.token
        }
      });

      await stripe.paymentMethods.attach(stripePaymentMethod.id, {
        customer: customer.id
      });

      return {
        id: stripePaymentMethod.id,
        type: 'card',
        last4: stripePaymentMethod.card.last4,
        brand: stripePaymentMethod.card.brand,
        expiryMonth: stripePaymentMethod.card.exp_month,
        expiryYear: stripePaymentMethod.card.exp_year
      };
    }

    const User = require('../models/User');
    const user = await User.findById(userId);

    if (!user.paymentMethods) {
      user.paymentMethods = [];
    }

    user.paymentMethods.push({
      type: paymentMethod.type,
      ...paymentMethod
    });

    await user.save();

    return paymentMethod;
  }

  async retryFailedPayment(transactionId, newPaymentMethod = null) {
    const transaction = await Transaction.findById(transactionId);

    if (!transaction || transaction.status !== 'failed') {
      throw new Error('Invalid transaction for retry');
    }

    transaction.metadata.retryCount = (transaction.metadata.retryCount || 0) + 1;

    if (transaction.metadata.retryCount > 3) {
      throw new Error('Maximum retry attempts exceeded');
    }

    const paymentData = {
      orderId: transaction.order,
      amount: transaction.amount.value,
      currency: transaction.amount.currency,
      method: newPaymentMethod?.method || transaction.method.type,
      paymentDetails: newPaymentMethod || transaction.method,
      userId: transaction.user
    };

    try {
      const result = await this.processPayment(paymentData);

      transaction.status = 'completed';
      transaction.timeline.push({
        status: 'retry_success',
        timestamp: new Date(),
        message: `Payment retry successful on attempt ${transaction.metadata.retryCount}`
      });

      await transaction.save();

      return result;
    } catch (error) {
      transaction.timeline.push({
        status: 'retry_failed',
        timestamp: new Date(),
        message: `Retry attempt ${transaction.metadata.retryCount} failed: ${error.message}`
      });

      await transaction.save();

      throw error;
    }
  }

  async scheduleRetry(transactionId, delayMinutes = 60) {
    const Bull = require('bull');
    const retryQueue = new Bull('payment-retry', {
      redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
      }
    });

    await retryQueue.add(
      { transactionId },
      { delay: delayMinutes * 60 * 1000 }
    );

    return {
      scheduled: true,
      retryAt: new Date(Date.now() + delayMinutes * 60 * 1000)
    };
  }

  async processWalletPayment(payment) {
    const User = require('../models/User');
    const user = await User.findById(payment.userId);

    if (!user.wallet || user.wallet.balance < payment.amount) {
      throw new Error('Insufficient wallet balance');
    }

    user.wallet.balance -= payment.amount;
    user.wallet.transactions.push({
      type: 'debit',
      amount: payment.amount,
      description: `Order payment`,
      orderId: payment.orderId,
      timestamp: new Date()
    });

    await user.save();

    return {
      success: true,
      transactionId: `WALLET-${Date.now()}`,
      remainingBalance: user.wallet.balance
    };
  }

  async redeemLoyaltyPoints(payment) {
    const User = require('../models/User');
    const user = await User.findById(payment.userId);

    const pointsValue = user.loyaltyPoints * 0.01;
    
    if (pointsValue < payment.amount) {
      throw new Error('Insufficient loyalty points');
    }

    const pointsRequired = Math.ceil(payment.amount / 0.01);
    user.loyaltyPoints -= pointsRequired;
    
    await user.save();

    return {
      success: true,
      transactionId: `POINTS-${Date.now()}`,
      pointsRedeemed: pointsRequired,
      remainingPoints: user.loyaltyPoints
    };
  }

  async reversePayment(payment) {
    switch (payment.method) {
      case 'card':
        await stripe.refunds.create({
          payment_intent: payment.transactionId,
          amount: Math.round(payment.amount * 100)
        });
        break;
      case 'giftcard':
        const GiftCard = require('../models/GiftCard');
        const giftCard = await GiftCard.findOne({ 
          'transactions.order': payment.details.orderId 
        });
        if (giftCard) {
          await giftCard.addValue(payment.amount, 'Payment reversal');
        }
        break;
      case 'wallet':
        const User = require('../models/User');
        const user = await User.findById(payment.details.userId);
        if (user) {
          user.wallet.balance += payment.amount;
          await user.save();
        }
        break;
    }
  }
}

module.exports = new PaymentServiceExtended();