/**
 * Shopify Routes
 * Handles Shopify store connections, sync operations, and management
 */

const express = require('express');
const router = express.Router();
const ShopifyService = require('../services/ShopifyService');
const SyncJobService = require('../services/SyncJobService');
const shopifyQueue = require('../queues/shopifyQueue');
const { verifyToken } = require('../middleware/auth');
const ResponseBuilder = require('../utils/response-builder');

/**
 * @route POST /api/shopify/connect
 * @desc Connect a Shopify store to knowledge base
 * @access Private
 */
router.post('/connect', verifyToken, async (req, res) => {
  try {
    const {
      kb_id,
      shop_domain,
      access_token,
      sync_settings
    } = req.body;

    const rb = new ResponseBuilder();

    // Validate required fields
    if (!kb_id || !shop_domain || !access_token) {
      return res.status(400).json(
        rb.badRequest('kb_id, shop_domain, and access_token are required')
      );
    }

    // Validate shop domain format
    if (!shop_domain.includes('.myshopify.com')) {
      return res.status(400).json(
        rb.badRequest('Invalid shop domain. Must be in format: mystore.myshopify.com')
      );
    }

    // Check if KB already has a store
    const existingStore = await ShopifyService.getStoreByKbId(kb_id);
    if (existingStore) {
      return res.status(409).json(
        rb.conflict('This knowledge base already has a Shopify store connected')
      );
    }

    // Create store connection
    const store = await ShopifyService.createStore({
      kb_id,
      tenant_id: req.user.tenant_id || req.user.id,
      shop_domain,
      access_token,
      sync_settings: sync_settings || {}
    });

    res.status(201).json(
      rb.success(store, 'Shopify store connected successfully')
    );
  } catch (error) {
    console.error('Connect Shopify store error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to connect Shopify store')
    );
  }
});

/**
 * @route GET /api/shopify/stores
 * @desc Get all Shopify stores for tenant
 * @access Private
 */
router.get('/stores', verifyToken, async (req, res) => {
  try {
    const rb = new ResponseBuilder();
    const tenantId = req.user.tenant_id || req.user.id;

    const stores = await ShopifyService.listStores(tenantId);

    res.json(rb.success({ stores, count: stores.length }));
  } catch (error) {
    console.error('List Shopify stores error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to list stores')
    );
  }
});

/**
 * @route GET /api/shopify/stores/:store_id
 * @desc Get Shopify store details
 * @access Private
 */
router.get('/stores/:store_id', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    res.json(rb.success(store));
  } catch (error) {
    console.error('Get Shopify store error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to get store')
    );
  }
});

/**
 * @route PUT /api/shopify/stores/:store_id/settings
 * @desc Update store sync settings
 * @access Private
 */
router.put('/stores/:store_id/settings', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Update settings
    await ShopifyService.updateStore(store_id, req.body);

    const updatedStore = await ShopifyService.getStore(store_id);

    res.json(rb.success(updatedStore, 'Store settings updated'));
  } catch (error) {
    console.error('Update store settings error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to update settings')
    );
  }
});

/**
 * @route DELETE /api/shopify/stores/:store_id
 * @desc Disconnect Shopify store
 * @access Private
 */
router.delete('/stores/:store_id', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    await ShopifyService.deleteStore(store_id);

    res.json(rb.success(null, 'Store disconnected successfully'));
  } catch (error) {
    console.error('Delete store error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to disconnect store')
    );
  }
});

/**
 * @route POST /api/shopify/sync/:store_id
 * @desc Start sync job for store (async)
 * @access Private
 */
