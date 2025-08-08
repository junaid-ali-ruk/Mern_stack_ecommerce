const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const categoryController = require('../controllers/categoryController');
const { authenticate, authorize } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermission');
const uploadController = require('../controllers/uploadController');
const searchController = require('../controllers/searchController');
const bulkImportController = require('../controllers/bulkImportController');
const { productImageUpload, csvUpload } = require('../config/multerConfig');
const { 
  validateProduct, 
  validateCategory, 
  validateObjectId 
} = require('../validators/productValidator');

router.get('/products', productController.getProducts);
router.get('/products/:id', validateObjectId, productController.getProduct);

router.post('/products',
  authenticate,
  checkPermission('products', 'create'),
  validateProduct,
  productController.createProduct
);

router.put('/products/:id',
  authenticate,
  checkPermission('products', 'update'),
  validateObjectId,
  validateProduct,
  productController.updateProduct
);

router.delete('/products/:id',
  authenticate,
  checkPermission('products', 'delete'),
  validateObjectId,
  productController.deleteProduct
);

router.patch('/products/:id/stock',
  authenticate,
  checkPermission('products', 'update'),
  validateObjectId,
  productController.updateProductStock
);

router.patch('/products/bulk-update',
  authenticate,
  checkPermission('products', 'update'),
  productController.bulkUpdateProducts
);

router.get('/products/:id/variants',
  validateObjectId,
  productController.getProductVariants
);

router.post('/products/:id/variants',
  authenticate,
  checkPermission('products', 'update'),
  validateObjectId,
  productController.createProductVariant
);

router.put('/products/:id/variants/:variantId',
  authenticate,
  checkPermission('products', 'update'),
  productController.updateProductVariant
);

router.delete('/products/:id/variants/:variantId',
  authenticate,
  checkPermission('products', 'update'),
  productController.deleteProductVariant
);

router.get('/categories', categoryController.getCategories);
router.get('/categories/tree', categoryController.getCategoryTree);
router.get('/categories/:id', validateObjectId, categoryController.getCategory);
router.get('/categories/slug/:slug', categoryController.getCategoryBySlug);

router.post('/categories',
  authenticate,
  checkPermission('products', 'create'),
  validateCategory,
  categoryController.createCategory
);

router.put('/categories/:id',
  authenticate,
  checkPermission('products', 'update'),
  validateObjectId,
  validateCategory,
  categoryController.updateCategory
);

router.delete('/categories/:id',
  authenticate,
  checkPermission('products', 'delete'),
  validateObjectId,
  categoryController.deleteCategory
);

router.patch('/categories/reorder',
  authenticate,
  checkPermission('products', 'update'),
  categoryController.reorderCategories
);

router.get('/products/search', searchController.searchProducts);
router.get('/products/search/suggestions', searchController.getSearchSuggestions);

router.post('/products/:productId/images',
  authenticate,
  checkPermission('products', 'update'),
  productImageUpload.array('images', 10),
  uploadController.uploadProductImages
);

router.delete('/products/:productId/images/:imageId',
  authenticate,
  checkPermission('products', 'update'),
  uploadController.deleteProductImage
);

router.patch('/products/:productId/images/reorder',
  authenticate,
  checkPermission('products', 'update'),
  uploadController.reorderProductImages
);

router.get('/products/:productId/images/:imageId/variations',
  uploadController.generateImageVariations
);

router.post('/products/import',
  authenticate,
  checkPermission('products', 'create'),
  csvUpload.single('file'),
  bulkImportController.importProducts
);

router.post('/products/import/validate',
  authenticate,
  checkPermission('products', 'create'),
  csvUpload.single('file'),
  bulkImportController.validateImport
);

router.get('/products/import/template',
  authenticate,
  bulkImportController.downloadTemplate
);

router.get('/stock/report',
  authenticate,
  checkPermission('products', 'read'),
  stockController.getStockReport
);

router.get('/stock/low',
  authenticate,
  checkPermission('products', 'read'),
  stockController.getLowStockProducts
);

router.post('/stock/adjust',
  authenticate,
  checkPermission('products', 'update'),
  stockController.adjustStock
);

module.exports = router;