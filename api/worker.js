/**
 * Shopify Sync Worker
 * Background process that consumes jobs from the Bull queue
 * Also runs the auto-sync scheduler
 */

require('dotenv').config();
const shopifyQueue = require('./src/queues/shopifyQueue');
const db = require('./src/config/database');

console.log('===========================================');
console.log('  Shopify Sync Worker Starting');
console.log('===========================================');
console.log('');
console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('Redis Host:', process.env.REDIS_HOST || '127.0.0.1');
console.log('Redis Port:', process.env.REDIS_PORT || 6379);
console.log('Concurrency:', process.env.QUEUE_CONCURRENCY || 5);
console.log('Python Service:', process.env.PYTHON_SERVICE_URL || 'http://localhost:62002');
console.log('');
console.log('Worker is ready and listening for jobs...');
console.log('Press Ctrl+C to stop');
console.log('===========================================');
console.log('');

// ============================================
// AUTO-SYNC SCHEDULER
// ============================================

const AUTO_SYNC_CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
let autoSyncIntervalId = null;
let isCheckingAutoSync = false;

async function checkAutoSync() {
  if (isCheckingAutoSync) {
    return; // Skip if already running
  }

  isCheckingAutoSync = true;

  try {
    // Find stores due for auto-sync
    const [stores] = await db.query(`
      SELECT 
        s.*,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_sync_jobs j 
         WHERE j.store_id = s.id AND j.status IN ('pending', 'processing')) as active_jobs
      FROM yovo_tbl_aiva_shopify_stores s
      WHERE s.auto_sync_enabled = 1
        AND s.status = 'active'
        AND (
          s.next_sync_at IS NULL 
          OR s.next_sync_at <= NOW()
        )
    `);

    if (stores.length === 0) {
      return;
    }

    console.log(`\n🔍 [Auto-Sync] Found ${stores.length} store(s) due for sync`);

    const SyncJobService = require('./src/services/SyncJobService');
    const ShopifyService = require('./src/services/ShopifyService');

    for (const store of stores) {
      try {
        // Skip if already syncing
        if (store.active_jobs > 0) {
          console.log(`⏭️  [Auto-Sync] Skipping ${store.shop_domain} - sync already in progress`);
          continue;
        }

        console.log(`🚀 [Auto-Sync] Triggering sync for ${store.shop_domain}`);

        // Decrypt access token
        const decryptedToken = ShopifyService._decryptToken(store.access_token);

        // Get product count estimate
        let estimatedProducts = 0;
        try {
          estimatedProducts = await ShopifyService.fetchProductsCount(
            store.shop_domain,
            decryptedToken,
            { status: store.sync_status_filter }
          );
        } catch (err) {
          console.warn(`   Could not fetch product count: ${err.message}`);
        }

        // Create sync job
        const job = await SyncJobService.createJob({
          store_id: store.id,
          kb_id: store.kb_id,
          tenant_id: store.tenant_id,
          job_type: 'full_sync',
          metadata: {
            estimated_products: estimatedProducts,
            sync_filter: store.sync_status_filter,
            initiated_by: 'auto_sync_scheduler',
            initiated_at: new Date().toISOString()
          }
        });

        // Add to queue
        await shopifyQueue.add('full-sync', {
          job_id: job.id,
          store_id: store.id,
          kb_id: store.kb_id,
          tenant_id: store.tenant_id,
          shop_domain: store.shop_domain,
          access_token: decryptedToken,
          sync_filter: store.sync_status_filter,
          sync_reviews: store.sync_reviews
        }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: false,
          removeOnFail: false,
          timeout: 7200000
        });

        // Update next_sync_at
        const nextSyncAt = new Date(Date.now() + (store.sync_frequency_minutes * 60 * 1000));
        await db.query(`
          UPDATE yovo_tbl_aiva_shopify_stores 
          SET next_sync_at = ?, last_sync_at = NOW()
          WHERE id = ?
        `, [nextSyncAt, store.id]);

        console.log(`✅ [Auto-Sync] Queued ${store.shop_domain}, next sync: ${nextSyncAt.toISOString()}`);

      } catch (error) {
        console.error(`❌ [Auto-Sync] Failed for ${store.shop_domain}:`, error.message);
        
        // Update store with error
        await db.query(`
          UPDATE yovo_tbl_aiva_shopify_stores 
          SET last_sync_error = ?
          WHERE id = ?
        `, [`Auto-sync failed: ${error.message}`, store.id]);
      }
    }

  } catch (error) {
    console.error('❌ [Auto-Sync] Check failed:', error.message);
  } finally {
    isCheckingAutoSync = false;
  }
}

function startAutoSyncScheduler() {
  console.log(`🔄 Auto-Sync Scheduler started (checking every ${AUTO_SYNC_CHECK_INTERVAL / 1000 / 60} minutes)`);
  
  // Run immediately
  checkAutoSync();
  
  // Then run periodically
  autoSyncIntervalId = setInterval(checkAutoSync, AUTO_SYNC_CHECK_INTERVAL);
}

function stopAutoSyncScheduler() {
  if (autoSyncIntervalId) {
    clearInterval(autoSyncIntervalId);
    autoSyncIntervalId = null;
    console.log('🛑 Auto-Sync Scheduler stopped');
  }
}

// Start the scheduler
startAutoSyncScheduler();

// ============================================
// SHUTDOWN HANDLING
// ============================================

const shutdown = async (signal) => {
  console.log('');
  console.log(`${signal} received. Shutting down gracefully...`);
  
  try {
    // Stop auto-sync scheduler
    stopAutoSyncScheduler();
    
    // Wait for current jobs to complete
    console.log('Waiting for current jobs to complete...');
    await shopifyQueue.close(30000);
    console.log('Queue closed successfully');
    
    // Close database connections
    await db.end();
    console.log('Database connection closed');
    
    console.log('Worker shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.stdin.resume();