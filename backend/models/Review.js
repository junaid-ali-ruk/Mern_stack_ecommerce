const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'product.variants'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  title: {
    type: String,
    maxlength: 100
  },
  content: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 5000
  },
  pros: [String],
  cons: [String],
  images: [{
    url: String,
    publicId: String,
    caption: String
  }],
  videos: [{
    url: String,
    thumbnail: String,
    duration: Number
  }],
  verifiedPurchase: {
    type: Boolean,
    default: false
  },
  helpful: {
    yes: {
      type: Number,
      default: 0
    },
    no: {
      type: Number,
      default: 0
    },
    users: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      vote: {
        type: String,
        enum: ['yes', 'no']
      }
    }]
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged'],
    default: 'pending',
    index: true
  },
  moderationNotes: String,
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  moderatedAt: Date,
  sentiment: {
    score: Number,
    magnitude: Number,
    label: {
      type: String,
      enum: ['positive', 'neutral', 'negative']
    }
  },
  keywords: [String],
  aspects: [{
    aspect: String,
    sentiment: String,
    score: Number
  }],
  reports: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'fake', 'offensive', 'other']
    },
    description: String,
    reportedAt: Date
  }],
  response: {
    content: String,
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: Date
  },
  edited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: Date
  }],
  featured: {
    type: Boolean,
    default: false
  },
  metrics: {
    readCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    reportCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

reviewSchema.index({ product: 1, rating: -1 });
reviewSchema.index({ user: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });
reviewSchema.index({ verifiedPurchase: 1 });
reviewSchema.index({ 'sentiment.label': 1 });

reviewSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('content')) {
    const sentiment = require('sentiment');
    const analyzer = new sentiment();
    
    const result = analyzer.analyze(this.content);
    
    this.sentiment = {
      score: result.score,
      magnitude: Math.abs(result.score),
      label: result.score > 2 ? 'positive' : result.score < -2 ? 'negative' : 'neutral'
    };
    
    this.keywords = result.words;
    
    await this.analyzeAspects();
  }
  
  if (this.isNew) {
    await this.verifyPurchase();
  }
  
  next();
});

reviewSchema.methods.verifyPurchase = async function() {
  const Order = mongoose.model('Order');
  
  const order = await Order.findOne({
    _id: this.order,
    user: this.user,
    'items.product': this.product,
    status: 'delivered'
  });
  
  this.verifiedPurchase = !!order;
};

reviewSchema.methods.analyzeAspects = async function() {
  const aspects = [
    { keyword: ['quality', 'build', 'material'], aspect: 'quality' },
    { keyword: ['price', 'value', 'worth', 'expensive', 'cheap'], aspect: 'value' },
    { keyword: ['delivery', 'shipping', 'package'], aspect: 'shipping' },
    { keyword: ['service', 'support', 'help'], aspect: 'service' },
    { keyword: ['size', 'fit', 'dimension'], aspect: 'sizing' }
  ];
  
  const sentiment = require('sentiment');
  const analyzer = new sentiment();
  
  this.aspects = [];
  
  for (const { keyword, aspect } of aspects) {
    const relevantText = this.content.toLowerCase();
    const hasAspect = keyword.some(k => relevantText.includes(k));
    
    if (hasAspect) {
      const sentences = this.content.split(/[.!?]/).filter(s => 
        keyword.some(k => s.toLowerCase().includes(k))
      );
      
      let totalScore = 0;
      sentences.forEach(sentence => {
        const result = analyzer.analyze(sentence);
        totalScore += result.score;
      });
      
      this.aspects.push({
        aspect,
        sentiment: totalScore > 0 ? 'positive' : totalScore < 0 ? 'negative' : 'neutral',
        score: totalScore / sentences.length
      });
    }
  }
};

reviewSchema.methods.moderate = async function(status, moderatorId, notes) {
  this.status = status;
  this.moderatedBy = moderatorId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  
  await this.save();
  
  if (status === 'approved') {
    await this.updateProductRating();
  }
};

reviewSchema.methods.updateProductRating = async function() {
  const Product = mongoose.model('Product');
  
  const stats = await this.constructor.aggregate([
    {
      $match: {
        product: this.product,
        status: 'approved'
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        distribution: {
          $push: '$rating'
        }
      }
    }
  ]);
  
  if (stats.length > 0) {
    const product = await Product.findById(this.product);
    product.rating = {
      average: Math.round(stats[0].averageRating * 10) / 10,
      count: stats[0].totalReviews
    };
    await product.save();
  }
};

reviewSchema.methods.vote = async function(userId, voteType) {
  const existingVote = this.helpful.users.find(v => 
    v.user.toString() === userId.toString()
  );
  
  if (existingVote) {
    if (existingVote.vote === voteType) {
      return this;
    }
    
    this.helpful[existingVote.vote]--;
    existingVote.vote = voteType;
    this.helpful[voteType]++;
  } else {
    this.helpful.users.push({
      user: userId,
      vote: voteType
    });
    this.helpful[voteType]++;
  }
  
  await this.save();
  return this;
};

reviewSchema.methods.report = async function(userId, reason, description) {
  const existingReport = this.reports.find(r => 
    r.user.toString() === userId.toString()
  );
  
  if (existingReport) {
    throw new Error('You have already reported this review');
  }
  
  this.reports.push({
    user: userId,
    reason,
    description,
    reportedAt: new Date()
  });
  
  this.metrics.reportCount++;
  
  if (this.metrics.reportCount >= 5) {
    this.status = 'flagged';
  }
  
  await this.save();
  return this;
};

reviewSchema.statics.getProductStats = async function(productId) {
  const stats = await this.aggregate([
    {
      $match: {
        product: mongoose.Types.ObjectId(productId),
        status: 'approved'
      }
    },
    {
      $facet: {
        overview: [
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$rating' },
              totalReviews: { $sum: 1 },
              verifiedCount: {
                $sum: { $cond: ['$verifiedPurchase', 1, 0] }
              },
              withImages: {
                $sum: { $cond: [{ $gt: [{ $size: '$images' }, 0] }, 1, 0] }
              }
            }
          }
        ],
        distribution: [
          {
            $group: {
              _id: '$rating',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { _id: -1 }
          }
        ],
        sentiments: [
          {
            $group: {
              _id: '$sentiment.label',
              count: { $sum: 1 }
            }
          }
        ],
        aspects: [
          {
            $unwind: '$aspects'
          },
          {
            $group: {
              _id: '$aspects.aspect',
              positive: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'positive'] }, 1, 0] }
              },
              negative: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'negative'] }, 1, 0] }
              },
              neutral: {
                $sum: { $cond: [{ $eq: ['$aspects.sentiment', 'neutral'] }, 1, 0] }
              }
            }
          }
        ],
        topKeywords: [
          {
            $unwind: '$keywords'
          },
          {
            $group: {
              _id: '$keywords',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 10
          }
        ]
      }
    }
  ]);
  
  return stats[0];
};

module.exports = mongoose.model('Review', reviewSchema);