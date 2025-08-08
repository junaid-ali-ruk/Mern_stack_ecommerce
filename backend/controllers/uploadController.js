const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');
const sharp = require('sharp');

exports.uploadProductImages = async (req, res) => {
  try {
    const { productId } = req.params;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const uploadPromises = files.map(async (file, index) => {
      const optimizedBuffer = await sharp(file.buffer)
        .resize(1200, 1200, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();

      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'products',
            public_id: `${productId}-${Date.now()}-${index}`,
            resource_type: 'image',
            transformation: [
              { quality: 'auto:best' },
              { fetch_format: 'auto' }
            ]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(optimizedBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        alt: req.body.alt || product.name,
        order: product.images.length + index,
        isMain: product.images.length === 0 && index === 0
      };
    });

    const uploadedImages = await Promise.all(uploadPromises);
    
    product.images.push(...uploadedImages);
    await product.save();

    res.json({
      success: true,
      images: uploadedImages,
      totalImages: product.images.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProductImage = async (req, res) => {
  try {
    const { productId, imageId } = req.params;

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const imageIndex = product.images.findIndex(
      img => img._id.toString() === imageId
    );

    if (imageIndex === -1) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = product.images[imageIndex];

    await cloudinary.uploader.destroy(image.publicId);

    product.images.splice(imageIndex, 1);

    if (image.isMain && product.images.length > 0) {
      product.images[0].isMain = true;
    }

    await product.save();

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.reorderProductImages = async (req, res) => {
  try {
    const { productId } = req.params;
    const { imageOrder } = req.body;

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const reorderedImages = [];
    
    imageOrder.forEach((imageId, index) => {
      const image = product.images.find(
        img => img._id.toString() === imageId
      );
      if (image) {
        image.order = index;
        image.isMain = index === 0;
        reorderedImages.push(image);
      }
    });

    product.images = reorderedImages;
    await product.save();

    res.json({
      success: true,
      images: product.images
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.generateImageVariations = async (req, res) => {
  try {
    const { productId, imageId } = req.params;

    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const image = product.images.find(
      img => img._id.toString() === imageId
    );

    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const variations = [
      { width: 150, height: 150, suffix: 'thumbnail' },
      { width: 300, height: 300, suffix: 'small' },
      { width: 600, height: 600, suffix: 'medium' },
      { width: 1200, height: 1200, suffix: 'large' }
    ];

    const generatedUrls = {};

    for (const variation of variations) {
      const url = cloudinary.url(image.publicId, {
        width: variation.width,
        height: variation.height,
        crop: 'fill',
        quality: 'auto',
        fetch_format: 'auto'
      });
      generatedUrls[variation.suffix] = url;
    }

    res.json({
      success: true,
      original: image.url,
      variations: generatedUrls
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};