router.post('/sync/:store_id', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const { sync_type = 'full_sync' } = req.body;
    const rb = new ResponseBuilder();

    // Get store
    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Check if sync already running
    const existingJob = await SyncJobService.getActiveJob(store_id);
    if (existingJob) {
      return res.status(409).json(
        ResponseBuilder.conflict('Sync already in progress', {
          job_id: existingJob.id,
          status: existingJob.status,
          progress: {
            products: `${existingJob.processed_products}/${existingJob.total_products}`,
            images: `${existingJob.processed_images}/${existingJob.total_images}`
          }
        })
      );
    }

    // Get product count estimate
    let estimatedProducts = 0;
    try {
      estimatedProducts = await ShopifyService.fetchProductsCount(
        store.shop_domain,
        store.access_token,
        { status: store.sync_status_filter }
      );
    } catch (error) {
      console.warn('Could not fetch product count:', error.message);
    }

    // Create sync job
    const job = await SyncJobService.createJob({
      store_id: store_id,
      kb_id: store.kb_id,
      tenant_id: req.user.tenant_id || req.user.id,
      job_type: sync_type,
      metadata: {
        estimated_products: estimatedProducts,
        sync_filter: store.sync_status_filter,
        initiated_by: req.user.id,
        initiated_at: new Date().toISOString()
      }
    });

    // Add to queue (NON-BLOCKING)
    await shopifyQueue.add('full-sync', {
      job_id: job.id,
      store_id: store_id,
      kb_id: store.kb_id,
      tenant_id: req.user.tenant_id || req.user.id,
      shop_domain: store.shop_domain,
      access_token: store.access_token,
      sync_filter: store.sync_status_filter,
      sync_reviews: store.sync_reviews
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: false,
      removeOnFail: false,
      timeout: 7200000 // 2 hours
    });

    // Calculate estimated duration
    const estimatedMinutes = Math.ceil(estimatedProducts * 2.5 / 60); // ~2.5s per product

    res.status(202).json(
      rb.success({
        job_id: job.id,
        status: 'pending',
        estimated_products: estimatedProducts,
        estimated_duration_minutes: estimatedMinutes,
        message: 'Sync started successfully. Monitor progress via /sync/:job_id/status'
      }, 'Sync job created')
    );

  } catch (error) {
    console.error('Start sync error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to start sync')
    );
  }
});

/**
 * @route GET /api/shopify/sync/:job_id/status
 * @desc Get sync job status and progress
 * @access Private
 */
router.get('/sync/:job_id/status', verifyToken, async (req, res) => {
  try {
    const { job_id } = req.params;
    const rb = new ResponseBuilder();

    const job = await SyncJobService.getJob(job_id);

    if (!job) {
      return res.status(404).json(rb.notFound('Job not found'));
    }

    // Verify ownership
    if (job.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Calculate progress percentage
    const progress = job.total_products > 0
      ? Math.round((job.processed_products / job.total_products) * 100)
      : 0;

    // Calculate timing
    const elapsedMs = job.started_at
      ? Date.now() - new Date(job.started_at).getTime()
      : 0;

    const avgTimePerProduct = job.processed_products > 0
      ? elapsedMs / job.processed_products
      : 3000;

    const remainingProducts = job.total_products - job.processed_products;
    const estimatedRemainingMs = remainingProducts * avgTimePerProduct;

    const response = {
      job: {
        id: job.id,
        status: job.status,
        job_type: job.job_type,
        progress: {
          percentage: progress,
          products: {
            total: job.total_products,
            processed: job.processed_products,
            failed: job.failed_products,
            added: job.products_added,
            updated: job.products_updated
          },
          images: {
            total: job.total_images,
            processed: job.processed_images,
            failed: job.failed_images
          }
        },
        timing: {
          started_at: job.started_at,
          completed_at: job.completed_at,
          estimated_completion_at: job.status === 'processing'
            ? new Date(Date.now() + estimatedRemainingMs)
            : null,
          elapsed_seconds: Math.round(elapsedMs / 1000),
          estimated_remaining_seconds: Math.round(estimatedRemainingMs / 1000)
        },
        error: job.error_message ? {
          message: job.error_message,
          details: job.error_details
        } : null
      }
    };

    res.json(rb.success(response));

  } catch (error) {
    console.error('Get sync status error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to get sync status')
    );
  }
});

/**
 * @route GET /api/shopify/stores/:store_id/sync-status
 * @desc Get current sync status for a store (active or last completed)
 * @access Private
 */
