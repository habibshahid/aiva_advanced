/**
 * OPTIMIZED Product Sync Service
 * Prevents duplicate images by checking if they already exist
 */

const ProductService = require('./ProductService');
const PythonServiceClient = require('./PythonServiceClient');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

class ProductSyncService {
  
  constructor() {
    this.pythonClient = PythonServiceClient;
    this.imageTimeout = parseInt(process.env.SYNC_IMAGE_TIMEOUT_MS) || 10000;
    this.productTimeout = parseInt(process.env.SYNC_PRODUCT_TIMEOUT_MS) || 30000;
  }
  
  /**
   * Process a single product: store data, download images, generate embeddings
   */
  async processProduct(productData, kbId, tenantId, storeId, onProgress = null) {
    const startTime = Date.now();
    const result = {
      product_id: null,
      shopify_product_id: productData.id,
      success: false,
      images_processed: 0,
      images_skipped: 0,
      images_failed: 0,
      embeddings_generated: false,
      error: null,
      processing_time_ms: 0
    };
    
    try {
      // Step 1: Create/update product in database
      if (onProgress) onProgress({ step: 'storing_product', product: productData.title });
      
      const product = await ProductService.upsertProduct(
        productData,
        kbId,
        tenantId,
        storeId
      );
      
      result.product_id = product.id;
      
      // Step 2: Process images (WITH DEDUPLICATION)
      if (productData.images && productData.images.length > 0) {
        if (onProgress) onProgress({ 
          step: 'processing_images', 
          total: productData.images.length 
        });
        
        const imageResults = await this.processImagesWithDedup(
          product.id,
          productData.images,
          kbId,
          tenantId
        );
        
        result.images_processed = imageResults.success;
        result.images_skipped = imageResults.skipped;
        result.images_failed = imageResults.failed;
      }
      
      // Step 3: Generate text embeddings for product
      if (onProgress) onProgress({ step: 'generating_embeddings' });
      
      await this.generateProductEmbeddings(product, kbId, tenantId);
      result.embeddings_generated = true;
      
      result.success = true;
      result.processing_time_ms = Date.now() - startTime;
      
      return result;
      
    } catch (error) {
      result.error = error.message;
      result.processing_time_ms = Date.now() - startTime;
      console.error(`Error processing product ${productData.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Process images WITH DEDUPLICATION
   * Checks if image already exists before downloading/processing
   */
  async processImagesWithDedup(productId, images, kbId, tenantId) {
	  const results = {
		success: 0,
		skipped: 0,
		failed: 0,
		errors: []
	  };
	  
	  // ✅ BULK CHECK: Single query for all images
	  const shopifyImageIds = images.map(img => String(img.id));
	  const existingImages = await this.bulkCheckImagesExist(shopifyImageIds, kbId);
	  
	  console.log(`Found ${Object.keys(existingImages).length}/${images.length} existing images`);
	  
	  // Separate existing vs new images
	  const imagesToProcess = [];
	  const imagesToLink = [];
	  
	  images.forEach(img => {
		const existingImage = existingImages[String(img.id)];
		if (existingImage) {
		  imagesToLink.push({ imageData: img, existingImage });
		} else {
		  imagesToProcess.push(img);
		}
	  });
	  
	  // Link existing images (parallel)
	  const linkPromises = imagesToLink.map(({ imageData, existingImage }) => 
		this.ensureImageLinked(productId, existingImage.id, imageData)
		  .then(() => ({ success: true, skipped: true }))
		  .catch(err => ({ success: false, error: err.message }))
	  );
	  
	  const linkResults = await Promise.allSettled(linkPromises);
	  linkResults.forEach(result => {
		if (result.status === 'fulfilled' && result.value.success) {
		  results.skipped++;
		}
	  });
	  
	  // Process new images with concurrency control
	  const concurrency = parseInt(process.env.SYNC_IMAGE_CONCURRENCY) || 3;
	  
	  for (let i = 0; i < imagesToProcess.length; i += concurrency) {
		const batch = imagesToProcess.slice(i, i + concurrency);
		
		const batchResults = await Promise.allSettled(
		  batch.map(img => this.processNewImage(img, productId, kbId, tenantId))
		);
		
		batchResults.forEach((result, idx) => {
		  if (result.status === 'fulfilled') {
			results.success++;
		  } else {
			results.failed++;
			results.errors.push({
			  image: batch[idx].src,
			  error: result.reason.message
			});
		  }
		});
	  }
	  
	  return results;
	}
  
	/**
	 * Process a new image (doesn't exist in DB)
	 * @private
	 */
	async processNewImage(imageData, productId, kbId, tenantId) {
	  try {
		console.log(`⬇ Downloading new image ${imageData.id}`);
		
		// Download image from Shopify
		const imageBuffer = await this.downloadImage(imageData.src);
		
		// Create FormData for upload
		const formData = new FormData();
		
		formData.append('file', imageBuffer, {
		  filename: this.getFilenameFromUrl(imageData.src),
		  contentType: 'image/jpeg'
		});
		formData.append('kb_id', kbId);
		formData.append('tenant_id', tenantId);
		formData.append('metadata', JSON.stringify({
		  source: 'shopify',
		  shopify_image_id: imageData.id,
		  shopify_image_src: imageData.src,
		  alt_text: imageData.alt || null,
		  position: imageData.position,
		  product_id: productId,
		  width: imageData.width || null,
		  height: imageData.height || null
		}));
		
		// Upload to Python service for processing
		const imageResult = await this.pythonClient.uploadImage(formData);
		
		// Link image to product
		await ProductService.linkImage(
		  productId,
		  imageResult.image_id,
		  imageData.id,
		  imageData.position,
		  imageData.alt,
		  imageData.variant_ids || []
		);
		
		return imageResult;
		
	  } catch (error) {
		console.error(`Error processing image ${imageData.id}:`, error.message);
		throw error;
	  }
	}

  /**
   * Process single image WITH DEDUPLICATION CHECK
   * @private
   */
  async processImageWithDedup(imageData, productId, kbId, tenantId) {
    try {
      // ✅ STEP 1: Check if this image already exists
      const existingImage = await this.checkImageExists(imageData.id, kbId);
      
      if (existingImage) {
        console.log(`✓ Image ${imageData.id} already exists, skipping download`);
        
        // Just link to product if not already linked
        await this.ensureImageLinked(productId, existingImage.id, imageData);
        
        return { 
          image_id: existingImage.id, 
          skipped: true,
          reason: 'already_exists'
        };
      }
      
      // ✅ STEP 2: Image doesn't exist, process it
      console.log(`⬇ Downloading new image ${imageData.id}`);
      
      // Download image from Shopify
      const imageBuffer = await this.downloadImage(imageData.src);
      
      // Create FormData for upload
      const formData = new FormData();
      
      formData.append('file', imageBuffer, {
        filename: this.getFilenameFromUrl(imageData.src),
        contentType: 'image/jpeg'
      });
      formData.append('kb_id', kbId);
      formData.append('tenant_id', tenantId);
      formData.append('metadata', JSON.stringify({
        source: 'shopify',
        shopify_image_id: imageData.id,
        shopify_image_src: imageData.src,  // ← Store original URL
        alt_text: imageData.alt || null,
        position: imageData.position,
        product_id: productId,
        width: imageData.width || null,
        height: imageData.height || null
      }));
      
      // Upload to Python service for processing
      const imageResult = await this.pythonClient.uploadImage(formData);
      
      // Link image to product
      await ProductService.linkImage(
        productId,
        imageResult.image_id,
        imageData.id,
        imageData.position,
        imageData.alt,
        imageData.variant_ids || []
      );
      
      return { ...imageResult, skipped: false };
      
    } catch (error) {
      console.error(`Error processing image ${imageData.id}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Check if image already exists in database
   * @private
   */
  async checkImageExists(shopifyImageId, kbId) {
    try {
      const [images] = await db.query(`
        SELECT i.id, i.kb_id, i.filename, i.storage_url
        FROM yovo_tbl_aiva_images i
        WHERE i.kb_id = ?
        AND JSON_EXTRACT(i.metadata, '$.shopify_image_id') = ?
        LIMIT 1
      `, [kbId, shopifyImageId]);
      
      return images.length > 0 ? images[0] : null;
      
    } catch (error) {
      console.error('Error checking image existence:', error);
      return null; // On error, assume doesn't exist and re-process
    }
  }
  
  /**
   * Ensure image is linked to product
   * @private
   */
  async ensureImageLinked(productId, imageId, imageData) {
    try {
      // Check if link already exists
      const [existing] = await db.query(
        'SELECT id FROM yovo_tbl_aiva_product_images WHERE product_id = ? AND image_id = ?',
        [productId, imageId]
      );
      
      if (existing.length === 0) {
        // Link doesn't exist, create it
        await ProductService.linkImage(
          productId,
          imageId,
          imageData.id,
          imageData.position,
          imageData.alt,
          imageData.variant_ids || []
        );
        console.log(`✓ Linked existing image ${imageId} to product ${productId}`);
      } else {
        console.log(`✓ Image ${imageId} already linked to product ${productId}`);
      }
      
    } catch (error) {
      console.error('Error ensuring image link:', error);
      // Non-critical, continue
    }
  }
  
  /**
   * Download image from URL
   * @private
   */
  async downloadImage(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: this.imageTimeout,
        maxContentLength: 10 * 1024 * 1024 // 10MB max
      });
      
      return Buffer.from(response.data);
      
    } catch (error) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }
  
