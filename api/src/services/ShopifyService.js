/**
 * Shopify Service
 * Handles Shopify API interactions, OAuth, and product fetching
 */

const axios = require('axios');
const crypto = require('crypto');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ShopifyService {
  
  constructor() {
    this.apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
    this.apiKey = process.env.SHOPIFY_API_KEY;
    this.apiSecret = process.env.SHOPIFY_API_SECRET;
    
    // Rate limiting: Shopify allows 2 calls/second
    this.rateLimitDelay = parseInt(process.env.SYNC_RATE_LIMIT_DELAY) || 500;
    this.lastRequestTime = 0;
  }
  
  /**
   * Wait for rate limit
   * @private
   */
  async _waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Make authenticated API request to Shopify
   * @private
   */
  async _makeRequest(shopDomain, accessToken, endpoint, method = 'GET', data = null) {
    await this._waitForRateLimit();
    
    const url = `https://${shopDomain}/admin/api/${this.apiVersion}${endpoint}`;
    
    try {
      const config = {
        method,
        url,
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      };
      
      // Only add data for non-GET requests
      if (method !== 'GET' && data) {
        config.data = data;
      }
      
      const response = await axios(config);
      
      return response.data;
      
    } catch (error) {
      if (error.response) {
        // Shopify returned an error
        throw new Error(`Shopify API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        // No response received
        throw new Error('Shopify API: No response received');
      } else {
        // Request setup error
        throw new Error(`Shopify API Request Error: ${error.message}`);
      }
    }
  }
  
  /**
   * Create store connection
   * @param {Object} params - Store parameters
   * @returns {Promise<Object>} Created store
   */
  async createStore(params) {
    const {
      kb_id,
      tenant_id,
      shop_domain,
      access_token,
      sync_settings = {}
    } = params;
    
    // Validate access token by making a test request
    try {
      await this._makeRequest(shop_domain, access_token, '/shop.json');
    } catch (error) {
      throw new Error(`Invalid Shopify credentials: ${error.message}`);
    }
    
    const storeId = uuidv4();
    
    // Encrypt access token before storing
    const encryptedToken = this._encryptToken(access_token);
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_shopify_stores (
        id, kb_id, tenant_id, shop_domain, access_token,
        auto_sync_enabled, sync_frequency_minutes, sync_collections,
        sync_status_filter, sync_reviews, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `, [
      storeId,
      kb_id,
      tenant_id,
      shop_domain,
      encryptedToken,
      sync_settings.auto_sync_enabled !== false,
      sync_settings.sync_frequency_minutes || 1440, // Default: daily
      JSON.stringify(sync_settings.sync_collections || []),
      sync_settings.sync_status_filter || 'active',
      sync_settings.sync_reviews !== false
    ]);
    
    return this.getStore(storeId);
  }
  
  /**
   * Get store by ID
   * @param {string} storeId - Store ID
   * @returns {Promise<Object|null>} Store or null
   */
  async getStore(storeId) {
    const [stores] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_shopify_stores WHERE id = ?',
      [storeId]
    );
    
    if (stores.length === 0) {
      return null;
    }
    
    const store = stores[0];
    
    // Parse JSON fields
    if (store.sync_collections && typeof store.sync_collections === 'string') {
      store.sync_collections = JSON.parse(store.sync_collections);
    }
    
    // Decrypt access token
    store.access_token = this._decryptToken(store.access_token);
    
    return store;
  }
  
  /**
   * Get store by KB ID
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Object|null>} Store or null
   */
  async getStoreByKbId(kbId) {
    const [stores] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_shopify_stores WHERE kb_id = ?',
      [kbId]
    );
    
    if (stores.length === 0) {
      return null;
    }
    
    return this.getStore(stores[0].id);
  }
  
  /**
   * List stores for tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Array>} Stores
   */
  async listStores(tenantId) {
    const [stores] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_shopify_stores WHERE tenant_id = ? ORDER BY created_at DESC',
      [tenantId]
    );
    
    return Promise.all(stores.map(store => this.getStore(store.id)));
  }
  
  /**
   * Update store settings
   * @param {string} storeId - Store ID
   * @param {Object} updates - Updates
   */
  async updateStore(storeId, updates) {
    const fields = [];
    const values = [];
    
    const allowedFields = [
      'auto_sync_enabled',
      'sync_frequency_minutes',
      'sync_collections',
      'sync_status_filter',
      'sync_reviews',
      'status'
    ];
    
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(
          typeof updates[field] === 'object'
            ? JSON.stringify(updates[field])
            : updates[field]
        );
      }
    });
    
    if (fields.length === 0) {
      return;
    }
    
    values.push(storeId);
    
    await db.query(`
      UPDATE yovo_tbl_aiva_shopify_stores
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `, values);
  }
  
  /**
   * Delete store
   * @param {string} storeId - Store ID
   */
  async deleteStore(storeId) {
    await db.query('DELETE FROM yovo_tbl_aiva_shopify_stores WHERE id = ?', [storeId]);
  }
  
  /**
   * Fetch products from Shopify (paginated)
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Products and pagination info
   */
  async fetchProducts(shopDomain, accessToken, options = {}) {
    const {
      limit = 250, // Max 250 per page
      cursor = null,
      status = 'active',
      since_id = null,
      updated_at_min = null
    } = options;
    
    let endpoint = `/products.json?limit=${limit}`;
    
    if (status) {
      endpoint += `&status=${status}`;
    }
    
    if (cursor) {
      endpoint += `&page_info=${cursor}`;
    }
    
    if (since_id) {
      endpoint += `&since_id=${since_id}`;
    }
    
    if (updated_at_min) {
      endpoint += `&updated_at_min=${updated_at_min}`;
    }
    
    const data = await this._makeRequest(shopDomain, accessToken, endpoint);
    
    // Extract pagination info from Link header
    const pageInfo = this._parsePageInfo(data);
    
    return {
      products: data.products || [],
      pageInfo
    };
  }
  
  /**
   * Fetch all products (handles pagination automatically)
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {Object} options - Fetch options
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array>} All products
   */
  async fetchAllProducts(shopDomain, accessToken, options = {}, onProgress = null) {
    const allProducts = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;
    
    while (hasNextPage) {
      const response = await this.fetchProducts(shopDomain, accessToken, {
        ...options,
        cursor
      });
      
      allProducts.push(...response.products);
      pageCount++;
      
      // Call progress callback
      if (onProgress) {
        onProgress({
          page: pageCount,
          productsLoaded: allProducts.length,
          hasMore: response.pageInfo.hasNextPage
        });
      }
      
      hasNextPage = response.pageInfo.hasNextPage;
      cursor = response.pageInfo.endCursor;
      
      console.log(`Fetched page ${pageCount}: ${response.products.length} products (Total: ${allProducts.length})`);
    }
    
    return allProducts;
  }
  
  /**
   * Fetch single product by ID
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {number} productId - Shopify product ID
   * @returns {Promise<Object>} Product
   */
  async fetchProduct(shopDomain, accessToken, productId) {
    const data = await this._makeRequest(
      shopDomain,
      accessToken,
      `/products/${productId}.json`
    );
    
    return data.product;
  }
  
  /**
   * Fetch products count
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {Object} options - Count options
   * @returns {Promise<number>} Product count
   */
  async fetchProductsCount(shopDomain, accessToken, options = {}) {
    const { status = 'active' } = options;
    
    let endpoint = `/products/count.json?status=${status}`;
    
    const data = await this._makeRequest(shopDomain, accessToken, endpoint);
    
    return data.count;
  }
  
  /**
   * Test store connection
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @returns {Promise<Object>} Shop info
   */
  async testConnection(shopDomain, accessToken) {
    try {
      const data = await this._makeRequest(shopDomain, accessToken, '/shop.json');
      return data.shop;
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }
  
  /**
   * Parse pagination info from response
   * @private
   */
  _parsePageInfo(data) {
    // Shopify uses cursor-based pagination
    // The response doesn't include pagination in body for REST API
    // We need to check if we got the max limit to determine if there's more
    
    const products = data.products || [];
    const hasNextPage = products.length === 250; // If we got max, there might be more
    
    // For cursor, we use the last product's ID
    const endCursor = products.length > 0
      ? products[products.length - 1].id
      : null;
    
    return {
      hasNextPage,
      endCursor,
      hasPreviousPage: false, // We don't support backward pagination
      startCursor: products.length > 0 ? products[0].id : null
    };
  }
  
  /**
   * Encrypt access token
   * @private
   */
  _encryptToken(token) {
    if (!this.apiSecret) {
      console.warn('SHOPIFY_API_SECRET not set, storing token unencrypted');
      return token;
    }
    
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.apiSecret, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Return IV + encrypted token
    return iv.toString('hex') + ':' + encrypted;
  }
  
  /**
   * Decrypt access token
   * @private
   */
  _decryptToken(encryptedToken) {
    if (!this.apiSecret) {
      return encryptedToken;
    }
    
    try {
      const parts = encryptedToken.split(':');
      if (parts.length !== 2) {
        return encryptedToken; // Not encrypted
      }
      
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(this.apiSecret, 'salt', 32);
      const iv = Buffer.from(parts[0], 'hex');
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
      
    } catch (error) {
      console.error('Error decrypting token:', error);
      return encryptedToken;
    }
  }
  
  /**
   * Generate OAuth authorization URL
   * @param {string} shop - Shop domain
   * @param {string} redirectUri - Redirect URI
   * @param {Array} scopes - Required scopes
   * @returns {string} Authorization URL
   */
  generateAuthUrl(shop, redirectUri, scopes = []) {
    const defaultScopes = [
      'read_products',
      'read_product_listings',
      'read_inventory'
    ];
    
    const allScopes = [...new Set([...defaultScopes, ...scopes])];
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: allScopes.join(','),
      redirect_uri: redirectUri,
      state: nonce
    });
    
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }
  
  /**
   * Exchange authorization code for access token
   * @param {string} shop - Shop domain
   * @param {string} code - Authorization code
   * @returns {Promise<string>} Access token
   */
  async exchangeCodeForToken(shop, code) {
    const url = `https://${shop}/admin/oauth/access_token`;
    
    try {
      const response = await axios.post(url, {
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code
      });
      
      return response.data.access_token;
      
    } catch (error) {
      throw new Error(`Failed to exchange code for token: ${error.message}`);
    }
  }
  
  /**
   * Verify Shopify webhook signature
   * @param {string} data - Request body
   * @param {string} hmacHeader - HMAC header from request
   * @returns {boolean} Is valid
   */
  verifyWebhook(data, hmacHeader) {
    const hash = crypto
      .createHmac('sha256', this.apiSecret)
      .update(data, 'utf8')
      .digest('base64');
    
    return hash === hmacHeader;
  }
  
  /**
   * Get store by knowledge base ID
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Object|null>} Store or null
   */
  async getStoreByKbId(kbId) {
    const [stores] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_shopify_stores WHERE kb_id = ? AND status = "active" LIMIT 1',
      [kbId]
    );
    
    if (stores.length === 0) {
      return null;
    }
    
    const store = stores[0];
    
    // Decrypt access token
    store.access_token = this._decryptToken(store.access_token);
    
    // Parse JSON fields
    if (store.sync_collections && typeof store.sync_collections === 'string') {
      store.sync_collections = JSON.parse(store.sync_collections);
    }
    
    return store;
  }
  
  /**
   * Fetch single product from Shopify
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {number} productId - Shopify product ID
   * @returns {Promise<Object>} Product
   */
  async fetchProduct(shopDomain, accessToken, productId) {
    try {
      const response = await this._makeRequest(
        shopDomain,
        accessToken,
        `/products/${productId}.json`
      );
      
      return response.product;
      
    } catch (error) {
      throw new Error(`Failed to fetch product ${productId}: ${error.message}`);
    }
  }
  
  /**
   * Get Shopify integration statistics
   * @param {string} tenantId - Tenant ID
   * @param {string} kbId - Knowledge base ID (optional)
   * @returns {Promise<Object>} Statistics
   */
  async getStats(tenantId, kbId = null) {
    const stats = {
      stores: {
        total: 0,
        active: 0,
        syncing: 0
      },
      products: {
        total: 0,
        active: 0,
        out_of_stock: 0
      },
      sync_jobs: {
        total: 0,
        completed: 0,
        failed: 0,
        processing: 0
      },
      images: {
        total: 0
      }
    };
    
    // Stores stats
    let storeQuery = 'SELECT COUNT(*) as total, SUM(CASE WHEN status = "active" THEN 1 ELSE 0 END) as active FROM yovo_tbl_aiva_shopify_stores WHERE tenant_id = ?';
    const storeParams = [tenantId];
    
    if (kbId) {
      storeQuery += ' AND kb_id = ?';
      storeParams.push(kbId);
    }
    
    const [storeStats] = await db.query(storeQuery, storeParams);
    stats.stores.total = storeStats[0].total;
    stats.stores.active = storeStats[0].active;
    
    // Products stats
    if (kbId) {
      const [productStats] = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN total_inventory = 0 THEN 1 ELSE 0 END) as out_of_stock
        FROM yovo_tbl_aiva_products
        WHERE kb_id = ?
      `, [kbId]);
      
      stats.products.total = productStats[0].total;
      stats.products.active = productStats[0].active;
      stats.products.out_of_stock = productStats[0].out_of_stock;
      
      // Images stats
      const [imageStats] = await db.query(`
        SELECT COUNT(DISTINCT pi.image_id) as total
        FROM yovo_tbl_aiva_product_images pi
        JOIN yovo_tbl_aiva_products p ON pi.product_id = p.id
        WHERE p.kb_id = ?
      `, [kbId]);
      
      stats.images.total = imageStats[0].total;
    } else {
      // Count products across all stores for this tenant
      const [productStats] = await db.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN total_inventory = 0 THEN 1 ELSE 0 END) as out_of_stock
        FROM yovo_tbl_aiva_products p
        WHERE p.tenant_id = ?
      `, [tenantId]);
      
      stats.products.total = productStats[0].total;
      stats.products.active = productStats[0].active;
      stats.products.out_of_stock = productStats[0].out_of_stock;
      
      // Images stats (all tenant images)
      const [imageStats] = await db.query(`
        SELECT COUNT(DISTINCT pi.image_id) as total
        FROM yovo_tbl_aiva_product_images pi
        JOIN yovo_tbl_aiva_products p ON pi.product_id = p.id
        WHERE p.tenant_id = ?
      `, [tenantId]);
      
      stats.images.total = imageStats[0].total;
    }
    
    // Sync jobs stats
    let jobQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
      FROM yovo_tbl_aiva_sync_jobs
      WHERE tenant_id = ?
    `;
    const jobParams = [tenantId];
    
    if (kbId) {
      jobQuery += ' AND kb_id = ?';
      jobParams.push(kbId);
    }
    
    const [jobStats] = await db.query(jobQuery, jobParams);
    stats.sync_jobs.total = jobStats[0].total;
    stats.sync_jobs.completed = jobStats[0].completed;
    stats.sync_jobs.failed = jobStats[0].failed;
    stats.sync_jobs.processing = jobStats[0].processing;
    
    return stats;
  }
}

module.exports = new ShopifyService();