const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
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
    maxlength: 500
  },
  image: {
    url: String,
    publicId: String
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
    index: true
  },
  ancestors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  level: {
    type: Number,
    default: 0,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  seoMetadata: {
    title: String,
    description: String,
    keywords: [String]
  },
  attributes: [{
    name: String,
    type: {
      type: String,
      enum: ['text', 'number', 'select', 'multiselect', 'boolean', 'date']
    },
    required: Boolean,
    options: [String]
  }],
  productCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

categorySchema.pre('save', async function(next) {
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

  if (this.isModified('parent') && this.parent) {
    const parent = await this.constructor.findById(this.parent);
    if (parent) {
      this.ancestors = [...parent.ancestors, parent._id];
      this.level = parent.level + 1;
    }
  } else if (!this.parent) {
    this.ancestors = [];
    this.level = 0;
  }

  next();
});

categorySchema.methods.getAllDescendants = async function() {
  const descendants = await this.constructor.find({
    ancestors: this._id
  });
  return descendants;
};

categorySchema.statics.buildTree = async function() {
  const categories = await this.find({ isActive: true })
    .sort('displayOrder name')
    .lean();

  const categoryMap = {};
  const tree = [];

  categories.forEach(cat => {
    categoryMap[cat._id] = { ...cat, children: [] };
  });

  categories.forEach(cat => {
    if (cat.parent) {
      if (categoryMap[cat.parent]) {
        categoryMap[cat.parent].children.push(categoryMap[cat._id]);
      }
    } else {
      tree.push(categoryMap[cat._id]);
    }
  });

  return tree;
};

categorySchema.index({ slug: 1, isActive: 1 });
categorySchema.index({ parent: 1, displayOrder: 1 });

module.exports = mongoose.model('Category', categorySchema);