const csv = require('csv-parser');
const { Readable } = require('stream');
const Product = require('../models/Product');
const Category = require('../models/Category');
const skuService = require('./skuService');
const mongoose = require('mongoose');

class BulkImportService {
  async importProducts(fileBuffer, options = {}) {
    const {
      updateExisting = false,
      skipErrors = true,
      userId
    } = options;

    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      errors: [],
      products: []
    };

    const products = await this.parseCSV(fileBuffer);
    results.total = products.length;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const [index, productData] of products.entries()) {
        try {
          const processedProduct = await this.processProductData(productData);
          
          if (updateExisting && processedProduct.sku) {
            const existingProduct = await Product.findOne({ sku: processedProduct.sku });
            
            if (existingProduct) {
              Object.assign(existingProduct, {
                ...processedProduct,
                updatedBy: userId
              });
              await existingProduct.save({ session });
              results.products.push(existingProduct);
            } else {
              const newProduct = await Product.create([{
                ...processedProduct,
                createdBy: userId,
                updatedBy: userId
              }], { session });
              results.products.push(newProduct[0]);
            }
          } else {
            if (!processedProduct.sku) {
              processedProduct.sku = skuService.generateSKU('product', {
                category: processedProduct.category
              });
            }

            const newProduct = await Product.create([{
              ...processedProduct,
              createdBy: userId,
              updatedBy: userId
            }], { session });
            results.products.push(newProduct[0]);
          }

          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            row: index + 2,
            data: productData,
            error: error.message
          });

          if (!skipErrors) {
            throw error;
          }
        }
      }

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    return results;
  }

  async parseCSV(fileBuffer) {
    return new Promise((resolve, reject) => {
      const products = [];
      const stream = Readable.from(fileBuffer);

      stream
        .pipe(csv())
        .on('data', (data) => {
          products.push(data);
        })
        .on('end', () => {
          resolve(products);
        })
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  async processProductData(rawData) {
    const processed = {
      name: rawData.name || rawData.title || rawData.product_name,
      description: rawData.description || rawData.desc || '',
      shortDescription: rawData.short_description || rawData.summary || '',
      sku: rawData.sku || rawData.SKU || rawData.product_code,
      basePrice: parseFloat(rawData.price || rawData.basePrice || 0),
      comparePrice: rawData.compare_price ? parseFloat(rawData.compare_price) : undefined,
      costPrice: rawData.cost_price ? parseFloat(rawData.cost_price) : undefined,
      status: rawData.status || 'draft',
      visibility: rawData.visibility || 'visible'
    };

    if (rawData.category) {
      const category = await this.findOrCreateCategory(rawData.category);
      processed.category = category._id;
    }

    if (rawData.subcategories) {
      const subcategoryNames = rawData.subcategories.split(',').map(s => s.trim());
      const subcategoryIds = [];
      
      for (const name of subcategoryNames) {
        const subcategory = await this.findOrCreateCategory(name, processed.category);
        subcategoryIds.push(subcategory._id);
      }
      
      processed.subcategories = subcategoryIds;
    }

    if (rawData.stock_quantity !== undefined) {
      processed.stock = {
        quantity: parseInt(rawData.stock_quantity),
        trackInventory: rawData.track_inventory !== 'false',
        allowBackorder: rawData.allow_backorder === 'true',
        lowStockThreshold: parseInt(rawData.low_stock_threshold) || 5
      };
    }

    if (rawData.weight) {
      processed.weight = {
        value: parseFloat(rawData.weight),
        unit: rawData.weight_unit || 'kg'
      };
    }

    if (rawData.dimensions) {
      const dims = rawData.dimensions.split('x').map(d => parseFloat(d.trim()));
      if (dims.length === 3) {
        processed.dimensions = {
          length: dims[0],
          width: dims[1],
          height: dims[2],
          unit: rawData.dimension_unit || 'cm'
        };
      }
    }

    if (rawData.tags) {
      processed.tags = rawData.tags.split(',').map(tag => tag.trim().toLowerCase());
    }

    if (rawData.images) {
      processed.images = rawData.images.split(',').map((url, index) => ({
        url: url.trim(),
        order: index,
        isMain: index === 0
      }));
    }

    if (rawData.variants) {
      processed.variants = await this.parseVariants(rawData.variants);
      processed.hasVariants = processed.variants.length > 0;
    }

    const attributes = {};
    Object.keys(rawData).forEach(key => {
      if (key.startsWith('attr_')) {
        const attrName = key.substring(5);
        attributes[attrName] = rawData[key];
      }
    });
    
    if (Object.keys(attributes).length > 0) {
      processed.attributes = attributes;
    }

    return processed;
  }

  async findOrCreateCategory(name, parentId = null) {
    const query = { name: { $regex: new RegExp(`^${name}$`, 'i') } };
    if (parentId) {
      query.parent = parentId;
    }

    let category = await Category.findOne(query);
    
    if (!category) {
      category = await Category.create({
        name,
        parent: parentId,
        isActive: true
      });
    }

    return category;
  }

  async parseVariants(variantsString) {
    try {
      const variants = JSON.parse(variantsString);
      
      return variants.map(variant => ({
        name: variant.name || variant.title,
        sku: variant.sku || skuService.generateSKU('variant', { attributes: variant }),
        attributes: {
          color: variant.color,
          size: variant.size,
          material: variant.material,
          style: variant.style
        },
        price: parseFloat(variant.price),
        comparePrice: variant.compare_price ? parseFloat(variant.compare_price) : undefined,
        stock: {
          quantity: parseInt(variant.stock_quantity || 0),
          trackInventory: variant.track_inventory !== false,
          allowBackorder: variant.allow_backorder === true
        },
        isActive: variant.active !== false
      }));
    } catch (error) {
      return [];
    }
  }

  generateCSVTemplate() {
    const headers = [
      'name',
      'description',
      'short_description',
      'sku',
      'price',
      'compare_price',
      'cost_price',
      'category',
      'subcategories',
      'stock_quantity',
      'track_inventory',
      'allow_backorder',
      'low_stock_threshold',
      'weight',
      'weight_unit',
      'dimensions',
      'dimension_unit',
      'tags',
      'images',
      'status',
      'visibility',
      'variants',
      'attr_color',
      'attr_material',
      'attr_brand'
    ];

    const sampleData = [
      {
        name: 'Sample Product',
        description: 'This is a sample product description',
        short_description: 'Sample short description',
        sku: 'SAMPLE-001',
        price: '29.99',
        compare_price: '39.99',
        cost_price: '15.00',
        category: 'Electronics',
        subcategories: 'Phones, Accessories',
        stock_quantity: '100',
        track_inventory: 'true',
        allow_backorder: 'false',
        low_stock_threshold: '10',
        weight: '0.5',
        weight_unit: 'kg',
        dimensions: '10x5x2',
        dimension_unit: 'cm',
        tags: 'sample, electronics, new',
        images: 'https://example.com/image1.jpg, https://example.com/image2.jpg',
        status: 'published',
        visibility: 'visible',
        variants: '[{"name":"Red - Small","sku":"SAMPLE-001-RS","color":"Red","size":"Small","price":"29.99","stock_quantity":"50"}]',
        attr_color: 'Black',
        attr_material: 'Plastic',
        attr_brand: 'SampleBrand'
      }
    ];

    const csvContent = [
      headers.join(','),
      ...sampleData.map(row => 
        headers.map(header => `"${row[header] || ''}"`).join(',')
      )
    ].join('\n');

    return csvContent;
  }

  async validateCSV(fileBuffer) {
    const errors = [];
    const warnings = [];
    const products = await this.parseCSV(fileBuffer);

    const requiredFields = ['name', 'price', 'category'];
    const skus = new Set();

    products.forEach((product, index) => {
      const rowNumber = index + 2;

      requiredFields.forEach(field => {
        if (!product[field]) {
          errors.push(`Row ${rowNumber}: Missing required field '${field}'`);
        }
      });

      if (product.price && isNaN(parseFloat(product.price))) {
        errors.push(`Row ${rowNumber}: Invalid price value`);
      }

      if (product.sku) {
        if (skus.has(product.sku)) {
          errors.push(`Row ${rowNumber}: Duplicate SKU '${product.sku}'`);
        }
        skus.add(product.sku);
      }

      if (product.stock_quantity && isNaN(parseInt(product.stock_quantity))) {
        warnings.push(`Row ${rowNumber}: Invalid stock quantity, defaulting to 0`);
      }

      if (product.images) {
        const urls = product.images.split(',');
        urls.forEach(url => {
          if (!this.isValidUrl(url.trim())) {
            warnings.push(`Row ${rowNumber}: Invalid image URL '${url.trim()}'`);
          }
        });
      }
    });

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      totalRows: products.length
    };
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }
}

module.exports = new BulkImportService();