const crypto = require('crypto');

class SKUGenerator {
  constructor() {
    this.prefixes = {
      product: 'PRD',
      variant: 'VAR',
      bundle: 'BND',
      digital: 'DIG'
    };
  }

  generateSKU(type = 'product', data = {}) {
    const prefix = this.prefixes[type] || 'GEN';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    
    let sku = `${prefix}-${timestamp}-${random}`;
    
    if (data.category) {
      const categoryCode = data.category.substring(0, 3).toUpperCase();
      sku = `${prefix}-${categoryCode}-${timestamp}-${random}`;
    }
    
    if (data.attributes) {
      const attrCode = this.generateAttributeCode(data.attributes);
      sku = `${sku}-${attrCode}`;
    }
    
    return sku;
  }

  generateAttributeCode(attributes) {
    const codes = [];
    
    if (attributes.color) {
      codes.push(attributes.color.substring(0, 2).toUpperCase());
    }
    
    if (attributes.size) {
      codes.push(this.getSizeCode(attributes.size));
    }
    
    if (attributes.material) {
      codes.push(attributes.material.substring(0, 2).toUpperCase());
    }
    
    return codes.join('');
  }

  getSizeCode(size) {
    const sizeMap = {
      'extra small': 'XS',
      'small': 'S',
      'medium': 'M',
      'large': 'L',
      'extra large': 'XL',
      'xxl': '2X',
      'xxxl': '3X'
    };
    
    return sizeMap[size.toLowerCase()] || size.substring(0, 2).toUpperCase();
  }

  validateSKU(sku) {
    const pattern = /^[A-Z]{3}-[A-Z0-9]{3,}-[A-Z0-9]{6,}(-[A-Z0-9]+)?$/;
    return pattern.test(sku);
  }

  generateBulkSKUs(count, type = 'product', baseData = {}) {
    const skus = new Set();
    
    while (skus.size < count) {
      const sku = this.generateSKU(type, baseData);
      skus.add(sku);
    }
    
    return Array.from(skus);
  }

  parseGTIN(barcode) {
    const cleanBarcode = barcode.replace(/\D/g, '');
    
    if (cleanBarcode.length === 8) {
      return { type: 'EAN-8', code: cleanBarcode };
    } else if (cleanBarcode.length === 12) {
      return { type: 'UPC-A', code: cleanBarcode };
    } else if (cleanBarcode.length === 13) {
      return { type: 'EAN-13', code: cleanBarcode };
    } else if (cleanBarcode.length === 14) {
      return { type: 'GTIN-14', code: cleanBarcode };
    }
    
    return null;
  }

  generateBarcode(type = 'EAN-13') {
    let barcode = '';
    
    switch (type) {
      case 'EAN-13':
        barcode = '200';
        for (let i = 0; i < 9; i++) {
          barcode += Math.floor(Math.random() * 10);
        }
        barcode += this.calculateCheckDigit(barcode);
        break;
      case 'UPC-A':
        for (let i = 0; i < 11; i++) {
          barcode += Math.floor(Math.random() * 10);
        }
        barcode += this.calculateCheckDigit(barcode);
        break;
      default:
        throw new Error('Unsupported barcode type');
    }
    
    return barcode;
  }

  calculateCheckDigit(code) {
    let sum = 0;
    for (let i = 0; i < code.length; i++) {
      sum += parseInt(code[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return ((10 - (sum % 10)) % 10).toString();
  }
}

module.exports = new SKUGenerator();