const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');
const handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');

class NotificationService {
  constructor() {
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    this.templates = {};
    this.loadTemplates();
  }

  async loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates/emails');
    const files = await fs.readdir(templatesDir);

    for (const file of files) {
      if (file.endsWith('.hbs')) {
        const name = file.replace('.hbs', '');
        const content = await fs.readFile(path.join(templatesDir, file), 'utf8');
        this.templates[name] = handlebars.compile(content);
      }
    }
  }

  async sendOrderConfirmation(order) {
    await order.populate('user items.product');
    
    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.addresses.billing.fullName,
      orderDate: new Date(order.createdAt).toLocaleDateString(),
      items: order.items.map(item => ({
        name: item.productSnapshot.name,
        quantity: item.quantity,
        price: this.formatCurrency(item.price),
        total: this.formatCurrency(item.total)
      })),
      subtotal: this.formatCurrency(order.pricing.subtotal),
      shipping: this.formatCurrency(order.pricing.shipping.cost),
      tax: this.formatCurrency(order.pricing.tax.amount),
      total: this.formatCurrency(order.pricing.total),
      shippingAddress: this.formatAddress(order.addresses.shipping),
      estimatedDelivery: new Date(order.fulfillment.expectedDelivery).toLocaleDateString(),
      trackingUrl: `${process.env.FRONTEND_URL}/track/${order.orderNumber}`
    };

    await this.sendEmail(
      order.user.email,
      'Order Confirmation',
      'orderConfirmation',
      emailData
    );

    if (order.addresses.billing.phone) {
      await this.sendSMS(
        order.addresses.billing.phone,
        `Your order ${order.orderNumber} has been confirmed! Total: ${this.formatCurrency(order.pricing.total)}. Track: ${process.env.FRONTEND_URL}/track/${order.orderNumber}`
      );
    }
  }

  async sendShippingUpdate(order) {
    await order.populate('user');

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.addresses.billing.fullName,
      trackingNumber: order.fulfillment.trackingNumber,
      carrier: order.fulfillment.carrier,
      trackingUrl: order.fulfillment.trackingUrl,
      estimatedDelivery: new Date(order.fulfillment.expectedDelivery).toLocaleDateString()
    };

    await this.sendEmail(
      order.user.email,
      'Your Order Has Shipped!',
      'orderShipped',
      emailData
    );

    if (order.addresses.billing.phone) {
      await this.sendSMS(
        order.addresses.billing.phone,
        `Your order ${order.orderNumber} has shipped! Track it here: ${order.fulfillment.trackingUrl}`
      );
    }
  }

  async sendDeliveryConfirmation(order) {
    await order.populate('user');

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.addresses.billing.fullName,
      deliveryDate: new Date().toLocaleDateString()
    };

    await this.sendEmail(
      order.user.email,
      'Order Delivered Successfully',
      'orderDelivered',
      emailData
    );
  }

  async sendRefundNotification(order, refund) {
    await order.populate('user');

    const emailData = {
      orderNumber: order.orderNumber,
      customerName: order.addresses.billing.fullName,
      refundAmount: this.formatCurrency(refund.totalAmount),
      refundStatus: refund.status,
      refundReason: refund.reason,
      processedDate: new Date(refund.processedAt).toLocaleDateString()
    };

    await this.sendEmail(
      order.user.email,
      'Refund Update',
      'refundUpdate',
      emailData
    );
  }

  async sendEmail(to, subject, template, data) {
    try {
      const html = this.templates[template] ? 
        this.templates[template](data) : 
        this.generateSimpleHtml(data);

      const msg = {
        to,
        from: process.env.FROM_EMAIL,
        subject,
        html,
        trackingSettings: {
          clickTracking: { enable: true },
          openTracking: { enable: true }
        }
      };

      await sgMail.send(msg);
      
      return { success: true };
    } catch (error) {
      console.error('Email send error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendSMS(to, message) {
    try {
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to
      });

      return { success: true, messageId: result.sid };
    } catch (error) {
      console.error('SMS send error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendBulkEmails(recipients, subject, template, commonData = {}) {
    const personalizations = recipients.map(recipient => ({
      to: recipient.email,
      dynamicTemplateData: {
        ...commonData,
        ...recipient.data
      }
    }));

    const msg = {
      personalizations,
      from: process.env.FROM_EMAIL,
      templateId: process.env[`SENDGRID_TEMPLATE_${template.toUpperCase()}`]
    };

    try {
      await sgMail.send(msg);
      return { success: true, count: recipients.length };
    } catch (error) {
      console.error('Bulk email error:', error);
      return { success: false, error: error.message };
    }
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatAddress(address) {
    return `${address.addressLine1}${address.addressLine2 ? ', ' + address.addressLine2 : ''}, ${address.city}, ${address.state} ${address.postalCode}`;
  }

  generateSimpleHtml(data) {
    return `
      <html>
        <body>
          <h2>Notification</h2>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        </body>
      </html>
    `;
  }
}

module.exports = new NotificationService();