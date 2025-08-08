const Warehouse = require('../models/Warehouse');
const advancedShippingService = require('../services/advancedShippingService');

exports.createWarehouse = async (req, res) => {
  try {
    const warehouse = await Warehouse.create(req.body);
    res.status(201).json({ success: true, warehouse });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.allocateInventory = async (req, res) => {
  try {
    const { orderId, items, destination } = req.body;
    
    const allocations = await advancedShippingService.allocateInventory(
      orderId,
      items,
      destination
    );
    
    res.json({ success: true, allocations });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.calculateLocalDelivery = async (req, res) => {
  try {
    const { origin, destination, items } = req.body;
    
    const delivery = await advancedShippingService.calculateLocalDelivery(
      origin,
      destination,
      items
    );
    
    res.json({ success: true, delivery });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.calculatePackaging = async (req, res) => {
  try {
    const { items } = req.body;
    
    const packages = await advancedShippingService.calculatePackaging(items);
    
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.confirmDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { signature, photo, location } = req.body;
    
    const confirmation = await advancedShippingService.confirmDelivery(
      orderId,
      signature,
      photo,
      location
    );
    
    res.json({ success: true, confirmation });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.trackRealTimeShipment = async (req, res) => {
  try {
    const { trackingNumber, carrier } = req.params;
    
    const tracking = await advancedShippingService.trackRealTimeShipment(
      trackingNumber,
      carrier
    );
    
    res.json({ success: true, tracking });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// controllers/reviewController.js
const reviewService = require('../services/reviewService');
const Review = require('../models/Review');

exports.createReview = async (req, res) => {
  try {
    const reviewData = {
      ...req.body,
      user: req.userId
    };
    
    const review = await reviewService.createReview(reviewData);
    await reviewService.autoModerateReview(review);
    
    res.status(201).json({ success: true, review });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    const review = await Review.findOne({
      _id: reviewId,
      user: req.userId
    });
    
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    if (review.edited) {
      review.editHistory.push({
        content: review.content,
        editedAt: new Date()
      });
    }
    
    Object.assign(review, req.body);
    review.edited = true;
    
    await review.save();
    
    res.json({ success: true, review });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    
    const review = await Review.findOneAndDelete({
      _id: reviewId,
      user: req.userId
    });
    
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    await review.updateProductRating();
    
    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReviews = async (req, res) => {
  try {
    const reviews = await reviewService.getReviews(req.query);
    res.json({ success: true, ...reviews });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.voteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { vote } = req.body;
    
    const review = await Review.findById(reviewId);
    
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    await review.vote(req.userId, vote);
    
    res.json({ success: true, helpful: review.helpful });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.reportReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { reason, description } = req.body;
    
    const review = await Review.findById(reviewId);
    
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    await review.report(req.userId, reason, description);
    
    res.json({ success: true, message: 'Review reported successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.moderateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, notes } = req.body;
    
    const review = await Review.findById(reviewId);
    
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }
    
    await review.moderate(status, req.userId, notes);
    
    res.json({ success: true, review });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getReviewStats = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const stats = await reviewService.getReviewStats(productId);
    
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReviewInsights = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const insights = await reviewService.generateReviewInsights(productId);
    
    res.json({ success: true, insights });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.detectFakeReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const suspicious = await reviewService.detectFakeReviews(productId);
    
    res.json({ success: true, suspicious });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};