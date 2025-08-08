const User = require('../models/User');

const rolePermissions = {
  admin: {
    products: ['create', 'read', 'update', 'delete'],
    orders: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    analytics: ['read'],
    settings: ['read', 'update']
  },
  manager: {
    products: ['create', 'read', 'update'],
    orders: ['read', 'update'],
    users: ['read'],
    analytics: ['read'],
    settings: ['read']
  },
  user: {
    products: ['read'],
    orders: ['create', 'read'],
    users: ['read:own', 'update:own'],
    analytics: [],
    settings: []
  }
};

exports.checkPermission = (resource, action) => {
  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId);
      
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      const userPermissions = rolePermissions[user.role];
      
      if (!userPermissions || !userPermissions[resource]) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const allowedActions = userPermissions[resource];
      
      if (action.includes(':own')) {
        const baseAction = action.split(':')[0];
        if (allowedActions.includes(action) || allowedActions.includes(baseAction)) {
          req.ownershipRequired = true;
          return next();
        }
      } else if (allowedActions.includes(action)) {
        return next();
      }

      res.status(403).json({ message: 'Insufficient permissions' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};

exports.checkOwnership = (getResourceOwnerId) => {
  return async (req, res, next) => {
    if (!req.ownershipRequired) {
      return next();
    }

    try {
      const ownerId = await getResourceOwnerId(req);
      
      if (ownerId.toString() !== req.userId.toString()) {
        return res.status(403).json({ message: 'Access denied: not owner' });
      }

      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};