router.get('/stores/:store_id/sync-status', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Check for active sync job
    const activeJob = await SyncJobService.getActiveJob(store_id);

    if (activeJob) {
      // Calculate progress
      const progress = activeJob.total_products > 0
        ? Math.round((activeJob.processed_products / activeJob.total_products) * 100)
        : 0;

      const elapsedMs = activeJob.started_at
        ? Date.now() - new Date(activeJob.started_at).getTime()
        : 0;

      const avgTimePerProduct = activeJob.processed_products > 0
        ? elapsedMs / activeJob.processed_products
        : 0;

      const remainingProducts = activeJob.total_products - activeJob.processed_products;
      const estimatedRemainingMs = remainingProducts * avgTimePerProduct;

      return res.json(rb.success({
        is_syncing: true,
        job_id: activeJob.id,
        status: activeJob.status,
        progress: {
          percentage: progress,
          products: {
            processed: activeJob.processed_products,
            total: activeJob.total_products,
            failed: activeJob.failed_products
          },
          images: {
            processed: activeJob.processed_images,
            total: activeJob.total_images,
            failed: activeJob.failed_images
          }
        },
        timing: {
          started_at: activeJob.started_at,
          elapsed_seconds: Math.round(elapsedMs / 1000),
          estimated_remaining_seconds: Math.round(estimatedRemainingMs / 1000),
          estimated_completion: estimatedRemainingMs > 0
            ? new Date(Date.now() + estimatedRemainingMs)
            : null
        }
      }));
    }

    // No active job - return last sync info
    const lastJobs = await SyncJobService.getJobs(
      req.user.tenant_id || req.user.id,
      { store_id, limit: 1, status: 'completed' }
    );

    const lastJob = lastJobs[0] || null;

    // Calculate next sync time if auto-sync enabled
    let nextSyncAt = null;
    if (store.auto_sync_enabled && store.last_sync_at) {
      const lastSyncTime = new Date(store.last_sync_at).getTime();
      const intervalMs = (store.sync_frequency_minutes || 1440) * 60 * 1000;
      nextSyncAt = new Date(lastSyncTime + intervalMs);
    }

    res.json(rb.success({
      is_syncing: false,
      last_sync: lastJob ? {
        job_id: lastJob.id,
        completed_at: lastJob.completed_at,
        status: lastJob.status,
        products_processed: lastJob.processed_products,
        products_failed: lastJob.failed_products,
        images_processed: lastJob.processed_images
      } : null,
      next_sync: store.auto_sync_enabled ? {
        enabled: true,
        frequency_minutes: store.sync_frequency_minutes,
        next_sync_at: nextSyncAt
      } : {
        enabled: false
      }
    }));

  } catch (error) {
    console.error('Get store sync status error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to get sync status')
    );
  }
});

/**
 * @route GET /api/shopify/sync/:store_id/jobs
 * @desc Get sync job history for store
 * @access Private
 */
router.get('/sync/:store_id/jobs', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const { limit = 20 } = req.query;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    const jobs = await SyncJobService.getJobs(
      req.user.tenant_id || req.user.id,
      { store_id, limit: parseInt(limit) }
    );

    res.json(rb.success({ jobs, count: jobs.length }));

  } catch (error) {
    console.error('Get sync jobs error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to get sync jobs')
    );
  }
});

/**
 * @route DELETE /api/shopify/sync/:job_id/cancel
 * @desc Cancel running sync job
 * @access Private
 */
router.delete('/sync/:job_id/cancel', verifyToken, async (req, res) => {
  try {
    const { job_id } = req.params;
    const rb = new ResponseBuilder();

    const job = await SyncJobService.getJob(job_id);

    if (!job) {
      return res.status(404).json(rb.notFound('Job not found'));
    }

    // Verify ownership
    if (job.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Check if job can be cancelled
    if (!['pending', 'processing'].includes(job.status)) {
      return res.status(400).json(
        rb.badRequest('Job cannot be cancelled (status: ' + job.status + ')')
      );
    }

    // Cancel job in database
    await SyncJobService.cancel(job_id);

    // Try to remove from queue if pending
    try {
      const bullJob = await shopifyQueue.getJob(job_id);
      if (bullJob) {
        await bullJob.remove();
      }
    } catch (error) {
      console.warn('Could not remove job from queue:', error.message);
    }

    res.json(rb.success(null, 'Job cancelled successfully'));

  } catch (error) {
    console.error('Cancel sync error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to cancel sync')
    );
  }
});

