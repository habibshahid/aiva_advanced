/**
 * Shopify Sync Processor
 * Bull queue processor for handling Shopify product sync jobs
 */

const ShopifyService = require('../../services/ShopifyService');
const ProductSyncService = require('../../services/ProductSyncService');
const SyncJobService = require('../../services/SyncJobService');
const KnowledgeService = require('../../services/KnowledgeService');
const db = require('../../config/database');
const CANCELLATION_CHECK_INTERVAL = 5; // Check every 5 products

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
		// ════════════════════════════════════════════════════════════════
		// 🛑 CHECK FOR CANCELLATION
		// ════════════════════════════════════════════════════════════════
		if (i % (batchSize * CANCELLATION_CHECK_INTERVAL) === 0 || i === 0) {
			const currentJob = await SyncJobService.getJob(job_id);
			if (currentJob && currentJob.status === 'cancelled') {
				console.log(`[Job ${job_id}] ⚠️ Job was cancelled by user - stopping gracefully`);
				
				// Update final stats before exiting
				await SyncJobService.updateProgress(job_id, {
					processed_products: processedCount,
					failed_products: failedCount,
					products_added: addedCount,
					products_updated: updatedCount,
					total_images: totalImages,
					processed_images: processedImages,
					failed_images: failedImages
				});
				
				// Update store status
				await db.query(`
					UPDATE yovo_tbl_aiva_shopify_stores 
					SET 
						last_sync_status = 'cancelled',
						last_sync_at = NOW()
					WHERE id = ?
				`, [store_id]);
				
				return {
					success: false,
					cancelled: true,
					processed: processedCount,
					failed: failedCount,
					added: addedCount,
					updated: updatedCount,
					images_processed: processedImages,
					images_failed: failedImages,
					message: 'Job cancelled by user'
				};
			}
		}
		
      const batch = products.slice(i, i + batchSize);
      
      console.log(`[Job ${job_id}] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} products)`);
      
      // Process batch
      const productPromises = batch.map(async (product) => {
		  const productStartTime = Date.now();
		  
		  // Create product sync status
		  const statusId = await SyncJobService.createProductStatus({
			job_id,
			shopify_product_id: product.id,
			images_total: product.images.length
		  });
		  
		  try {
			// Check if product exists
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
			
			return { success: true, result, isNew };
			
		  } catch (error) {
			console.error(`[Job ${job_id}] ✗ Failed: ${product.title}`, error.message);
			
			// Update product status
			await SyncJobService.updateProductStatus(statusId, {
			  status: 'failed',
			  error_message: error.message,
			  completed_at: new Date(),
			  processing_time_ms: Date.now() - productStartTime
			});
			
			return { success: false, error: error.message };
		  }
		});

		// Wait for all products in batch to complete
		const results = await Promise.allSettled(productPromises);

		// Update counters from results
		results.forEach(result => {
		  if (result.status === 'fulfilled' && result.value.success) {
			processedCount++;
		  } else {
			failedCount++;
		  }
		});

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

		// Report progress
		const progressPercent = 30 + Math.round((processedCount / products.length) * 70);
		job.progress(progressPercent);
    }
    
    // Step 4: Complete job
    console.log(`[Job ${job_id}] Sync completed!`);
    console.log(`[Job ${job_id}] Results: ${processedCount} processed, ${failedCount} failed`);
    console.log(`[Job ${job_id}] Added: ${addedCount}, Updated: ${updatedCount}`);
    console.log(`[Job ${job_id}] Images: ${processedImages}/${totalImages} processed`);
    
    await SyncJobService.complete(job_id);
    
    // Update store last sync
    await db.query(`
      UPDATE yovo_tbl_aiva_shopify_stores 
      SET 
        last_sync_at = NOW(),
        total_products_synced = ?,
        last_sync_status = 'success'
      WHERE id = ?
    `, [processedCount, store_id]);
    
	console.log(`[Job ${job_id}] Updating knowledge base stats...`);
	
	try {
	  await KnowledgeService.updateKBStats(kb_id);
	  await KnowledgeService.updateKBMetadata(kb_id);
	  console.log(`[Job ${job_id}] ✓ KB stats updated`);
	} catch (statsError) {
	  console.error(`[Job ${job_id}] Failed to update KB stats:`, statsError);
	  // Don't fail the job, just log the error
	}

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