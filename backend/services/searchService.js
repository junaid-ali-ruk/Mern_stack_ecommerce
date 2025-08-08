const Product = require('../models/Product');
const Category = require('../models/Category');

class SearchService {
  async searchProducts(params) {
    const {
      q,
      category,
      subcategory,
      brand,
      minPrice,
      maxPrice,
      tags,
      attributes,
      inStock,
      sort = 'relevance',
      page = 1,
      limit = 20
    } = params;

    const pipeline = [];

    if (q) {
      pipeline.push({
        $search: {
          index: 'product_search',
          compound: {
            should: [
              {
                text: {
                  query: q,
                  path: 'name',
                  score: { boost: { value: 3 } }
                }
              },
              {
                text: {
                  query: q,
                  path: 'description',
                  score: { boost: { value: 1 } }
                }
              },
              {
                text: {
                  query: q,
                  path: 'tags',
                  score: { boost: { value: 2 } }
                }
              },
              {
                text: {
                  query: q,
                  path: 'sku'
                }
              }
            ]
          }
        }
      });

      pipeline.push({
        $addFields: {
          searchScore: { $meta: 'searchScore' }
        }
      });
    }

    const matchStage = { $match: { status: 'published' } };

    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        matchStage.$match.category = mongoose.Types.ObjectId(category);
      } else {
        const cat = await Category.findOne({ slug: category });
        if (cat) {
          const descendants = await cat.getAllDescendants();
          const categoryIds = [cat._id, ...descendants.map(d => d._id)];
          matchStage.$match.category = { $in: categoryIds };
        }
      }
    }

    if (subcategory) {
      matchStage.$match.subcategories = mongoose.Types.ObjectId(subcategory);
    }

    if (brand) {
      matchStage.$match.brand = mongoose.Types.ObjectId(brand);
    }

    if (minPrice || maxPrice) {
      matchStage.$match.basePrice = {};
      if (minPrice) matchStage.$match.basePrice.$gte = parseFloat(minPrice);
      if (maxPrice) matchStage.$match.basePrice.$lte = parseFloat(maxPrice);
    }

    if (tags && tags.length > 0) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      matchStage.$match.tags = { $in: tagArray };
    }

    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          matchStage.$match[`attributes.${key}`] = { $in: value };
        } else {
          matchStage.$match[`attributes.${key}`] = value;
        }
      });
    }

    if (inStock === true || inStock === 'true') {
      matchStage.$match.$or = [
        { 'stock.trackInventory': false },
        { 'stock.available': { $gt: 0 } },
        { 'stock.allowBackorder': true }
      ];
    }

    pipeline.push(matchStage);

    const facetStage = {
      $facet: {
        metadata: [
          { $count: 'total' },
          {
            $addFields: {
              page: parseInt(page),
              limit: parseInt(limit)
            }
          }
        ],
        filters: [
          {
            $group: {
              _id: null,
              categories: { $addToSet: '$category' },
              brands: { $addToSet: '$brand' },
              priceRange: {
                min: { $min: '$basePrice' },
                max: { $max: '$basePrice' }
              },
              tags: { $addToSet: '$tags' }
            }
          }
        ],
        products: [
          { $sort: this.getSortQuery(sort) },
          { $skip: (parseInt(page) - 1) * parseInt(limit) },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: 'categories',
              localField: 'category',
              foreignField: '_id',
              as: 'categoryInfo'
            }
          },
          {
            $lookup: {
              from: 'brands',
              localField: 'brand',
              foreignField: '_id',
              as: 'brandInfo'
            }
          },
          {
            $project: {
              name: 1,
              slug: 1,
              description: 1,
              shortDescription: 1,
              basePrice: 1,
              comparePrice: 1,
              images: 1,
              stock: 1,
              rating: 1,
              soldCount: 1,
              category: { $arrayElemAt: ['$categoryInfo', 0] },
              brand: { $arrayElemAt: ['$brandInfo', 0] },
              searchScore: 1,
              discountPercentage: {
                $cond: {
                  if: { $and: ['$comparePrice', { $lt: ['$basePrice', '$comparePrice'] }] },
                  then: {
                    $multiply: [
                      { $divide: [{ $subtract: ['$comparePrice', '$basePrice'] }, '$comparePrice'] },
                      100
                    ]
                  },
                  else: 0
                }
              },
              isInStock: {
                $cond: {
                  if: { $eq: ['$stock.trackInventory', false] },
                  then: true,
                  else: {
                    $or: [
                      { $gt: ['$stock.available', 0] },
                      { $eq: ['$stock.allowBackorder', true] }
                    ]
                  }
                }
              }
            }
          }
        ]
      }
    };

    pipeline.push(facetStage);

    const results = await Product.aggregate(pipeline);
    const data = results[0];

    const total = data.metadata[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));

    return {
      products: data.products,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      },
      filters: data.filters[0] || {},
      searchTerm: q
    };
  }

  getSortQuery(sort) {
    const sortOptions = {
      relevance: { searchScore: -1, _id: 1 },
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      priceAsc: { basePrice: 1 },
      priceDesc: { basePrice: -1 },
      nameAsc: { name: 1 },
      nameDesc: { name: -1 },
      popularity: { soldCount: -1 },
      rating: { 'rating.average': -1 }
    };

    return sortOptions[sort] || sortOptions.relevance;
  }

  async getSearchSuggestions(query, limit = 10) {
    const suggestions = await Product.aggregate([
      {
        $search: {
          index: 'product_search',
          autocomplete: {
            query: query,
            path: 'name',
            fuzzy: {
              maxEdits: 2
            }
          }
        }
      },
      { $limit: limit },
      {
        $project: {
          name: 1,
          slug: 1,
          image: { $arrayElemAt: ['$images.url', 0] },
          price: '$basePrice',
          category: 1
        }
      }
    ]);

    const categorySuggestions = await Category.find({
      name: { $regex: query, $options: 'i' },
      isActive: true
    })
      .limit(5)
      .select('name slug');

    return {
      products: suggestions,
      categories: categorySuggestions
    };
  }

  async createSearchIndex() {
    await Product.collection.createIndex({
      name: 'text',
      description: 'text',
      tags: 'text',
      sku: 'text'
    }, {
      weights: {
        name: 10,
        tags: 5,
        sku: 3,
        description: 1
      },
      name: 'product_text_search'
    });
  }
}

module.exports = new SearchService();