  /**
   * Generate text embeddings for product
   * @private
   */
  async generateProductEmbeddings(product, kbId, tenantId) {
    try {
      const textContent = this.buildProductText(product);
      
      // Generate embedding
      const embeddingResult = await this.pythonClient.generateEmbedding({
        text: textContent,
        model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
      });
      
      // Store product vector in Redis
      const redis = require('../config/redis');
      const vectorKey = `vector:${kbId}:product:${product.id}`;
      
      const vectorData = {
        product_id: product.id,
        kb_id: kbId,
        tenant_id: tenantId,
        type: 'product',
        shopify_product_id: product.shopify_product_id,
        title: product.title,
        description: product.description,
        vendor: product.vendor,
        product_type: product.product_type,
        price: product.price,
        tags: product.tags,
        embedding: embeddingResult.embedding,
        tokens: embeddingResult.tokens,
        created_at: new Date().toISOString()
      };
      
      await redis.set(vectorKey, JSON.stringify(vectorData));
      
      console.log(`✅ Stored product embedding: ${product.title}`);
      
      // Update product record
      await db.query(
        'UPDATE yovo_tbl_aiva_products SET embedding_status = ?, embedding_generated_at = NOW() WHERE id = ?',
        ['completed', product.id]
      );
      
      return {
        product_id: product.id,
        tokens: embeddingResult.tokens,
        vector_key: vectorKey
      };
      
    } catch (error) {
      console.error(`Error generating embeddings for product ${product.id}:`, error.message);
      
      await db.query(
        'UPDATE yovo_tbl_aiva_products SET embedding_status = ? WHERE id = ?',
        ['failed', product.id]
      );
      
      return null;
    }
  }
  
