/**
 * Shopify Sync Processor
 * Bull queue processor for handling Shopify product sync jobs
 */

const ShopifyService = require('../../services/ShopifyService');
const ProductSyncService = require('../../services/ProductSyncService');
const SyncJobService = require('../../services/SyncJobService');

/**
 * Process full sync job
 * @param {Object} job - Bull job
 * @returns {Promise<Object>} Result
 */
async function processFullSync(job) {
  const {
    job_id,
    store_id,
    kb_id,
    tenant_id,
    shop_domain,
    access_token,
    sync_filter = 'active',
    sync_reviews = false
  } = job.data;
  
  console.log(`[Job ${job_id}] Starting full sync for store ${store_id}`);
  
  try {
    // Update job status to processing
    await SyncJobService.updateStatus(job_id, 'processing', {
      started_at: new Date()
    });
    
    // Step 1: Fetch products count
    console.log(`[Job ${job_id}] Fetching products count...`);
    const totalProducts = await ShopifyService.fetchProductsCount(
      shop_domain,
      access_token,
      { status: sync_filter }
    );
    
    await SyncJobService.updateProgress(job_id, {
      total_products: totalProducts
    });
    
    console.log(`[Job ${job_id}] Found ${totalProducts} products to sync`);
    
    // Step 2: Fetch all products with pagination
    console.log(`[Job ${job_id}] Fetching products...`);
    const products = await ShopifyService.fetchAllProducts(
      shop_domain,
      access_token,
      { status: sync_filter },
      (progress) => {
        console.log(`[Job ${job_id}] Loaded ${progress.productsLoaded} products (Page ${progress.page})`);
        job.progress(Math.round((progress.productsLoaded / totalProducts) * 30)); // 0-30% for fetching
      }
    );
    
    console.log(`[Job ${job_id}] Fetched ${products.length} products, starting processing...`);
    
    // Step 3: Process products in batches
    const batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 10;
    let processedCount = 0;
    let failedCount = 0;
    let addedCount = 0;
    let updatedCount = 0;
    let totalImages = 0;
    let processedImages = 0;
    let failedImages = 0;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      console.log(`[Job ${job_id}] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} products)`);
      
      // Process batch
      for (const product of batch) {
        const productStartTime = Date.now();
        
        // Create product sync status
        const statusId = await SyncJobService.createProductStatus({
          job_id,
          shopify_product_id: product.id,
          images_total: product.images.length
        });
        
        try {
          // Check if product exists (to track added vs updated)
          const existingProduct = await require('../../services/ProductService')
            .getProductByShopifyId(product.id);
          
          const isNew = !existingProduct;
          
          // Process product
          const result = await ProductSyncService.processProduct(
            product,
            kb_id,
            tenant_id,
            store_id,
            (progress) => {
              console.log(`[Job ${job_id}] Product ${product.id}: ${progress.step}`);
            }
          );
          
          // Update counters
          processedCount++;
          if (isNew) {
            addedCount++;
          } else {
            updatedCount++;
          }
          
          totalImages += product.images.length;
          processedImages += result.images_processed;
          failedImages += result.images_failed;
          
          // Update product status
          await SyncJobService.updateProductStatus(statusId, {
            status: 'completed',
            product_id: result.product_id,
            images_processed: result.images_processed,
            completed_at: new Date(),
            processing_time_ms: Date.now() - productStartTime
          });
          
          console.log(`[Job ${job_id}] ✓ Processed: ${product.title} (${result.images_processed}/${product.images.length} images)`);
          
        } catch (error) {
          failedCount++;
          console.error(`[Job ${job_id}] ✗ Failed: ${product.title}`, error.message);
          
          // Update product status
          await SyncJobService.updateProductStatus(statusId, {
            status: 'failed',
            error_message: error.message,
            completed_at: new Date(),
            processing_time_ms: Date.now() - productStartTime
          });
        }
        
        // Update job progress
        await SyncJobService.updateProgress(job_id, {
          processed_products: processedCount,
          failed_products: failedCount,
          products_added: addedCount,
          products_updated: updatedCount,
          total_images: totalImages,
          processed_images: processedImages,
          failed_images: failedImages
        });
        
        // Report progress (30% + 70% for processing)
        const progressPercent = 30 + Math.round((processedCount / products.length) * 70);
        job.progress(progressPercent);
      }
    }
    
    // Step 4: Complete job
    console.log(`[Job ${job_id}] Sync completed!`);
    console.log(`[Job ${job_id}] Results: ${processedCount} processed, ${failedCount} failed`);
    console.log(`[Job ${job_id}] Added: ${addedCount}, Updated: ${updatedCount}`);
    console.log(`[Job ${job_id}] Images: ${processedImages}/${totalImages} processed`);
    
    await SyncJobService.complete(job_id);
    
    // Update store last sync
    const db = require('../../config/database');
    await db.query(`
      UPDATE yovo_tbl_aiva_shopify_stores 
      SET 
        last_sync_at = NOW(),
        total_products_synced = ?,
        last_sync_status = 'success'
      WHERE id = ?
    `, [processedCount, store_id]);
    
    return {
      success: true,
      processed: processedCount,
      failed: failedCount,
      added: addedCount,
      updated: updatedCount,
      images_processed: processedImages,
      images_failed: failedImages
    };
    
  } catch (error) {
    console.error(`[Job ${job_id}] Sync failed:`, error);
    
    // Mark job as failed
    await SyncJobService.fail(job_id, error.message, {
      stack: error.stack
    });
    
    // Update store
    const db = require('../../config/database');
    await db.query(`
      UPDATE yovo_tbl_aiva_shopify_stores 
      SET 
        last_sync_status = 'failed',
        last_sync_error = ?
      WHERE id = ?
    `, [error.message, store_id]);
    
    throw error;
  }
}

/**
 * Main processor export
 * @param {Object} job - Bull job
 */
module.exports = async function(job) {
  console.log(`Processing job ${job.id}: ${job.data.job_type || 'full-sync'}`);
  
  try {
    // Handle different job types
    const jobType = job.data.job_type || 'full-sync';
    
    switch (jobType) {
      case 'full-sync':
      case 'full_sync':
        return await processFullSync(job);
      
      case 'incremental-sync':
      case 'incremental_sync':
        // TODO: Implement incremental sync (only changed products)
        return await processFullSync(job);
      
      case 'manual-sync':
      case 'manual_sync':
        return await processFullSync(job);
      
      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }
    
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    throw error;
  }
};