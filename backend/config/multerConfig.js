const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('./cloudinary');
const path = require('path');
const crypto = require('crypto');

const createCloudinaryStorage = (folder) => {
  return new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const fileExt = path.extname(file.originalname).substring(1);
      const fileName = `${crypto.randomBytes(16).toString('hex')}-${Date.now()}`;
      
      return {
        folder: folder,
        public_id: fileName,
        format: fileExt,
        transformation: [
          { width: 1200, height: 1200, crop: 'limit', quality: 'auto:best' }
        ],
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
      };
    }
  });
};

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF are allowed'), false);
  }
};

const productImageUpload = multer({
  storage: createCloudinaryStorage('products'),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: fileFilter
});

const categoryImageUpload = multer({
  storage: createCloudinaryStorage('categories'),
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: fileFilter
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || 
        file.mimetype === 'application/vnd.ms-excel' ||
        path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

module.exports = {
  productImageUpload,
  categoryImageUpload,
  csvUpload
};