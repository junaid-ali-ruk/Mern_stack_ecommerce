const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const puppeteer = require('puppeteer');
const QRCode = require('qr-image');
const barcode = require('barcode');

class InvoiceService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/invoices');
    this.outputDir = path.join(__dirname, '../uploads/invoices');
    
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateInvoice(invoiceData) {
    const method = process.env.INVOICE_METHOD || 'pdfkit';
    
    switch (method) {
      case 'puppeteer':
        return await this.generateWithPuppeteer(invoiceData);
      case 'pdfkit':
      default:
        return await this.generateWithPDFKit(invoiceData);
    }
  }

  async generateWithPDFKit(data) {
    return new Promise((resolve, reject) => {
      const fileName = `invoice_${data.orderNumber}_${Date.now()}.pdf`;
      const filePath = path.join(this.outputDir, fileName);
      
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      this.generateHeader(doc, data);
      this.generateCustomerInformation(doc, data);
      this.generateInvoiceTable(doc, data);
      this.generateFooter(doc, data);
      
      doc.end();
      
      stream.on('finish', () => {
        const url = `${process.env.BASE_URL}/invoices/${fileName}`;
        resolve(url);
      });
      
      stream.on('error', reject);
    });
  }

  generateHeader(doc, data) {
    doc
      .image(path.join(__dirname, '../assets/logo.png'), 50, 45, { width: 100 })
      .fillColor('#444444')
      .fontSize(20)
      .text('INVOICE', 50, 160)
      .fontSize(10)
      .text(`Invoice Number: ${data.orderNumber}`, 50, 185)
      .text(`Date: ${new Date(data.orderDate).toLocaleDateString()}`, 50, 200)
      .moveDown();
    
    const qr = QRCode.imageSync(data.orderNumber, { type: 'png' });
    doc.image(qr, 450, 45, { width: 100 });
  }

  generateCustomerInformation(doc, data) {
    const customerInformationTop = 250;
    
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('Bill To:', 50, customerInformationTop)
      .font('Helvetica')
      .fontSize(10)
      .text(data.customer.name, 50, customerInformationTop + 15)
      .text(data.customer.email, 50, customerInformationTop + 30)
      .text(data.customer.phone, 50, customerInformationTop + 45)
      .text(data.customer.address.line1, 50, customerInformationTop + 60);
    
    if (data.customer.address.line2) {
      doc.text(data.customer.address.line2, 50, customerInformationTop + 75);
    }
    
    doc.text(
      `${data.customer.address.city}, ${data.customer.address.state} ${data.customer.address.postalCode}`,
      50,
      customerInformationTop + 90
    );
    
    doc
      .font('Helvetica-Bold')
      .text('Payment Method:', 300, customerInformationTop)
      .font('Helvetica')
      .text(data.paymentMethod.toUpperCase(), 300, customerInformationTop + 15)
      .text(`Status: ${data.paymentStatus}`, 300, customerInformationTop + 30)
      .moveDown();
  }

  generateInvoiceTable(doc, data) {
    const invoiceTableTop = 380;
    
    doc.font('Helvetica-Bold');
    this.generateTableRow(
      doc,
      invoiceTableTop,
      'Item',
      'SKU',
      'Qty',
      'Price',
      'Total'
    );
    
    this.generateHr(doc, invoiceTableTop + 20);
    doc.font('Helvetica');
    
    let position = invoiceTableTop + 30;
    
    for (const item of data.items) {
      this.generateTableRow(
        doc,
        position,
        item.name.substring(0, 30),
        item.sku,
        item.quantity,
        this.formatCurrency(item.price),
        this.formatCurrency(item.total)
      );
      
      position += 30;
      
      if (position > 700) {
        doc.addPage();
        position = 50;
      }
    }
    
    this.generateHr(doc, position + 20);
    
    this.generateTableRow(
      doc,
      position + 40,
      '',
      '',
      '',
      'Subtotal:',
      this.formatCurrency(data.pricing.subtotal)
    );
    
    if (data.pricing.discount.amount > 0) {
      this.generateTableRow(
        doc,
        position + 60,
        '',
        '',
        '',
        'Discount:',
        `-${this.formatCurrency(data.pricing.discount.amount)}`
      );
    }
    
    this.generateTableRow(
      doc,
      position + 80,
      '',
      '',
      '',
      'Tax:',
      this.formatCurrency(data.pricing.tax.amount)
    );
    
    this.generateTableRow(
      doc,
      position + 100,
      '',
      '',
      '',
      'Shipping:',
      this.formatCurrency(data.pricing.shipping.cost)
    );
    
    doc.font('Helvetica-Bold');
    this.generateTableRow(
      doc,
      position + 130,
      '',
      '',
      '',
      'Total:',
      this.formatCurrency(data.pricing.total)
    );
  }

  generateTableRow(doc, y, item, sku, qty, price, total) {
    doc
      .fontSize(10)
      .text(item, 50, y)
      .text(sku, 200, y)
      .text(qty, 280, y, { width: 90, align: 'right' })
      .text(price, 370, y, { width: 90, align: 'right' })
      .text(total, 0, y, { align: 'right' });
  }

  generateHr(doc, y) {
    doc
      .strokeColor('#aaaaaa')
      .lineWidth(1)
      .moveTo(50, y)
      .lineTo(550, y)
      .stroke();
  }

  generateFooter(doc, data) {
    doc
      .fontSize(8)
      .text(
        'Thank you for your business!',
        50,
        750,
        { align: 'center', width: 500 }
      )
      .text(
        'This is a computer generated invoice.',
        50,
        765,
        { align: 'center', width: 500 }
      );
  }

  formatCurrency(amount) {
    return `$${parseFloat(amount).toFixed(2)}`;
  }

  async generateWithPuppeteer(data) {
    const templatePath = path.join(this.templatesDir, 'invoice.html');
    const templateHtml = fs.readFileSync(templatePath, 'utf8');
    
    const template = handlebars.compile(templateHtml);
    const html = template({
      ...data,
      logo: `file://${path.join(__dirname, '../assets/logo.png')}`,
      generatedDate: new Date().toLocaleDateString(),
      qrCode: QRCode.imageSync(data.orderNumber, { type: 'svg' })
    });
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const fileName = `invoice_${data.orderNumber}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputDir, fileName);
    
    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    });
    
    await browser.close();
    
    return `${process.env.BASE_URL}/invoices/${fileName}`;
  }

  async sendInvoice(email, invoiceUrl) {
    const emailService = require('./emailService');
    
    await emailService.sendEmail(
      email,
      'invoice',
      {
        invoiceUrl,
        downloadLink: invoiceUrl
      }
    );
  }

  async generateBulkInvoices(orderIds) {
    const invoices = [];
    
    for (const orderId of orderIds) {
      try {
        const orderService = require('./orderService');
        const invoiceUrl = await orderService.generateInvoice(orderId);
        invoices.push({
          orderId,
          invoiceUrl,
          success: true
        });
      } catch (error) {
        invoices.push({
          orderId,
          error: error.message,
          success: false
        });
      }
    }
    
    return invoices;
  }
}

module.exports = new InvoiceService();