const Review = require('../models/Review');
const BadWordsFilter = require('bad-words');
const natural = require('natural');
const tf = require('@tensorflow/tfjs-node');

class ReviewService {
  constructor() {
    this.badWordsFilter = new BadWordsFilter();
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  async createReview(reviewData) {
    const cleanContent = this.moderateContent(reviewData.content);
    
    if (cleanContent.blocked) {
      throw new Error('Review contains inappropriate content');
    }
    
    const review = new Review({
      ...reviewData,
      content: cleanContent.text
    });
    
    await review.save();
    
    if (review.status === 'approved') {
      await review.updateProductRating();
    }
    
    return review;
  }

  moderateContent(content) {
    try {
      const cleaned = this.badWordsFilter.clean(content);
      const blocked = cleaned !== content && cleaned.includes('*');
      
      return {
        text: cleaned,
        blocked,
        flagged: blocked
      };
    } catch (error) {
      return {
        text: content,
        blocked: false,
        flagged: false
      };
    }
  }

  async autoModerateReview(review) {
    const flags = [];
    
    if (review.content.length < 20) {
      flags.push('too_short');
    }
    
    if (review.content === review.content.toUpperCase()) {
      flags.push('all_caps');
    }
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    if (urlRegex.test(review.content)) {
      flags.push('contains_url');
    }
    
    const emailRegex = /\S+@\S+\.\S+/;
    if (emailRegex.test(review.content)) {
      flags.push('contains_email');
    }
    
    const phoneRegex = /[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/;
    if (phoneRegex.test(review.content)) {
      flags.push('contains_phone');
    }
    
    if (review.sentiment.score < -10) {
      flags.push('extremely_negative');
    }
    
    if (flags.length > 0) {
      review.status = 'pending';
      review.moderationNotes = `Auto-flagged: ${flags.join(', ')}`;
    } else {
      review.status = 'approved';
    }
    
    await review.save();
    return review;
  }

  async getReviews(filters = {}) {
    const {
      productId,
      userId,
      status = 'approved',
      rating,
      verifiedOnly = false,
      sortBy = '-createdAt',
      page = 1,
      limit = 10
    } = filters;
    
    const query = {};
    
    if (productId) query.product = productId;
    if (userId) query.user = userId;
    if (status) query.status = status;
    if (rating) query.rating = rating;
    if (verifiedOnly) query.verifiedPurchase = true;
    
    const reviews = await Review.find(query)
      .sort(sortBy)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('user', 'name avatar')
      .populate('product', 'name slug');
    
    const total = await Review.countDocuments(query);
    
    return {
      reviews,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  }

  async getReviewStats(productId) {
    return Review.getProductStats(productId);
  }

  async analyzeReviewTrends(productId, period = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    
    const reviews = await Review.find({
      product: productId,
      status: 'approved',
      createdAt: { $gte: startDate }
    });
    
    const trends = {
      timeline: {},
      sentimentTrend: [],
      keywordTrend: {},
      aspectTrend: {}
    };
    
    reviews.forEach(review => {
      const date = review.createdAt.toISOString().split('T')[0];
      
      if (!trends.timeline[date]) {
        trends.timeline[date] = {
          count: 0,
          totalRating: 0,
          sentiments: { positive: 0, neutral: 0, negative: 0 }
        };
      }
      
      trends.timeline[date].count++;
      trends.timeline[date].totalRating += review.rating;
      trends.timeline[date].sentiments[review.sentiment.label]++;
      
      review.keywords.forEach(keyword => {
        if (!trends.keywordTrend[keyword]) {
          trends.keywordTrend[keyword] = 0;
        }
        trends.keywordTrend[keyword]++;
      });
      
      review.aspects.forEach(aspect => {
        if (!trends.aspectTrend[aspect.aspect]) {
          trends.aspectTrend[aspect.aspect] = {
            positive: 0,
            negative: 0,
            neutral: 0
          };
        }
        trends.aspectTrend[aspect.aspect][aspect.sentiment]++;
      });
    });
    
    Object.keys(trends.timeline).forEach(date => {
      trends.timeline[date].averageRating = 
        trends.timeline[date].totalRating / trends.timeline[date].count;
    });
    
    return trends;
  }

  async generateReviewInsights(productId) {
    const stats = await this.getReviewStats(productId);
    const trends = await this.analyzeReviewTrends(productId);
    
    const insights = {
      summary: {
        averageRating: stats.overview[0]?.averageRating || 0,
        totalReviews: stats.overview[0]?.totalReviews || 0,
        verifiedPercentage: stats.overview[0] ? 
          (stats.overview[0].verifiedCount / stats.overview[0].totalReviews * 100) : 0,
        sentiment: this.determineSentiment(stats.sentiments)
      },
      strengths: [],
      weaknesses: [],
      recommendations: []
    };
    
    stats.aspects.forEach(aspect => {
      if (aspect.positive > aspect.negative * 2) {
        insights.strengths.push(aspect._id);
      } else if (aspect.negative > aspect.positive * 2) {
        insights.weaknesses.push(aspect._id);
      }
    });
    
    if (insights.summary.averageRating < 3) {
      insights.recommendations.push('Consider product improvements based on negative feedback');
    }
    
    if (insights.summary.verifiedPercentage < 50) {
      insights.recommendations.push('Encourage verified purchasers to leave reviews');
    }
    
    if (stats.overview[0]?.withImages < stats.overview[0]?.totalReviews * 0.1) {
      insights.recommendations.push('Encourage customers to add photos to their reviews');
    }
    
    return insights;
  }

  determineSentiment(sentiments) {
    const total = sentiments.reduce((sum, s) => sum + s.count, 0);
    const positive = sentiments.find(s => s._id === 'positive')?.count || 0;
    const negative = sentiments.find(s => s._id === 'negative')?.count || 0;
    
    if (positive > total * 0.7) return 'Very Positive';
    if (positive > total * 0.5) return 'Mostly Positive';
    if (negative > total * 0.5) return 'Mostly Negative';
    return 'Mixed';
  }

  async detectFakeReviews(productId) {
    const reviews = await Review.find({
      product: productId,
      status: 'approved'
    }).populate('user');
    
    const suspicious = [];
    
    for (const review of reviews) {
      let suspicionScore = 0;
      
      if (!review.verifiedPurchase) suspicionScore += 2;
      
      const userReviews = await Review.countDocuments({ user: review.user._id });
      if (userReviews === 1) suspicionScore += 1;
      
      const sameDay = reviews.filter(r => 
        r.createdAt.toDateString() === review.createdAt.toDateString()
      ).length;
      if (sameDay > 5) suspicionScore += 2;
      
      if (review.content.length < 50) suspicionScore += 1;
      
      if (review.rating === 5 && review.sentiment.score < 5) suspicionScore += 2;
      if (review.rating === 1 && review.sentiment.score > -5) suspicionScore += 2;
      
      if (suspicionScore >= 5) {
        suspicious.push({
          review: review._id,
          score: suspicionScore,
          reasons: this.getSuspicionReasons(suspicionScore)
        });
      }
    }
    
    return suspicious;
  }

  getSuspicionReasons(score) {
    const reasons = [];
    if (score >= 2) reasons.push('Not verified purchase');
    if (score >= 1) reasons.push('New reviewer');
    if (score >= 2) reasons.push('Multiple reviews same day');
    if (score >= 1) reasons.push('Very short review');
    if (score >= 2) reasons.push('Rating sentiment mismatch');
    return reasons;
  }
}

module.exports = new ReviewService();