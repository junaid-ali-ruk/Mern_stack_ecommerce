const jwt = require('jsonwebtoken');

exports.authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

exports.authorize = (...roles) => {
  return async (req, res, next) => {
    try {
      const user = await require('../models/User').findById(req.userId);
      
      if (!user || !roles.includes(user.role)) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      req.user = user;
      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};

