/**
 * Product Sync Service
 * Orchestrates product syncing: download images, generate embeddings, store in DB
 */

const ProductService = require('./ProductService');
const PythonServiceClient = require('./PythonServiceClient');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

class ProductSyncService {
  
  constructor() {
    // PythonServiceClient is already a singleton instance
    this.pythonClient = PythonServiceClient;
    this.imageTimeout = parseInt(process.env.SYNC_IMAGE_TIMEOUT_MS) || 10000;
    this.productTimeout = parseInt(process.env.SYNC_PRODUCT_TIMEOUT_MS) || 30000;
  }
  
  /**
   * Process a single product: store data, download images, generate embeddings
   * @param {Object} productData - Product data from Shopify
   * @param {string} kbId - Knowledge base ID
   * @param {string} tenantId - Tenant ID
   * @param {string} storeId - Store ID
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Processing result
   */
  async processProduct(productData, kbId, tenantId, storeId, onProgress = null) {
    const startTime = Date.now();
    const result = {
      product_id: null,
      shopify_product_id: productData.id,
      success: false,
      images_processed: 0,
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
      
      // Step 2: Process images
      if (productData.images && productData.images.length > 0) {
        if (onProgress) onProgress({ 
          step: 'processing_images', 
          total: productData.images.length 
        });
        
        const imageResults = await this.processImages(
          product.id,
          productData.images,
          kbId,
          tenantId
        );
        
        result.images_processed = imageResults.success;
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
   * Process product images: download, upload to Python service, generate CLIP embeddings
   * @param {string} productId - Product ID
   * @param {Array} images - Shopify image objects
   * @param {string} kbId - Knowledge base ID
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Processing results
   */
  async processImages(productId, images, kbId, tenantId) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    // Process images with limited concurrency
    const concurrency = parseInt(process.env.SYNC_IMAGE_CONCURRENCY) || 3;
    
    for (let i = 0; i < images.length; i += concurrency) {
      const batch = images.slice(i, i + concurrency);
      
      const batchResults = await Promise.allSettled(
        batch.map(img => this.processImage(img, productId, kbId, tenantId))
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
   * Process single image
   * @private
   */
  async processImage(imageData, productId, kbId, tenantId) {
    try {
      // Step 1: Download image from Shopify
      const imageBuffer = await this.downloadImage(imageData.src);
      
      // Step 2: Create FormData for upload
      const FormData = require('form-data');
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
        alt_text: imageData.alt || null,
        position: imageData.position,
        product_id: productId
      }));
      
      // Step 3: Upload to Python service for processing
      const imageResult = await this.pythonClient.uploadImage(formData);
      
      // Step 4: Link image to product
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
		
		// ✅ NEW: Store product vector directly in Redis (not document chunks)
		const redis = require('../config/redis');
		const vectorKey = `vector:${kbId}:product:${product.id}`;
		console.log('###################', vectorKey)
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
		
		console.log(`✅ Stored product embedding: ${product.title} (${vectorKey})`);
		
		// Update product record with embedding status
		const db = require('../config/database');
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
		
		// Mark as failed
		const db = require('../config/database');
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
    
    // Title (most important)
    if (product.title) {
      parts.push(`Product: ${product.title}`);
    }
    
    // Vendor and type
    if (product.vendor) {
      parts.push(`Brand: ${product.vendor}`);
    }
    if (product.product_type) {
      parts.push(`Category: ${product.product_type}`);
    }
    
    // Description
    if (product.description) {
      parts.push(`Description: ${product.description}`);
    }
    
    // Price
    if (product.price) {
      parts.push(`Price: PKR ${product.price}`);
    }
    
    // Variants info
    if (product.variants && product.variants.length > 0) {
      const variantInfo = product.variants
        .map(v => {
          const info = [];
          if (v.title && v.title !== 'Default Title') {
            info.push(v.title);
          }
          if (v.sku) {
            info.push(`SKU: ${v.sku}`);
          }
          return info.join(' - ');
        })
        .filter(v => v)
        .join(', ');
      
      if (variantInfo) {
        parts.push(`Variants: ${variantInfo}`);
      }
    }
    
    // Tags
    if (product.tags && product.tags.length > 0) {
      parts.push(`Tags: ${product.tags.join(', ')}`);
    }
    
    // Inventory status
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
   * @param {Array} products - Array of Shopify products
   * @param {string} kbId - Knowledge base ID
   * @param {string} tenantId - Tenant ID
   * @param {string} storeId - Store ID
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Batch processing results
   */
  async batchProcessProducts(products, kbId, tenantId, storeId, onProgress = null) {
    const results = {
      total: products.length,
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        await this.processProduct(product, kbId, tenantId, storeId, (progress) => {
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
   * @param {string} productId - Product ID
   */
  async deleteProduct(productId) {
    // Get product images to delete from Python service
    const images = await ProductService.getProductImages(productId);
    
    // Delete images from Python service
    for (const image of images) {
      try {
        await this.pythonClient.deleteImage(image.id);
      } catch (error) {
        console.error(`Error deleting image ${image.id}:`, error.message);
      }
    }
    
    // Delete product (cascade will delete variants, image links)
    await ProductService.deleteProduct(productId);
  }
}

module.exports = new ProductSyncService();