  /**
   * Build searchable text content from product
   * @private
   */
  buildProductText(product) {
    const parts = [];
    
    if (product.title) parts.push(`Product: ${product.title}`);
    if (product.vendor) parts.push(`Brand: ${product.vendor}`);
    if (product.product_type) parts.push(`Category: ${product.product_type}`);
    if (product.description) parts.push(`Description: ${product.description}`);
    if (product.price) parts.push(`Price: PKR ${product.price}`);
    
    if (product.variants && product.variants.length > 0) {
      const variantInfo = product.variants
        .map(v => {
          const info = [];
          if (v.title && v.title !== 'Default Title') info.push(v.title);
          if (v.sku) info.push(`SKU: ${v.sku}`);
          return info.join(' - ');
        })
        .filter(v => v)
        .join(', ');
      
      if (variantInfo) parts.push(`Variants: ${variantInfo}`);
    }
    
    if (product.tags && product.tags.length > 0) {
      parts.push(`Tags: ${product.tags.join(', ')}`);
    }
    
    if (product.total_inventory > 0) {
      parts.push(`In Stock: ${product.total_inventory} available`);
    } else {
      parts.push('Status: Out of Stock');
    }
    
    return parts.join('\n');
  }
  
  /**
   * Extract filename from URL
   * @private
   */
  getFilenameFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'image.jpg';
    } catch {
      return 'image.jpg';
    }
  }
  
  /**
   * Batch process products
   */
  async batchProcessProducts(products, kbId, tenantId, storeId, onProgress = null) {
    const results = {
      total: products.length,
      success: 0,
      failed: 0,
      images_skipped: 0,
      errors: []
    };
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        const result = await this.processProduct(product, kbId, tenantId, storeId, (progress) => {
          if (onProgress) {
            onProgress({
              ...progress,
              current: i + 1,
              total: products.length,
              product_title: product.title
            });
          }
        });
        
        results.success++;
        results.images_skipped += result.images_skipped || 0;
        
      } catch (error) {
        results.failed++;
        results.errors.push({
          product_id: product.id,
          title: product.title,
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  /**
   * Delete product and all related data
   */
  async deleteProduct(productId) {
    const images = await ProductService.getProductImages(productId);
    
    for (const image of images) {
      try {
        await this.pythonClient.deleteImage(image.id);
      } catch (error) {
        console.error(`Error deleting image ${image.id}:`, error.message);
      }
    }
    
    await ProductService.deleteProduct(productId);
  }
  
  /**
   * Clean orphaned images (images not linked to any product)
   */
  async cleanOrphanedImages(kbId) {
    try {
      const [orphanedImages] = await db.query(`
        SELECT i.id, i.filename
        FROM yovo_tbl_aiva_images i
        WHERE i.kb_id = ?
        AND JSON_EXTRACT(i.metadata, '$.source') = 'shopify'
        AND NOT EXISTS (
          SELECT 1 FROM yovo_tbl_aiva_product_images pi
          WHERE pi.image_id = i.id
        )
      `, [kbId]);
      
      console.log(`Found ${orphanedImages.length} orphaned images`);
      
      for (const image of orphanedImages) {
        try {
          await this.pythonClient.deleteImage(image.id, kbId);
          console.log(`✓ Deleted orphaned image: ${image.filename}`);
        } catch (error) {
          console.error(`Error deleting orphaned image ${image.id}:`, error.message);
        }
      }
      
      return {
        found: orphanedImages.length,
        deleted: orphanedImages.length
      };
      
    } catch (error) {
      console.error('Error cleaning orphaned images:', error);
      throw error;
    }
  }
  
  /**
	 * Bulk check which images already exist (single query)
	 * @private
	 */
	async bulkCheckImagesExist(shopifyImageIds, kbId) {
	  try {
		const [images] = await db.query(`
		  SELECT 
			i.id, 
			i.kb_id, 
			i.filename, 
			i.storage_url,
			JSON_UNQUOTE(JSON_EXTRACT(i.metadata, '$.shopify_image_id')) as shopify_image_id
		  FROM yovo_tbl_aiva_images i
		  WHERE i.kb_id = ?
		  AND JSON_EXTRACT(i.metadata, '$.shopify_image_id') IN (?)
		`, [kbId, shopifyImageIds]);
		
		// Create map for fast lookup
		const imageMap = {};
		images.forEach(img => {
		  imageMap[img.shopify_image_id] = img;
		});
		
		return imageMap;
		
	  } catch (error) {
		console.error('Error bulk checking image existence:', error);
		return {};
	  }
	}
}

module.exports = new ProductSyncService();