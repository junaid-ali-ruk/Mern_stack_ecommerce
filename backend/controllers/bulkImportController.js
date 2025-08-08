const bulkImportService = require('../services/bulkImportService');

exports.importProducts = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const options = {
      updateExisting: req.body.updateExisting === 'true',
      skipErrors: req.body.skipErrors !== 'false',
      userId: req.userId
    };

    const results = await bulkImportService.importProducts(
      req.file.buffer,
      options
    );

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.validateImport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const validation = await bulkImportService.validateCSV(req.file.buffer);

    res.json({
      success: validation.valid,
      validation
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadTemplate = async (req, res) => {
  try {
    const template = bulkImportService.generateCSVTemplate();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="product_import_template.csv"');
    res.send(template);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};