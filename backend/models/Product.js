const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const aggregatePaginate = require('mongoose-aggregate-paginate-v2');
const slugify = require('slugify');

const variantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true
  },
  attributes: {
    color: String,
    size: String,
    material: String,
    style: String,
    custom: Map
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  comparePrice: {
    type: Number,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  stock: {
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    available: {
      type: Number,
      default: 0
    },
    trackInventory: {
      type: Boolean,
      default: true
    },
    allowBackorder: {
      type: Boolean,
      default: false
    },
    lowStockThreshold: {
      type: Number,
      default: 5
    }
  },
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['kg', 'g', 'lb', 'oz'],
      default: 'kg'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm', 'in', 'ft'],
      default: 'cm'
    }
  },
  images: [{
    url: String,
    publicId: String,
    alt: String,
    order: Number
  }],
  barcode: String,
  isActive: {
    type: Boolean,
    default: true
  }
});

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
    index: true
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    index: true
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  shortDescription: {
    type: String,
    maxlength: 500
  },
  brand: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Brand',
    index: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true
  },
  subcategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  basePrice: {
    type: Number,
    required: true,
    min: 0,
    index: true
  },
  comparePrice: {
    type: Number,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  taxClass: {
    type: String,
    enum: ['standard', 'reduced', 'zero', 'exempt'],
    default: 'standard'
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    index: true
  },
  variants: [variantSchema],
  hasVariants: {
    type: Boolean,
    default: false
  },
  variantAttributes: [{
    name: String,
    values: [String]
  }],
  images: [{
    url: String,
    publicId: String,
    alt: String,
    order: Number,
    isMain: Boolean
  }],
  stock: {
    quantity: {
      type: Number,
      default: 0,
      min: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    available: {
      type: Number,
      default: 0
    },
    trackInventory: {
      type: Boolean,
      default: true
    },
    allowBackorder: {
      type: Boolean,
      default: false
    },
    lowStockThreshold: {
      type: Number,
      default: 5
    }
  },
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['kg', 'g', 'lb', 'oz'],
      default: 'kg'
    }
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    unit: {
      type: String,
      enum: ['cm', 'm', 'in', 'ft'],
      default: 'cm'
    }
  },
  attributes: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  tags: [{
    type: String,
    lowercase: true
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'outofstock'],
    default: 'draft',
    index: true
  },
  visibility: {
    type: String,
    enum: ['visible', 'hidden', 'featured'],
    default: 'visible',
    index: true
  },
  publishedAt: Date,
  featuredAt: Date,
  seoMetadata: {
    title: String,
    description: String,
    keywords: [String],
    ogImage: String
  },
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    }
  },
  soldCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

productSchema.virtual('isInStock').get(function() {
  if (!this.stock.trackInventory) return true;
  return this.stock.available > 0 || this.stock.allowBackorder;
});

productSchema.virtual('discountPercentage').get(function() {
  if (this.comparePrice && this.basePrice < this.comparePrice) {
    return Math.round((1 - this.basePrice / this.comparePrice) * 100);
  }
  return 0;
});

productSchema.pre('save', async function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
    
    const existingSlug = await this.constructor.findOne({ 
      slug: this.slug, 
      _id: { $ne: this._id } 
    });
    
    if (existingSlug) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }

  if (this.stock.trackInventory) {
    this.stock.available = Math.max(0, this.stock.quantity - this.stock.reserved);
  } else {
    this.stock.available = Infinity;
  }

  this.hasVariants = this.variants && this.variants.length > 0;

  if (this.hasVariants) {
    this.variants.forEach(variant => {
      if (variant.stock.trackInventory) {
        variant.stock.available = Math.max(0, variant.stock.quantity - variant.stock.reserved);
      }
    });
  }

  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  if (this.visibility === 'featured' && !this.featuredAt) {
    this.featuredAt = new Date();
  }

  next();
});

productSchema.methods.updateStock = async function(quantity, operation = 'subtract') {
  if (!this.stock.trackInventory) return this;

  if (operation === 'subtract') {
    this.stock.quantity = Math.max(0, this.stock.quantity - quantity);
  } else if (operation === 'add') {
    this.stock.quantity += quantity;
  } else if (operation === 'set') {
    this.stock.quantity = quantity;
  }

  this.stock.available = Math.max(0, this.stock.quantity - this.stock.reserved);
  
  if (this.stock.available === 0 && !this.stock.allowBackorder) {
    this.status = 'outofstock';
  } else if (this.status === 'outofstock' && this.stock.available > 0) {
    this.status = 'published';
  }

  await this.save();
  return this;
};

productSchema.methods.reserveStock = async function(quantity) {
  if (!this.stock.trackInventory) return true;

  if (this.stock.available >= quantity || this.stock.allowBackorder) {
    this.stock.reserved += quantity;
    this.stock.available = Math.max(0, this.stock.quantity - this.stock.reserved);
    await this.save();
    return true;
  }
  
  return false;
};

productSchema.methods.releaseStock = async function(quantity) {
  this.stock.reserved = Math.max(0, this.stock.reserved - quantity);
  this.stock.available = Math.max(0, this.stock.quantity - this.stock.reserved);
  await this.save();
  return this;
};

productSchema.plugin(mongoosePaginate);
productSchema.plugin(aggregatePaginate);

productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, status: 1, visibility: 1 });
productSchema.index({ basePrice: 1, status: 1 });
productSchema.index({ createdAt: -1, status: 1 });
productSchema.index({ 'rating.average': -1, status: 1 });
productSchema.index({ soldCount: -1, status: 1 });

module.exports = mongoose.model('Product', productSchema);