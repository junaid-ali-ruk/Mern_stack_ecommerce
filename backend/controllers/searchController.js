const searchService = require('../services/searchService');

exports.searchProducts = async (req, res) => {
  try {
    const results = await searchService.searchProducts(req.query);
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ products: [], categories: [] });
    }

    const suggestions = await searchService.getSearchSuggestions(q);
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};