/**
 * @route GET /api/shopify/stores/:store_id/test
 * @desc Test store connection
 * @access Private
 */
router.get('/stores/:store_id/test', verifyToken, async (req, res) => {
  try {
    const { store_id } = req.params;
    const rb = new ResponseBuilder();

    const store = await ShopifyService.getStore(store_id);

    if (!store) {
      return res.status(404).json(rb.notFound('Store not found'));
    }

    // Verify ownership
    if (store.tenant_id !== (req.user.tenant_id || req.user.id)) {
      return res.status(403).json(rb.forbidden());
    }

    // Test connection
    const shopInfo = await ShopifyService.testConnection(
      store.shop_domain,
      store.access_token
    );

    res.json(rb.success({
      connected: true,
      shop: {
        name: shopInfo.name,
        domain: shopInfo.domain,
        email: shopInfo.email,
        currency: shopInfo.currency,
        timezone: shopInfo.timezone
      }
    }, 'Connection successful'));

  } catch (error) {
    console.error('Test connection error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Connection failed')
    );
  }
});

/**
 * @route GET /api/shopify/stats
 * @desc Get Shopify integration statistics
 * @access Private
 */
router.get('/stats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const tenantId = req.user.tenant_id || req.user.id;
    const { kb_id } = req.query;

    const stats = await ShopifyService.getStats(tenantId, kb_id);

    res.json(rb.success(stats));

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/shopify/test-connection
 * @desc Test Shopify connection before connecting store
 * @access Private
 */
router.post('/test-connection', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { shop_domain, access_token } = req.body;

    if (!shop_domain || !access_token) {
      return res.status(400).json(
        ResponseBuilder.badRequest('shop_domain and access_token are required')
      );
    }

    // Test connection
    const shopInfo = await ShopifyService.testConnection(
      shop_domain,
      access_token
    );

    res.json(rb.success({
      connected: true,
      shop: {
        name: shopInfo.name,
        domain: shopInfo.domain,
        email: shopInfo.email,
        currency: shopInfo.currency,
        timezone: shopInfo.timezone
      }
    }, 'Connection successful'));

  } catch (error) {
    console.error('Test connection error:', error);
    res.status(400).json(
      ResponseBuilder.badRequest(error.message || 'Connection failed')
    );
  }
});

/**
 * @route GET /api/shopify/products/stats
 * @desc Get product statistics for a knowledge base
 * @access Private
 */
