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
        rb.conflict('Sync already in progress', {
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
 * @route GET /api/shopify/products
 * @desc List synced products
 * @access Private
 */
router.get('/products', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id, status, search, limit = 50 } = req.query;

    if (!kb_id) {
      return res.status(400).json(
        ResponseBuilder.badRequest('kb_id is required')
      );
    }

    const ProductService = require('../services/ProductService');
    const products = await ProductService.listProducts(kb_id, {
      status,
      search,
      limit: parseInt(limit)
    });

    res.json(rb.success({ products, total: products.length }));

  } catch (error) {
    console.error('List products error:', error);
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

    res.json(rb.success(updated, 'Product refreshed successfully'));

  } catch (error) {
    console.error('Refresh product error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});
module.exports = router;