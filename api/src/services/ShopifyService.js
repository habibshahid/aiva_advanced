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
      
      return {
	    data: response.data,
	    headers: response.headers
	  };
      
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
    
    if (status && !cursor) {
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
    
    const response = await this._makeRequest(shopDomain, accessToken, endpoint);
    const pageInfo = this._parsePageInfo(response);
    return { products: response.data.products || [], pageInfo };
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
    
    return data.data.count;
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
      return data.data.shop;
    } catch (error) {
      // Re-throw with more context
      throw new Error(`Connection test failed: ${error.message}`);
    }
  }
  
  /**
   * Parse pagination info from response
   * @private
   */
  _parsePageInfo(response) {
	  const linkHeader = response.headers?.link || response.headers?.Link;
	  
	  let hasNextPage = false;
	  let endCursor = null;
	  
	  if (linkHeader) {
		// Parse Link header: <url>; rel="next"
		const links = linkHeader.split(',').reduce((acc, link) => {
		  const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
		  if (match) {
			const [, url, rel] = match;
			acc[rel] = url;
		  }
		  return acc;
		}, {});
		
		if (links.next) {
		  try {
			// Extract page_info from next URL
			const nextUrl = new URL(links.next);
			endCursor = nextUrl.searchParams.get('page_info');
			hasNextPage = !!endCursor;
		  } catch (error) {
			console.error('Failed to parse next page URL:', error);
		  }
		}
	  }
	  
	  return {
		hasNextPage,
		endCursor,
		hasPreviousPage: false,
		startCursor: null
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
      
      return response.data.product;
      
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
  
  /**
   * Get products by their Shopify product IDs
   * @param {Object} params
   * @returns {Promise<Object>} Products
   */

  async getProductsByIds(tenantId, storeUrl, accessToken, productIds) {
    try {
      if (!productIds || productIds.length === 0) {
        return { products: [] };
      }

      console.log(`Fetching ${productIds.length} products by ID from database...`);

      // ✅ FIXED: Extract handle from shopify_metadata JSON
      const [dbProducts] = await db.query(`
        SELECT 
          p.id,
          p.shopify_product_id,
          p.title,
          p.description,
          p.vendor,
          p.product_type,
          p.tags,
          p.price,
          p.compare_at_price,
          p.status,
          p.total_inventory,
          p.shopify_metadata,
          JSON_UNQUOTE(JSON_EXTRACT(p.shopify_metadata, '$.handle')) as handle,
          s.shop_domain
        FROM yovo_tbl_aiva_products p
        LEFT JOIN yovo_tbl_aiva_shopify_stores s ON p.shopify_store_id = s.id
        WHERE p.id IN (?)
        AND p.tenant_id = ?
        AND p.status = 'active'
      `, [productIds, tenantId]);

      if (dbProducts.length === 0) {
        console.log('No products found in database');
        return { products: [] };
      }

      console.log(`Found ${dbProducts.length} products in database`);

      // Enrich with images and variants
      const enrichedProducts = await Promise.all(
        dbProducts.map(async (product) => {
          // Get product images
          const [images] = await db.query(`
            SELECT 
              pi.alt_text,
              pi.shopify_image_id,
              i.id as image_id,
              i.metadata
            FROM yovo_tbl_aiva_product_images pi
            JOIN yovo_tbl_aiva_images i ON pi.image_id = i.id
            WHERE pi.product_id = ?
          `, [product.id]);

          // Extract shopify_image_src from metadata JSON
          const productImages = images.map(img => {
            let metadata = img.metadata;
            if (typeof metadata === 'string') {
              metadata = JSON.parse(metadata);
            }
            
            return {
              src: metadata?.shopify_image_src || null,
              position: img.position,
              alt: img.alt_text
            };
          }).filter(img => img.src);

          // Get variants
          const [variants] = await db.query(`
            SELECT 
              shopify_variant_id as variant_id,
              title,
              price,
              compare_at_price,
              sku,
              inventory_quantity
            FROM yovo_tbl_aiva_product_variants
            WHERE product_id = ?
          `, [product.id]);

          return {
            id: product.id,
            shopify_product_id: product.shopify_product_id,
            title: product.title,
            description: product.description,
            vendor: product.vendor,
            product_type: product.product_type,
            tags: product.tags ? (typeof product.tags === 'string' ? JSON.parse(product.tags) : product.tags) : [],
            handle: product.handle,  // ✅ Now extracted from JSON
            shop_domain: product.shop_domain,  // ✅ Added shop domain
            status: product.status,
            images: productImages,
            image_url: productImages[0]?.src || null,
            variants: variants.map(v => ({
              id: v.variant_id,
              title: v.title,
              price: v.price,
              compare_at_price: v.compare_at_price,
              sku: v.sku,
              inventory_quantity: v.inventory_quantity,
            }))
          };
        })
      );

      return { products: enrichedProducts };

    } catch (error) {
      console.error('Error getting products by IDs:', error);
      throw error;
    }
  }

  /**
   * Fetch single product by ID from Shopify (kept for fallback)
   * @param {string} shopDomain
   * @param {string} accessToken
   * @param {string} productId
   * @returns {Promise<Object>}
   */
  async fetchProductById(shopDomain, accessToken, productId) {
    await this.rateLimiter();

    const url = `https://${shopDomain}/admin/api/2024-01/products/${productId}.json`;
    
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    return response.data.product;
  }
  
  // ============================================
  // ORDER STATUS METHODS
  // ============================================

  /**
   * Lookup order by order number, email, or phone
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {Object} params - Search parameters
   * @param {string} [params.order_number] - Order number (e.g., #1001 or 1001)
   * @param {string} [params.email] - Customer email
   * @param {string} [params.phone] - Customer phone
   * @returns {Promise<Object>} Order lookup result
   */
  /**
   * Lookup order by order number, email, or phone
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {Object} params - Search parameters
   * @param {string} [params.order_number] - Order number (e.g., #1001 or 1001 or CZ-228913_1)
   * @param {string} [params.email] - Customer email
   * @param {string} [params.phone] - Customer phone
   * @returns {Promise<Object>} Order lookup result
   */
  async lookupOrder(shopDomain, accessToken, params = {}) {
    const { order_number, email, phone } = params;

    if (!order_number && !email && !phone) {
      throw new Error('At least one search parameter is required: order_number, email, or phone');
    }

    try {
      let orders = [];
      let searchedVariants = [];

      // ============================================
      // SEARCH BY ORDER NUMBER (with smart fallback)
      // ============================================
      if (order_number) {
        let cleanOrderNumber = order_number.toString().trim().replace(/^#/, '');
        searchedVariants.push(cleanOrderNumber);

        // Strategy 1: Try exact match first
        console.log(`📦 [ORDER LOOKUP] Trying exact match: "${cleanOrderNumber}"`);
        let endpoint = `/orders.json?status=any&limit=10&name=${encodeURIComponent(cleanOrderNumber)}`;
        let response = await this._makeRequest(shopDomain, accessToken, endpoint);
        orders = response.data.orders || [];

        // Strategy 2: If not found and has underscore suffix (split order), try base order number
        if (orders.length === 0 && /_\d+$/.test(cleanOrderNumber)) {
          const baseOrderNumber = cleanOrderNumber.replace(/_\d+$/, '');
          searchedVariants.push(baseOrderNumber);
          
          console.log(`📦 [ORDER LOOKUP] Split order detected. Trying base order: "${baseOrderNumber}"`);
          endpoint = `/orders.json?status=any&limit=10&name=${encodeURIComponent(baseOrderNumber)}`;
          response = await this._makeRequest(shopDomain, accessToken, endpoint);
          orders = response.data.orders || [];

          if (orders.length > 0) {
            console.log(`✅ [ORDER LOOKUP] Found order using base number: ${baseOrderNumber}`);
          }
        }

        // Strategy 3: Try with # prefix if not found
        if (orders.length === 0) {
          const withHash = `#${cleanOrderNumber}`;
          searchedVariants.push(withHash);
          
          console.log(`📦 [ORDER LOOKUP] Trying with # prefix: "${withHash}"`);
          endpoint = `/orders.json?status=any&limit=10&name=${encodeURIComponent(withHash)}`;
          response = await this._makeRequest(shopDomain, accessToken, endpoint);
          orders = response.data.orders || [];
        }

        // Strategy 4: Try base order with # prefix
        if (orders.length === 0 && /_\d+$/.test(cleanOrderNumber)) {
          const baseWithHash = `#${cleanOrderNumber.replace(/_\d+$/, '')}`;
          searchedVariants.push(baseWithHash);
          
          console.log(`📦 [ORDER LOOKUP] Trying base with # prefix: "${baseWithHash}"`);
          endpoint = `/orders.json?status=any&limit=10&name=${encodeURIComponent(baseWithHash)}`;
          response = await this._makeRequest(shopDomain, accessToken, endpoint);
          orders = response.data.orders || [];
        }
      }

      // ============================================
      // SEARCH BY EMAIL
      // ============================================
      if (orders.length === 0 && email) {
        console.log(`📦 [ORDER LOOKUP] Searching by email: "${email}"`);
        const endpoint = `/orders.json?status=any&limit=10&email=${encodeURIComponent(email)}`;
        const response = await this._makeRequest(shopDomain, accessToken, endpoint);
        orders = response.data.orders || [];
      }

      // ============================================
      // FILTER BY PHONE
      // ============================================
      if (phone) {
		  console.log(`📦 [ORDER LOOKUP] Processing phone search: "${phone}"`);
		  
		  // Normalize the search phone number
		  const normalizedSearchPhone = this._normalizePhoneNumber(phone);
		  console.log(`📦 [ORDER LOOKUP] Normalized search phone: "${normalizedSearchPhone}"`);
		  
		  // STRATEGY 1: Try GraphQL Customer Lookup first (much faster)
		  if (orders.length === 0) {
			console.log(`📦 [ORDER LOOKUP] Trying GraphQL customer lookup first...`);
			
			try {
			  const customer = await this.lookupCustomerByPhone(shopDomain, accessToken, phone);
			  
			  if (customer && customer.orders?.nodes?.length > 0) {
				console.log(`✅ [ORDER LOOKUP] Found ${customer.orders.nodes.length} orders via customer lookup`);
				
				// Convert GraphQL orders to REST format for compatibility
				orders = customer.orders.nodes.map(order => this._convertGraphQLOrderToREST(order));
				
				// If we have orders from customer lookup, skip pagination
				if (orders.length > 0) {
				  console.log(`✅ [ORDER LOOKUP] Using ${orders.length} orders from customer lookup`);
				}
			  }
			} catch (customerLookupError) {
			  console.error(`⚠️ [ORDER LOOKUP] Customer lookup failed, will try pagination:`, customerLookupError.message);
			}
		  }
		  
		  // STRATEGY 2: Fallback to pagination if customer lookup didn't find orders
		  if (orders.length === 0) {
			// Fetch orders with pagination to find phone matches in older orders
			console.log(`📦 [ORDER LOOKUP] Customer lookup found no orders, falling back to pagination...`);
			
			let matchedOrders = [];
			let hasNextPage = true;
			let cursor = null;
			let pageCount = 0;
			const maxPages = 50; // Search up to 12500 orders (50 pages × 250)
			let totalOrdersSearched = 0;
			
			while (hasNextPage && pageCount < maxPages && matchedOrders.length === 0) {
			  let endpoint;
			  if (cursor) {
				// When using page_info, you cannot include other parameters like status
				endpoint = `/orders.json?limit=250&page_info=${cursor}`;
			  } else {
				// First request - include status
				endpoint = `/orders.json?status=any&limit=250`;
			  }
			  
			  const response = await this._makeRequest(shopDomain, accessToken, endpoint);
			  const pageOrders = response.data.orders || [];
			  pageCount++;
			  totalOrdersSearched += pageOrders.length;
			  
			  console.log(`📦 [ORDER LOOKUP] Page ${pageCount}: Searching ${pageOrders.length} orders...`);
			  
			  // Check each order for phone match
			  for (const order of pageOrders) {
				const orderPhones = [
				  order.phone,
				  order.customer?.phone,
				  order.customer?.default_address?.phone,
				  order.billing_address?.phone,
				  order.shipping_address?.phone
				].filter(Boolean);
				
				// Debug: Log first few orders' phone numbers on first page
				if (pageCount === 1 && pageOrders.indexOf(order) < 3) {
				  console.log(`📦 [ORDER LOOKUP] Sample order ${order.name}: phones = [${orderPhones.join(', ')}]`);
				}
				
				const phoneMatch = orderPhones.some(orderPhone => {
				  const normalizedOrderPhone = this._normalizePhoneNumber(orderPhone);
				  const isMatch = this._phonesMatch(normalizedSearchPhone, normalizedOrderPhone);
				  return isMatch;
				});
				
				if (phoneMatch) {
				  console.log(`✅ [ORDER LOOKUP] Phone match found in order ${order.name}!`);
				  matchedOrders.push(order);
				}
			  }
			  
			  // Check pagination for next page
			  const pageInfo = this._parsePageInfo(response);
			  hasNextPage = pageInfo.hasNextPage && pageOrders.length === 250;
			  cursor = pageInfo.endCursor;
			  
			  // If we found matches, stop searching
			  if (matchedOrders.length > 0) {
				console.log(`✅ [ORDER LOOKUP] Found ${matchedOrders.length} matching order(s) after searching ${totalOrdersSearched} orders`);
				break;
			  }
			  
			  // If no more pages, stop
			  if (!hasNextPage || pageOrders.length < 250) {
				console.log(`📦 [ORDER LOOKUP] Reached end of orders (${totalOrdersSearched} searched)`);
				break;
			  }
			}
			
			orders = matchedOrders;
			console.log(`📦 [ORDER LOOKUP] Final result: ${orders.length} orders matching phone (searched ${totalOrdersSearched} total)`);
		  } else if (orders.length > 0 && !orders[0]._fromCustomerLookup) {
			// We already have orders (from order_number or email search), filter by phone
			console.log(`📦 [ORDER LOOKUP] Filtering ${orders.length} existing orders by phone...`);
			
			const matchedOrders = orders.filter(order => {
			  const orderPhones = [
				order.phone,
				order.customer?.phone,
				order.customer?.default_address?.phone,
				order.billing_address?.phone,
				order.shipping_address?.phone
			  ].filter(Boolean);

			  return orderPhones.some(orderPhone => {
				const normalizedOrderPhone = this._normalizePhoneNumber(orderPhone);
				const isMatch = this._phonesMatch(normalizedSearchPhone, normalizedOrderPhone);
				
				if (isMatch) {
				  console.log(`✅ [ORDER LOOKUP] Phone match found: "${orderPhone}" matches "${phone}"`);
				}
				
				return isMatch;
			  });
			});

			orders = matchedOrders;
			console.log(`📦 [ORDER LOOKUP] Found ${orders.length} orders matching phone`);
		  }
		}

      // ============================================
      // PROCESS RESULTS
      // ============================================
      if (orders.length === 0) {
        return {
          found: false,
          order: null,
          searched_variants: searchedVariants,
          message: `No order found. Searched for: ${searchedVariants.join(', ')}`
        };
      }

	  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      // Get the most recent order
      const order = orders[0];

      // Check if split order lookup
      const originalOrderNumber = order_number?.toString().trim().replace(/^#/, '');
      const isSplitOrderLookup = originalOrderNumber && /_\d+$/.test(originalOrderNumber);
      const splitSuffix = isSplitOrderLookup ? originalOrderNumber.match(/_(\d+)$/)[1] : null;

      // ============================================
      // GET TRACKING INFO
      // ============================================
      const fulfillments = order.fulfillments || [];
      const latestFulfillment = fulfillments[fulfillments.length - 1];
      
      let trackingInfo = null;
      if (latestFulfillment && latestFulfillment.tracking_numbers?.length > 0) {
        trackingInfo = {
          company: latestFulfillment.tracking_company || 'Courier',
          number: latestFulfillment.tracking_numbers[0],
          url: latestFulfillment.tracking_urls?.[0] || null,
          status: latestFulfillment.shipment_status || latestFulfillment.status
        };
      }

      // ============================================
      // GET ORDER STATUS (Priority: Cancelled > Fulfillment > Financial)
      // ============================================
      let statusInfo = { status: 'unknown', description: 'Please contact support for order status.' };
      
      // Priority 1: Check if cancelled
      if (order.cancelled_at) {
        statusInfo = {
          status: 'cancelled',
          description: `This order was cancelled on ${new Date(order.cancelled_at).toLocaleDateString()}.${order.cancel_reason ? ` Reason: ${order.cancel_reason}` : ''}`
        };
      }
      // Priority 2: Check fulfillment status (most important for customer)
      else if (order.fulfillment_status === 'fulfilled' || fulfillments.length > 0) {
        const shipmentStatus = latestFulfillment?.shipment_status;

        if (shipmentStatus === 'delivered') {
          statusInfo = {
            status: 'delivered',
            description: 'Great news! Your order has been delivered.'
          };
        } else if (shipmentStatus === 'out_for_delivery') {
          statusInfo = {
            status: 'out_for_delivery',
            description: 'Your order is out for delivery and should arrive today!'
          };
        } else if (shipmentStatus === 'in_transit') {
          statusInfo = {
            status: 'in_transit',
            description: 'Your order is on its way and currently in transit.'
          };
        } else if (shipmentStatus === 'attempted_delivery') {
          statusInfo = {
            status: 'attempted_delivery',
            description: 'Delivery was attempted but unsuccessful. The courier will try again.'
          };
        } else if (shipmentStatus === 'ready_for_pickup') {
          statusInfo = {
            status: 'ready_for_pickup',
            description: 'Your order is ready for pickup at the designated location.'
          };
        } else if (shipmentStatus === 'failure') {
          statusInfo = {
            status: 'delivery_failed',
            description: 'There was an issue with delivery. Please contact support.'
          };
        } else {
          statusInfo = {
            status: 'shipped',
            description: 'Your order has been shipped and is on its way.'
          };
        }
      }
      // Priority 3: Check partial fulfillment
      else if (order.fulfillment_status === 'partial') {
        statusInfo = {
          status: 'partially_shipped',
          description: 'Part of your order has been shipped. Remaining items are being prepared.'
        };
      }
      // Priority 4: Check financial status (only for unfulfilled orders)
      else if (order.financial_status === 'refunded') {
        statusInfo = {
          status: 'refunded',
          description: 'This order has been refunded.'
        };
      }
      else if (order.financial_status === 'voided') {
        statusInfo = {
          status: 'voided',
          description: 'This order has been voided.'
        };
      }
      // Priority 5: Order is confirmed but not yet shipped
      else {
        const isCOD = order.payment_gateway_names?.some(pg => 
          pg.toLowerCase().includes('cod') || pg.toLowerCase().includes('cash on delivery')
        );

        if (isCOD) {
          statusInfo = {
            status: 'processing',
            description: 'Your order is confirmed and being prepared for shipment. Payment will be collected on delivery.'
          };
        } else if (order.financial_status === 'pending' || order.financial_status === 'authorized') {
          statusInfo = {
            status: 'payment_pending',
            description: 'Your order is awaiting payment confirmation.'
          };
        } else {
          statusInfo = {
            status: 'processing',
            description: 'Your order is confirmed and being prepared for shipment.'
          };
        }
      }

      // ============================================
      // FORMAT LINE ITEMS
      // ============================================
      const lineItems = (order.line_items || []).map(item => ({
        name: item.name || item.title,
        quantity: item.quantity,
        price: item.price,
        sku: item.sku,
        variant_title: item.variant_title
      }));

      // ============================================
      // FORMAT SHIPPING ADDRESS
      // ============================================
      const shippingAddress = order.shipping_address ? {
        name: `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim(),
        address1: order.shipping_address.address1,
        address2: order.shipping_address.address2,
        city: order.shipping_address.city,
        province: order.shipping_address.province,
        country: order.shipping_address.country,
        zip: order.shipping_address.zip,
        phone: order.shipping_address.phone
      } : null;

      // ============================================
      // BUILD FORMATTED ORDER RESPONSE
      // ============================================
      const formattedOrder = {
        order_id: order.id,
        order_number: order.name || `#${order.order_number}`,
        status: statusInfo.status,
        status_description: statusInfo.description,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status || 'unfulfilled',
        created_at: order.created_at,
        total_price: order.total_price,
        subtotal_price: order.subtotal_price,
        total_shipping: order.total_shipping_price_set?.shop_money?.amount || '0.00',
        currency: order.currency,
        line_items: lineItems,
        item_count: lineItems.reduce((sum, item) => sum + item.quantity, 0),
        shipping_address: shippingAddress,
        tracking: trackingInfo,
        has_tracking: !!trackingInfo,
        customer_email: order.email,
        customer_phone: order.phone || order.shipping_address?.phone || order.billing_address?.phone,
        is_cancelled: !!order.cancelled_at,
        cancel_reason: order.cancel_reason,
        payment_method: order.payment_gateway_names?.join(', ') || 'N/A',
        order_status_url: order.order_status_url || null
      };

      // Add split order info if applicable
      if (isSplitOrderLookup) {
        formattedOrder.split_order_info = {
          customer_order_number: originalOrderNumber,
          shopify_order_number: order.name,
          split_number: splitSuffix,
          note: `This is split shipment #${splitSuffix} of order ${order.name}`
        };
      }

      return {
        found: true,
        order: formattedOrder,
        total_orders_found: orders.length,
        searched_variants: searchedVariants,
        message: isSplitOrderLookup 
          ? `Found parent order ${order.name} for split order ${originalOrderNumber}`
          : 'Order found'
      };

    } catch (error) {
      console.error('Order lookup error:', error);
      throw new Error(`Failed to lookup order: ${error.message}`);
    }
  }

  /**
   * Normalize phone number - just extract digits, don't convert formats
   * @private
   * @param {string} phone - Phone number in any format
   * @returns {string} Digits only
   */
  _normalizePhoneNumber(phone) {
    if (!phone) return '';
    
    // Remove all non-digit characters
    let normalized = phone.toString().trim();
    normalized = normalized.replace(/[^\d]/g, '');
    
    // Remove leading 00 (international dialing prefix)
    if (normalized.startsWith('00')) {
      normalized = normalized.substring(2);
    }
    
    return normalized;
  }

  /**
   * Extract the "core" phone number and detect country code
   * Returns both the core number and detected country info for smarter variant generation
   * @private
   * @param {string} phone - Normalized phone (digits only)
   * @returns {Object} { core: string, countryCode: string|null, countryPattern: string|null }
   */
  _extractPhoneInfo(phone) {
    if (!phone) return { core: '', countryCode: null, countryPattern: null };
    
    // Common country codes with their typical local number lengths
    // Format: [countryCode, localNumberLength, hasLeadingZero]
    const countryPatterns = [
      { code: '92', localLen: 10, hasLeadingZero: true, name: 'PK' },    // Pakistan: 92 + 10 digits (3XX...)
      { code: '1', localLen: 10, hasLeadingZero: false, name: 'US' },    // US/Canada: 1 + 10 digits
      { code: '44', localLen: 10, hasLeadingZero: true, name: 'UK' },    // UK: 44 + 10 digits (7XXX...)
      { code: '971', localLen: 9, hasLeadingZero: true, name: 'UAE' },   // UAE: 971 + 9 digits
      { code: '966', localLen: 9, hasLeadingZero: true, name: 'SA' },    // Saudi: 966 + 9 digits
      { code: '91', localLen: 10, hasLeadingZero: false, name: 'IN' },   // India: 91 + 10 digits
      { code: '86', localLen: 11, hasLeadingZero: false, name: 'CN' },   // China: 86 + 11 digits
      { code: '61', localLen: 9, hasLeadingZero: true, name: 'AU' },     // Australia: 61 + 9 digits
      { code: '49', localLen: 10, hasLeadingZero: true, name: 'DE' },    // Germany: 49 + 10-11 digits
      { code: '33', localLen: 9, hasLeadingZero: true, name: 'FR' },     // France: 33 + 9 digits
    ];
    
    // Try to match country code
    for (const pattern of countryPatterns) {
      if (phone.startsWith(pattern.code)) {
        const expectedLen = pattern.code.length + pattern.localLen;
        // Allow some flexibility in length (±1 digit)
        if (phone.length >= expectedLen - 1 && phone.length <= expectedLen + 1) {
          const core = phone.substring(pattern.code.length);
          return { 
            core, 
            countryCode: pattern.code, 
            countryPattern: pattern,
            hasLeadingZero: pattern.hasLeadingZero 
          };
        }
      }
    }
    
    // Pakistani format with leading 0: 03XXXXXXXXX (11 digits)
    if (phone.startsWith('0') && phone.length === 11 && phone[1] === '3') {
      return { 
        core: phone.substring(1), // Remove leading 0
        countryCode: '92', 
        countryPattern: countryPatterns[0],
        hasLeadingZero: true 
      };
    }
    
    // No country code detected - return as-is
    // For numbers 9-11 digits, assume it's a local number
    return { 
      core: phone, 
      countryCode: null, 
      countryPattern: null,
      hasLeadingZero: null
    };
  }

  /**
   * Extract the "core" phone number without country code (backward compatible)
   * @private
   * @param {string} phone - Normalized phone (digits only)
   * @returns {string} Core phone number
   */
  _extractCorePhone(phone) {
    const info = this._extractPhoneInfo(phone);
    return info.core || phone;
  }

  /**
   * Generate all possible phone format variants for searching
   * @private
   * @param {string} normalizedPhone - Digits only phone
   * @param {Object} phoneInfo - Result from _extractPhoneInfo
   * @returns {Array<string>} Array of phone variants to try
   */
  _generatePhoneVariants(normalizedPhone, phoneInfo) {
    const variants = [];
    const { core, countryCode, hasLeadingZero } = phoneInfo;
    
    // Always include the original normalized phone
    variants.push(normalizedPhone);
    
    if (countryCode && core) {
      // ============================================
      // KNOWN COUNTRY CODE - Generate targeted variants
      // ============================================
      
      // Core number without any prefix
      variants.push(core);
      
      // With country code (various formats)
      variants.push(`${countryCode}${core}`);           // 923004322088
      variants.push(`+${countryCode}${core}`);          // +923004322088
      variants.push(`00${countryCode}${core}`);         // 00923004322088
      
      // With leading zero (if country uses it for local calls)
      if (hasLeadingZero) {
        variants.push(`0${core}`);                      // 03004322088
        // Some might store as 0 + country + number (unusual but seen)
        variants.push(`0${countryCode}${core}`);        // 0923004322088
      }
      
      // Special handling for Pakistani numbers (most common case)
      if (countryCode === '92' && core.startsWith('3')) {
        // Ensure we have all PK formats
        variants.push(core);                            // 3004322088
        variants.push(`0${core}`);                      // 03004322088
        variants.push(`92${core}`);                     // 923004322088
        variants.push(`+92${core}`);                    // +923004322088
        variants.push(`0092${core}`);                   // 00923004322088
      }
      
    } else {
      // ============================================
      // UNKNOWN FORMAT - Try common variations
      // ============================================
      
      // If it looks like a local number without country code
      if (normalizedPhone.length >= 9 && normalizedPhone.length <= 11) {
        // Original
        variants.push(normalizedPhone);
        
        // With/without leading zero
        if (normalizedPhone.startsWith('0')) {
          variants.push(normalizedPhone.substring(1));
        } else {
          variants.push(`0${normalizedPhone}`);
        }
        
        // Try common country codes (Pakistan first since most likely)
        const tryCountryCodes = ['92', '1', '44', '971'];
        for (const cc of tryCountryCodes) {
          const numWithoutZero = normalizedPhone.startsWith('0') 
            ? normalizedPhone.substring(1) 
            : normalizedPhone;
          variants.push(`${cc}${numWithoutZero}`);
          variants.push(`+${cc}${numWithoutZero}`);
        }
      }
      
      // For longer numbers, try stripping possible country codes
      if (normalizedPhone.length >= 11) {
        // Last 10 digits (common subscriber number length)
        variants.push(normalizedPhone.slice(-10));
        variants.push(`0${normalizedPhone.slice(-10)}`);
        
        // Last 9 digits (for countries with 9-digit local numbers)
        variants.push(normalizedPhone.slice(-9));
        variants.push(`0${normalizedPhone.slice(-9)}`);
      }
    }
    
    return variants;
  }
  
  /**
   * Check if two phone numbers match (handling different formats)
   * @private
   * @param {string} searchPhone - Normalized search phone number
   * @param {string} orderPhone - Normalized order phone number
   * @returns {boolean} True if phones match
   */
  _phonesMatch(searchPhone, orderPhone) {
    if (!searchPhone || !orderPhone) return false;
    
    // Strategy 1: Direct match
    if (searchPhone === orderPhone) {
      return true;
    }
    
    // Strategy 2: Core phone match (without country codes)
    const searchCore = this._extractCorePhone(searchPhone);
    const orderCore = this._extractCorePhone(orderPhone);
    
    if (searchCore && orderCore && searchCore === orderCore) {
      return true;
    }
    
    // Strategy 3: One ends with the other (handles partial country codes)
    if (searchPhone.length >= 9 && orderPhone.length >= 9) {
      if (searchPhone.endsWith(orderPhone) || orderPhone.endsWith(searchPhone)) {
        return true;
      }
    }
    
    // Strategy 4: Last N digits match (fallback)
    // Try last 10, 9, and 8 digits
    for (const len of [10, 9, 8]) {
      if (searchPhone.length >= len && orderPhone.length >= len) {
        if (searchPhone.slice(-len) === orderPhone.slice(-len)) {
          return true;
        }
      }
    }
    
    // Strategy 5: Pakistani specific - compare without leading 0 or 92
    const stripPakistaniPrefix = (p) => {
      if (p.startsWith('92')) return p.substring(2);
      if (p.startsWith('0')) return p.substring(1);
      return p;
    };
    
    const searchStripped = stripPakistaniPrefix(searchPhone);
    const orderStripped = stripPakistaniPrefix(orderPhone);
    
    if (searchStripped === orderStripped) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get order by Shopify order ID
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string|number} orderId - Shopify order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrderById(shopDomain, accessToken, orderId) {
    try {
      const response = await this._makeRequest(
        shopDomain,
        accessToken,
        `/orders/${orderId}.json`
      );

      if (!response.data.order) {
        return {
          found: false,
          order: null,
          message: 'Order not found'
        };
      }

      return {
        found: true,
        order: this.formatOrderForResponse(response.data.order),
        message: 'Order found'
      };

    } catch (error) {
      if (error.message.includes('404')) {
        return {
          found: false,
          order: null,
          message: 'Order not found'
        };
      }
      throw new Error(`Failed to get order: ${error.message}`);
    }
  }

  /**
   * Get multiple orders for a customer by email
   * @param {string} shopDomain - Shop domain
   * @param {string} accessToken - Access token
   * @param {string} email - Customer email
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Orders list
   */
  async getCustomerOrders(shopDomain, accessToken, email, options = {}) {
    const { limit = 10, status = 'any' } = options;

    try {
      const endpoint = `/orders.json?email=${encodeURIComponent(email)}&status=${status}&limit=${limit}`;
      const response = await this._makeRequest(shopDomain, accessToken, endpoint);
      const orders = response.data.orders || [];

      return {
        found: orders.length > 0,
        orders: orders.map(order => this.formatOrderForResponse(order)),
        total: orders.length,
        message: orders.length > 0 
          ? `Found ${orders.length} order(s)` 
          : 'No orders found for this email'
      };

    } catch (error) {
      throw new Error(`Failed to get customer orders: ${error.message}`);
    }
  }

  /**
   * Format order data for voice/chat response
   * @param {Object} order - Raw Shopify order
   * @returns {Object} Formatted order
   */
  formatOrderForResponse(order) {
    // Get fulfillment and tracking info
    const fulfillments = order.fulfillments || [];
    const latestFulfillment = fulfillments[fulfillments.length - 1];
    
    let trackingInfo = null;
    if (latestFulfillment && latestFulfillment.tracking_numbers?.length > 0) {
      trackingInfo = {
        company: latestFulfillment.tracking_company || 'Courier',
        number: latestFulfillment.tracking_numbers[0],
        url: latestFulfillment.tracking_urls?.[0] || null,
        status: latestFulfillment.shipment_status || latestFulfillment.status
      };
    }

    // Calculate order status for voice response
    const orderStatus = this._getOrderStatusDescription(order);

    // Format line items
    const lineItems = (order.line_items || []).map(item => ({
      name: item.name || item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.sku,
      variant_title: item.variant_title
    }));

    // Format shipping address
    const shippingAddress = order.shipping_address ? {
      name: `${order.shipping_address.first_name || ''} ${order.shipping_address.last_name || ''}`.trim(),
      address1: order.shipping_address.address1,
      address2: order.shipping_address.address2,
      city: order.shipping_address.city,
      province: order.shipping_address.province,
      country: order.shipping_address.country,
      zip: order.shipping_address.zip,
      phone: order.shipping_address.phone
    } : null;

    return {
      // Order identifiers
      order_id: order.id,
      order_number: order.name || `#${order.order_number}`,
      
      // Status information
      status: orderStatus.status,
      status_description: orderStatus.description,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status || 'unfulfilled',
      
      // Dates
      created_at: order.created_at,
      updated_at: order.updated_at,
      processed_at: order.processed_at,
      closed_at: order.closed_at,
      cancelled_at: order.cancelled_at,
      
      // Financials
      total_price: order.total_price,
      subtotal_price: order.subtotal_price,
      total_tax: order.total_tax,
      total_shipping: order.total_shipping_price_set?.shop_money?.amount || '0.00',
      currency: order.currency,
      
      // Items
      line_items: lineItems,
      item_count: lineItems.reduce((sum, item) => sum + item.quantity, 0),
      
      // Shipping
      shipping_address: shippingAddress,
      
      // Tracking
      tracking: trackingInfo,
      has_tracking: !!trackingInfo,
      
      // Customer info (limited for privacy)
      customer_email: order.email,
      customer_phone: order.phone,
      
      // Cancellation info
      is_cancelled: !!order.cancelled_at,
      cancel_reason: order.cancel_reason,
      
      // Payment
      payment_gateway: order.payment_gateway_names?.join(', ') || 'N/A',
      
      // Notes (for internal use)
      note: order.note,
      tags: order.tags,
	  order_status_url: order.order_status_url || null
    };
  }

  /**
   * Get human-readable order status description
   * @private
   * @param {Object} order - Shopify order
   * @returns {Object} Status and description
   */
  _getOrderStatusDescription(order) {
    // Check if cancelled
    if (order.cancelled_at) {
      return {
        status: 'cancelled',
        description: `This order was cancelled on ${new Date(order.cancelled_at).toLocaleDateString()}. ${order.cancel_reason ? `Reason: ${order.cancel_reason}` : ''}`
      };
    }

    // Check fulfillment status
    const fulfillmentStatus = order.fulfillment_status;
    const financialStatus = order.financial_status;

    // Payment pending
    if (financialStatus === 'pending' || financialStatus === 'authorized') {
      return {
        status: 'payment_pending',
        description: 'Your order is awaiting payment confirmation.'
      };
    }

    // Refunded
    if (financialStatus === 'refunded') {
      return {
        status: 'refunded',
        description: 'This order has been refunded.'
      };
    }

    // Check fulfillment
    if (!fulfillmentStatus || fulfillmentStatus === 'null') {
      return {
        status: 'processing',
        description: 'Your order is confirmed and being prepared for shipment.'
      };
    }

    if (fulfillmentStatus === 'partial') {
      return {
        status: 'partially_shipped',
        description: 'Part of your order has been shipped. The remaining items are being prepared.'
      };
    }

    if (fulfillmentStatus === 'fulfilled') {
      // Check if there's tracking
      const fulfillments = order.fulfillments || [];
      const hasTracking = fulfillments.some(f => f.tracking_numbers?.length > 0);
      
      if (hasTracking) {
        const latestFulfillment = fulfillments[fulfillments.length - 1];
        const shipmentStatus = latestFulfillment.shipment_status;
        
        if (shipmentStatus === 'delivered') {
          return {
            status: 'delivered',
            description: 'Your order has been delivered.'
          };
        }
        
        if (shipmentStatus === 'out_for_delivery') {
          return {
            status: 'out_for_delivery',
            description: 'Your order is out for delivery and will arrive today.'
          };
        }
        
        if (shipmentStatus === 'in_transit') {
          return {
            status: 'in_transit',
            description: 'Your order is on its way and in transit.'
          };
        }
        
        return {
          status: 'shipped',
          description: 'Your order has been shipped.'
        };
      }
      
      return {
        status: 'shipped',
        description: 'Your order has been fulfilled and shipped.'
      };
    }

    // Default
    return {
      status: 'unknown',
      description: 'Please contact support for order status.'
    };
  }

  /**
   * Lookup order by KB ID (convenience method that gets store credentials first)
   * @param {string} kbId - Knowledge base ID
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Order lookup result
   */
  async lookupOrderByKbId(kbId, params) {
    // Get store by KB ID
    const store = await this.getActiveStoreByKbId(kbId);
    
    if (!store) {
      return {
        found: false,
        order: null,
        message: 'No active Shopify store connected to this knowledge base'
      };
    }

    return this.lookupOrder(store.shop_domain, store.access_token, params);
  }
  
  /**
   * Format order for voice response (concise version)
   * @param {Object} order - Formatted order from formatOrderForResponse
   * @returns {string} Voice-friendly response
   */
  formatOrderForVoice(order) {
    let response = '';
    
    // Mention split order info if present
    if (order.split_order_info) {
      response += `Your order ${order.split_order_info.customer_order_number} is part of order ${order.order_number}. `;
    } else {
      response += `Your order ${order.order_number} `;
    }
    
    // Add status
    response += `${order.status_description} `;
    
    // Add tracking if available
    if (order.has_tracking && order.tracking) {
      response += `Your tracking number is ${order.tracking.number} via ${order.tracking.company}. `;
    }
    
    // Add total
    response += `The order total is ${order.currency} ${order.total_price}. `;
    
    // Add item count
    response += `It contains ${order.item_count} item${order.item_count > 1 ? 's' : ''}.`;
    
    return response;
  }
  
  /**
	 * Lookup customer and their orders by phone using GraphQL
	 * @param {string} shopDomain - Shop domain
	 * @param {string} accessToken - Access token  
	 * @param {string} phone - Phone number to search
	 * @returns {Promise<Object|null>} Customer with orders or null if not found
	 */
	async lookupCustomerByPhone(shopDomain, accessToken, phone) {
	  const normalizedPhone = this._normalizePhoneNumber(phone);
	  const phoneInfo = this._extractPhoneInfo(normalizedPhone);
	  
	  console.log(`📱 [CUSTOMER LOOKUP] Input: "${phone}", Normalized: "${normalizedPhone}", Core: "${phoneInfo.core}", Country: ${phoneInfo.countryCode || 'unknown'}`);
	  
	  // Generate phone variants based on detected format
	  const phoneVariants = this._generatePhoneVariants(normalizedPhone, phoneInfo);
	  
	  // Remove duplicates and filter valid ones
	  const uniqueVariants = [...new Set(phoneVariants.filter(v => v && v.length >= 7))];
	  
	  console.log(`📱 [CUSTOMER LOOKUP] Generated ${uniqueVariants.length} variants:`, uniqueVariants.slice(0, 8));
	  
	  //console.log(`📱 [CUSTOMER LOOKUP] Searching for phone variants:`, uniqueVariants);
	  
	  const graphqlUrl = `https://${shopDomain}/admin/api/2024-01/graphql.json`;
	  
	  for (const phoneVariant of uniqueVariants) {
		try {
		  const query = `
			  query findCustomerByPhone($phoneQuery: String!) {
				customers(first: 1, query: $phoneQuery) {
				  nodes {
					id
					email
					phone
					firstName
					lastName
					numberOfOrders
					orders(first: 10, sortKey: CREATED_AT, reverse: true) {
					  nodes {
						id
						name
						email
						phone
						createdAt
						updatedAt
						processedAt
						closedAt
						cancelledAt
						displayFulfillmentStatus
						displayFinancialStatus
						totalPriceSet {
						  shopMoney { amount currencyCode }
						}
						subtotalPriceSet {
						  shopMoney { amount currencyCode }
						}
						totalTaxSet {
						  shopMoney { amount currencyCode }
						}
						totalShippingPriceSet {
						  shopMoney { amount currencyCode }
						}
						currencyCode
						lineItems(first: 50) {
						  nodes {
							name
							title
							quantity
							sku
							variantTitle
							originalUnitPriceSet {
							  shopMoney { amount currencyCode }
							}
						  }
						}
						shippingAddress {
						  firstName
						  lastName
						  address1
						  address2
						  city
						  province
						  country
						  zip
						  phone
						}
						billingAddress {
						  firstName
						  lastName
						  address1
						  city
						  province
						  country
						  phone
						}
						fulfillments {
						  status
						  trackingInfo {
							number
							url
							company
						  }
						}
						statusPageUrl
					  }
					}
				  }
				}
			  }
			`;
		  
		  const queryString = `phone:${phoneVariant}`;
		  console.log(`📱 [CUSTOMER LOOKUP] Trying GraphQL query: "${queryString}"`);


		  const response = await axios.post(graphqlUrl, {
			query,
			variables: { phoneQuery: queryString }
		  }, {
			headers: {
			  'X-Shopify-Access-Token': accessToken,
			  'Content-Type': 'application/json'
			}
		  });
		  
		  //console.log(`📱 [CUSTOMER LOOKUP] GraphQL response for ${phoneVariant}:`, JSON.stringify(response.data, null, 2));

		  const customers = response.data?.data?.customers?.nodes || [];
		  
		  if (customers.length > 0 && customers[0].orders?.nodes?.length > 0) {
			console.log(`✅ [CUSTOMER LOOKUP] Found customer with phone variant: ${phoneVariant}`);
			console.log(`✅ [CUSTOMER LOOKUP] Customer has ${customers[0].ordersCount} orders`);
			return customers[0];
		  }
		  
		} catch (error) {
		  console.error(`❌ [CUSTOMER LOOKUP] Error searching phone ${phoneVariant}:`, error.message);
		}
	  }
	  
	  console.log(`📱 [CUSTOMER LOOKUP] No customer found for any phone variant`);
	  return null;
	}

	/**
	 * Convert GraphQL order to REST-like format for compatibility
	 * @private
	 */
	_convertGraphQLOrderToREST(graphqlOrder) {
	  const order = graphqlOrder;
	  
	  // Extract tracking info from fulfillments
	  const fulfillments = order.fulfillments || [];
	  const latestFulfillment = fulfillments[fulfillments.length - 1];
	  let trackingInfo = null;
	  
	  if (latestFulfillment?.trackingInfo?.length > 0) {
		const tracking = latestFulfillment.trackingInfo[0];
		trackingInfo = {
		  company: tracking.company || 'Courier',
		  number: tracking.number,
		  url: tracking.url,
		  status: latestFulfillment.status
		};
	  }
	  
	  // Map line items
	  const lineItems = (order.lineItems?.nodes || []).map(item => ({
		name: item.name || item.title,
		title: item.title,
		quantity: item.quantity,
		price: item.originalUnitPriceSet?.shopMoney?.amount || '0',
		sku: item.sku,
		variant_title: item.variantTitle
	  }));
	  
	  // Build REST-compatible order object
	  return {
		id: order.id.replace('gid://shopify/Order/', ''),
		name: order.name,
		order_number: order.name,
		email: order.email,
		phone: order.phone,
		created_at: order.createdAt,
		updated_at: order.updatedAt,
		processed_at: order.processedAt,
		closed_at: order.closedAt,
		cancelled_at: order.cancelledAt,
		financial_status: order.financialStatus?.toLowerCase(),
		fulfillment_status: order.fulfillmentStatus?.toLowerCase() || 'unfulfilled',
		display_financial_status: order.displayFinancialStatus,
		display_fulfillment_status: order.displayFulfillmentStatus,
		currency: order.currencyCode,
		total_price: order.totalPriceSet?.shopMoney?.amount || '0',
		subtotal_price: order.subtotalPriceSet?.shopMoney?.amount || '0',
		total_tax: order.totalTaxSet?.shopMoney?.amount || '0',
		total_shipping_price_set: {
		  shop_money: {
			amount: order.totalShippingPriceSet?.shopMoney?.amount || '0'
		  }
		},
		line_items: lineItems,
		shipping_address: order.shippingAddress ? {
		  first_name: order.shippingAddress.firstName,
		  last_name: order.shippingAddress.lastName,
		  address1: order.shippingAddress.address1,
		  address2: order.shippingAddress.address2,
		  city: order.shippingAddress.city,
		  province: order.shippingAddress.province,
		  country: order.shippingAddress.country,
		  zip: order.shippingAddress.zip,
		  phone: order.shippingAddress.phone
		} : null,
		billing_address: order.billingAddress ? {
		  first_name: order.billingAddress.firstName,
		  last_name: order.billingAddress.lastName,
		  address1: order.billingAddress.address1,
		  city: order.billingAddress.city,
		  province: order.billingAddress.province,
		  country: order.billingAddress.country,
		  phone: order.billingAddress.phone
		} : null,
		fulfillments: fulfillments.map(f => ({
		  status: f.status,
		  tracking_company: f.trackingInfo?.[0]?.company,
		  tracking_numbers: f.trackingInfo?.map(t => t.number).filter(Boolean) || [],
		  tracking_urls: f.trackingInfo?.map(t => t.url).filter(Boolean) || []
		})),
		order_status_url: order.statusPageUrl,
		// Pre-computed fields
		tracking: trackingInfo,
		has_tracking: !!trackingInfo
	  };
	}
}

module.exports = new ShopifyService();