router.get('/products/stats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id } = req.query;

    if (!kb_id) {
      return res.status(400).json(
        ResponseBuilder.badRequest('kb_id is required')
      );
    }

    const db = require('../config/database');

    // Get comprehensive product statistics
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(DISTINCT vendor) as total_vendors,
        COUNT(DISTINCT product_type) as total_product_types,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_products,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_products,
        SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived_products,
        SUM(total_inventory) as total_inventory,
        AVG(price) as avg_price,
        MIN(price) as min_price,
        MAX(price) as max_price
      FROM yovo_tbl_aiva_products
      WHERE kb_id = ?
    `, [kb_id]);

    // Get vendor list with product counts
    const [vendors] = await db.query(`
      SELECT 
        vendor,
        COUNT(*) as product_count
      FROM yovo_tbl_aiva_products
      WHERE kb_id = ? AND vendor IS NOT NULL
      GROUP BY vendor
      ORDER BY product_count DESC
      LIMIT 10
    `, [kb_id]);

    // Get product type list with counts
    const [productTypes] = await db.query(`
      SELECT 
        product_type,
        COUNT(*) as product_count
      FROM yovo_tbl_aiva_products
      WHERE kb_id = ? AND product_type IS NOT NULL
      GROUP BY product_type
      ORDER BY product_count DESC
      LIMIT 10
    `, [kb_id]);

    const result = {
      summary: {
        total_products: parseInt(stats[0].total_products) || 0,
        total_vendors: parseInt(stats[0].total_vendors) || 0,
        total_product_types: parseInt(stats[0].total_product_types) || 0,
        total_inventory: parseInt(stats[0].total_inventory) || 0,
        avg_price: parseFloat(stats[0].avg_price) || 0,
        min_price: parseFloat(stats[0].min_price) || 0,
        max_price: parseFloat(stats[0].max_price) || 0
      },
      by_status: {
        active: parseInt(stats[0].active_products) || 0,
        draft: parseInt(stats[0].draft_products) || 0,
        archived: parseInt(stats[0].archived_products) || 0
      },
      top_vendors: vendors.map(v => ({
        name: v.vendor,
        count: parseInt(v.product_count)
      })),
      top_product_types: productTypes.map(pt => ({
        name: pt.product_type,
        count: parseInt(pt.product_count)
      }))
    };

    res.json(rb.success(result));

  } catch (error) {
    console.error('Get product stats error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/shopify/products
 * @desc List synced products with pagination and filters
 * @access Private
 */
router.get('/products', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { 
      kb_id, 
      page = 1,
      limit = 20,
      status,
      vendor,
      product_type,
      min_price,
      max_price,
      search,
      sort_by,
      sort_order
    } = req.query;

    if (!kb_id) {
      return res.status(400).json(
        ResponseBuilder.badRequest('kb_id is required')
      );
    }

    const ProductService = require('../services/ProductService');
    const result = await ProductService.listProducts(kb_id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      vendor,
      product_type,
      min_price: min_price ? parseFloat(min_price) : undefined,
      max_price: max_price ? parseFloat(max_price) : undefined,
      search,
      sort_by,
      sort_order
    });

    res.json(rb.success(result));

  } catch (error) {
    console.error('List products error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/shopify/products/filters/:kb_id
 * @desc Get available filter options (vendors, product types)
 * @access Private
 */
router.get('/products/filters/:kb_id', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id } = req.params;

    const ProductService = require('../services/ProductService');
    
    const [vendors, productTypes] = await Promise.all([
      ProductService.getVendors(kb_id),
      ProductService.getProductTypes(kb_id)
    ]);

    res.json(rb.success({
      vendors,
      product_types: productTypes
    }));

  } catch (error) {
    console.error('Get filter options error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/shopify/products/:product_id
 * @desc Get product details
 * @access Private
 */
router.get('/products/:product_id', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const ProductService = require('../services/ProductService');
    const product = await ProductService.getProduct(req.params.product_id);

    if (!product) {
      return res.status(404).json(ResponseBuilder.notFound('Product'));
    }

    // Get images
    const images = await ProductService.getProductImages(req.params.product_id);
    product.images = images;

    res.json(rb.success(product));

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/shopify/products/:product_id/refresh
 * @desc Refresh single product from Shopify
 * @access Private
 */
router.post('/products/:product_id/refresh', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const ProductService = require('../services/ProductService');
    const product = await ProductService.getProduct(req.params.product_id);

    if (!product) {
      return res.status(404).json(ResponseBuilder.notFound('Product'));
    }

    // Get store details
    const store = await ShopifyService.getStoreByKbId(product.kb_id);

    if (!store) {
      return res.status(404).json(ResponseBuilder.notFound('Store'));
    }

    // Check ownership
    const tenantId = req.user.tenant_id || req.user.id;
    if (store.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    // Fetch latest data from Shopify
    const shopifyProduct = await ShopifyService.fetchProduct(
      store.shop_domain,
      store.access_token,
      product.shopify_product_id
    );

    // Update product
    const ProductSyncService = require('../services/ProductSyncService');
    await ProductSyncService.processProduct(
      shopifyProduct,
      product.kb_id,
      tenantId,
      store.id
    );

    // Get updated product
    const updated = await ProductService.getProduct(req.params.product_id);

	try {
	  const KnowledgeService = require('../services/KnowledgeService');
	  await KnowledgeService.updateKBStats(product.kb_id);
	} catch (error) {
	  console.error('Failed to update KB stats:', error);
	  // Don't fail the request
	}

    res.json(rb.success(updated, 'Product refreshed successfully'));

  } catch (error) {
    console.error('Refresh product error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});
module.exports = router;