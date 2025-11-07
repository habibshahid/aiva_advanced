/**
 * Product Service
 * Manages product CRUD operations and relationships
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class ProductService {
  
  /**
   * Create or update product
   * @param {Object} productData - Product data from Shopify
   * @param {string} kbId - Knowledge base ID
   * @param {string} tenantId - Tenant ID
   * @param {string} storeId - Shopify store ID
   * @returns {Promise<Object>} Created/updated product
   */
  async upsertProduct(productData, kbId, tenantId, storeId) {
    const shopifyProductId = productData.id;
    
    // Check if product exists
    const [existing] = await db.query(
      'SELECT id FROM yovo_tbl_aiva_products WHERE shopify_product_id = ?',
      [shopifyProductId]
    );
    
    if (existing.length > 0) {
      // Update existing product
      await this.updateProduct(existing[0].id, productData);
      return this.getProduct(existing[0].id);
    } else {
      // Create new product
      return this.createProduct(productData, kbId, tenantId, storeId);
    }
  }
  
  /**
   * Create new product
   * @private
   */
  async createProduct(productData, kbId, tenantId, storeId) {
    const productId = uuidv4();
    
    // Calculate total inventory from variants
    const totalInventory = productData.variants.reduce(
      (sum, v) => sum + (v.inventory_quantity || 0), 
      0
    );
    
    // Get price from first variant
    const price = productData.variants[0]?.price || 0;
    const compareAtPrice = productData.variants[0]?.compare_at_price || null;
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_products (
        id, kb_id, tenant_id, shopify_store_id, shopify_product_id,
        title, description, vendor, product_type, tags,
        price, compare_at_price, currency,
        status, published_at, total_inventory,
        shopify_metadata, shopify_updated_at, last_synced_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 'synced')
    `, [
      productId,
      kbId,
      tenantId,
      storeId,
      productData.id,
      productData.title,
      this._cleanHtml(productData.body_html || ''),
      productData.vendor || null,
      productData.product_type || null,
      JSON.stringify(productData.tags ? productData.tags.split(',').map(t => t.trim()) : []),
      price,
      compareAtPrice,
      'PKR', // Default currency
      productData.status,
      productData.published_at,
      totalInventory,
      JSON.stringify({
        handle: productData.handle,
        created_at: productData.created_at,
        updated_at: productData.updated_at,
        options: productData.options,
        admin_graphql_api_id: productData.admin_graphql_api_id
      }),
      productData.updated_at
    ]);
    
    // Create variants
    await this.createVariants(productId, productData.variants);
    
    return this.getProduct(productId);
  }
  
  /**
   * Update existing product
   * @private
   */
  async updateProduct(productId, productData) {
    // Calculate total inventory from variants
    const totalInventory = productData.variants.reduce(
      (sum, v) => sum + (v.inventory_quantity || 0), 
      0
    );
    
    // Get price from first variant
    const price = productData.variants[0]?.price || 0;
    const compareAtPrice = productData.variants[0]?.compare_at_price || null;
    
    await db.query(`
      UPDATE yovo_tbl_aiva_products SET
        title = ?,
        description = ?,
        vendor = ?,
        product_type = ?,
        tags = ?,
        price = ?,
        compare_at_price = ?,
        status = ?,
        published_at = ?,
        total_inventory = ?,
        shopify_metadata = ?,
        shopify_updated_at = ?,
        last_synced_at = NOW(),
        sync_status = 'synced',
        updated_at = NOW()
      WHERE id = ?
    `, [
      productData.title,
      this._cleanHtml(productData.body_html || ''),
      productData.vendor || null,
      productData.product_type || null,
      JSON.stringify(productData.tags ? productData.tags.split(',').map(t => t.trim()) : []),
      price,
      compareAtPrice,
      productData.status,
      productData.published_at,
      totalInventory,
      JSON.stringify({
        handle: productData.handle,
        created_at: productData.created_at,
        updated_at: productData.updated_at,
        options: productData.options,
        admin_graphql_api_id: productData.admin_graphql_api_id
      }),
      productData.updated_at,
      productId
    ]);
    
    // Delete old variants and create new ones
    await db.query('DELETE FROM yovo_tbl_aiva_product_variants WHERE product_id = ?', [productId]);
    await this.createVariants(productId, productData.variants);
  }
  
  /**
   * Create product variants
   * @private
   */
  async createVariants(productId, variants) {
    for (const variant of variants) {
      const variantId = uuidv4();
      
      await db.query(`
        INSERT INTO yovo_tbl_aiva_product_variants (
          id, product_id, shopify_variant_id,
          title, sku, barcode,
          price, compare_at_price,
          inventory_quantity, inventory_policy,
          weight, weight_unit,
          option1, option2, option3,
          available, shopify_metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        variantId,
        productId,
        variant.id,
        variant.title,
        variant.sku || null,
        variant.barcode || null,
        variant.price,
        variant.compare_at_price || null,
        variant.inventory_quantity || 0,
        variant.inventory_policy || 'deny',
        variant.weight || null,
        variant.weight_unit || null,
        variant.option1 || null,
        variant.option2 || null,
        variant.option3 || null,
        variant.available !== false,
        JSON.stringify({
          position: variant.position,
          created_at: variant.created_at,
          updated_at: variant.updated_at,
          taxable: variant.taxable,
          requires_shipping: variant.requires_shipping
        })
      ]);
    }
  }
  
  /**
   * Get product by ID
   * @param {string} productId - Product ID
   * @returns {Promise<Object|null>} Product or null
   */
  async getProduct(productId) {
    const [products] = await db.query(
      `SELECT p.*, s.shop_domain 
       FROM yovo_tbl_aiva_products p
       LEFT JOIN yovo_tbl_aiva_shopify_stores s ON p.shopify_store_id = s.id
       WHERE p.id = ?`,
      [productId]
    );
    
    if (products.length === 0) {
      return null;
    }
    
    const product = products[0];
    
    // Parse JSON fields
    if (product.tags && typeof product.tags === 'string') {
      product.tags = JSON.parse(product.tags);
    }
    if (product.shopify_metadata && typeof product.shopify_metadata === 'string') {
      product.shopify_metadata = JSON.parse(product.shopify_metadata);
    }
    
    // Get variants
    product.variants = await this.getVariants(productId);
    
    // Get images
    product.images = await this.getProductImages(productId);
    
    return product;
  }
  
  /**
   * Get product by Shopify ID
   * @param {number} shopifyProductId - Shopify product ID
   * @returns {Promise<Object|null>} Product or null
   */
  async getProductByShopifyId(shopifyProductId) {
    const [products] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_products WHERE shopify_product_id = ?',
      [shopifyProductId]
    );
    
    if (products.length === 0) {
      return null;
    }
    
    return this.getProduct(products[0].id);
  }
  
  /**
   * Get variants for a product
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} Variants
   */
  async getVariants(productId) {
    const [variants] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_product_variants WHERE product_id = ? ORDER BY created_at',
      [productId]
    );
    
    return variants.map(v => {
      if (v.shopify_metadata && typeof v.shopify_metadata === 'string') {
        v.shopify_metadata = JSON.parse(v.shopify_metadata);
      }
      return v;
    });
  }
  
  /**
   * Link image to product
   * @param {string} productId - Product ID
   * @param {string} imageId - Image ID from yovo_tbl_aiva_images
   * @param {number} shopifyImageId - Shopify image ID
   * @param {number} position - Image position
   * @param {string} altText - Alt text
   * @param {Array} variantIds - Variant IDs this image is associated with
   */
  async linkImage(productId, imageId, shopifyImageId, position = 0, altText = null, variantIds = []) {
    const linkId = uuidv4();
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_product_images (
        id, product_id, image_id, shopify_image_id,
        position, alt_text, variant_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      linkId,
      productId,
      imageId,
      shopifyImageId,
      position,
      altText,
      JSON.stringify(variantIds)
    ]);
  }
  
  /**
   * Get images for a product
   * @param {string} productId - Product ID
   * @returns {Promise<Array>} Images with metadata
   */
  async getProductImages(productId) {
    const [images] = await db.query(`
      SELECT 
        pi.id as link_id,
        pi.position,
        pi.alt_text,
        pi.shopify_image_id,
        pi.variant_ids,
        i.id as image_id,
        i.kb_id,
        i.filename,
        i.image_type as content_type,
        i.width,
        i.height,
        i.file_size_bytes,
        i.description,
        i.metadata
      FROM yovo_tbl_aiva_product_images pi
      JOIN yovo_tbl_aiva_images i ON pi.image_id = i.id
      WHERE pi.product_id = ?
      ORDER BY pi.position
    `, [productId]);
    
    return images.map(img => {
      if (img.variant_ids && typeof img.variant_ids === 'string') {
        img.variant_ids = JSON.parse(img.variant_ids);
      }
      if (img.metadata && typeof img.metadata === 'string') {
        img.metadata = JSON.parse(img.metadata);
      }
	  
      // Add API URL for viewing the image
      img.url = `${process.env.STORAGE_PATH_PREFIX}/api/knowledge/${img.kb_id}/images/${img.image_id}/view`;
      img.thumbnail_url = img.url; // Same endpoint for now
      return img;
    });
  }
  
  /**
   * Update product review stats
   * @param {string} productId - Product ID
   */
  async updateReviewStats(productId) {
    const [stats] = await db.query(`
      SELECT 
        COUNT(*) as review_count,
        AVG(rating) as average_rating
      FROM yovo_tbl_aiva_product_reviews
      WHERE product_id = ?
    `, [productId]);
    
    if (stats.length > 0) {
      await db.query(`
        UPDATE yovo_tbl_aiva_products
        SET 
          review_count = ?,
          average_rating = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [
        stats[0].review_count,
        stats[0].average_rating ? parseFloat(stats[0].average_rating).toFixed(1) : null,
        productId
      ]);
    }
  }
  
  /**
	 * List products for a knowledge base with pagination and advanced filters
	 * @param {string} kbId - Knowledge base ID
	 * @param {Object} filters - Filter options
	 * @returns {Promise<Object>} Products and pagination info
	 */
	async listProducts(kbId, filters = {}) {
	  // Extract pagination params
	  const page = parseInt(filters.page) || 1;
	  const limit = parseInt(filters.limit) || 20;
	  const offset = (page - 1) * limit;

	  // Build base query
	  let query = `
		SELECT 
		  p.*,
		  s.shop_domain,
		  (
			SELECT pi.image_id
			FROM yovo_tbl_aiva_product_images pi
			WHERE pi.product_id = p.id
			ORDER BY pi.position ASC
			LIMIT 1
		  ) as primary_image_id
		FROM yovo_tbl_aiva_products p
		LEFT JOIN yovo_tbl_aiva_shopify_stores s ON p.shopify_store_id = s.id
		WHERE p.kb_id = ?
	  `;
	  const params = [kbId];

	  // Status filter
	  if (filters.status && filters.status !== 'all') {
		query += ' AND p.status = ?';
		params.push(filters.status);
	  }

	  // Vendor filter
	  if (filters.vendor && filters.vendor !== 'all') {
		query += ' AND p.vendor = ?';
		params.push(filters.vendor);
	  }

	  // Product type filter
	  if (filters.product_type && filters.product_type !== 'all') {
		query += ' AND p.product_type = ?';
		params.push(filters.product_type);
	  }

	  // Price range filters
	  if (filters.min_price) {
		query += ' AND p.price >= ?';
		params.push(parseFloat(filters.min_price));
	  }

	  if (filters.max_price) {
		query += ' AND p.price <= ?';
		params.push(parseFloat(filters.max_price));
	  }

	  // Search filter (across multiple fields)
	  if (filters.search) {
		query += ' AND (p.title LIKE ? OR p.description LIKE ? OR p.vendor LIKE ? OR p.product_type LIKE ?)';
		const searchPattern = `%${filters.search}%`;
		params.push(searchPattern, searchPattern, searchPattern, searchPattern);
	  }

	  // Get total count before pagination
	  const countQuery = query.replace(
		/SELECT .+ FROM/,
		'SELECT COUNT(DISTINCT p.id) as total FROM'
	  ).replace(/ORDER BY.+/, '');
	  
	  console.log('countQuery', countQuery)
	  const [countResult] = await db.query(countQuery, params);
	  const totalProducts = countResult[0].total || 0;
	  const totalPages = Math.ceil(totalProducts / limit);

	  // Sorting
	  const sortBy = filters.sort_by || 'created_at';
	  const sortOrder = filters.sort_order || 'DESC';
	  
	  // Validate sort fields to prevent SQL injection
	  const allowedSortFields = ['created_at', 'title', 'price', 'total_inventory', 'vendor', 'product_type'];
	  const allowedSortOrders = ['ASC', 'DESC'];
	  
	  const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
	  const safeSortOrder = allowedSortOrders.includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : 'DESC';
	  
	  query += ` ORDER BY p.${safeSortBy} ${safeSortOrder}`;

	  // Pagination
	  query += ' LIMIT ? OFFSET ?';
	  params.push(limit, offset);

	  const [products] = await db.query(query, params);

	  const formattedProducts = products.map(p => {
		if (p.tags && typeof p.tags === 'string') {
		  p.tags = JSON.parse(p.tags);
		}
		if (p.shopify_metadata && typeof p.shopify_metadata === 'string') {
		  p.shopify_metadata = JSON.parse(p.shopify_metadata);
		}
		// Convert image_id to API URL
		if (p.primary_image_id) {
		  p.image_url = `${process.env.STORAGE_PATH_PREFIX}/api/knowledge/${p.kb_id}/images/${p.primary_image_id}/view`;
		}
		delete p.primary_image_id; // Remove internal field
		return p;
	  });

	  return {
		products: formattedProducts,
		pagination: {
		  page,
		  limit,
		  total: totalProducts,
		  total_pages: totalPages,
		  has_next: page < totalPages,
		  has_prev: page > 1
		}
	  };
	}

	/**
	 * Get unique vendors for a knowledge base
	 * @param {string} kbId - Knowledge base ID
	 * @returns {Promise<Array>} Vendors
	 */
	async getVendors(kbId) {
	  const [vendors] = await db.query(`
		SELECT DISTINCT vendor
		FROM yovo_tbl_aiva_products
		WHERE kb_id = ? AND vendor IS NOT NULL
		ORDER BY vendor ASC
	  `, [kbId]);
	  
	  return vendors.map(v => v.vendor);
	}

	/**
	 * Get unique product types for a knowledge base
	 * @param {string} kbId - Knowledge base ID
	 * @returns {Promise<Array>} Product types
	 */
	async getProductTypes(kbId) {
	  const [types] = await db.query(`
		SELECT DISTINCT product_type
		FROM yovo_tbl_aiva_products
		WHERE kb_id = ? AND product_type IS NOT NULL
		ORDER BY product_type ASC
	  `, [kbId]);
	  
	  return types.map(t => t.product_type);
	}
  
  /**
   * Delete product
   * @param {string} productId - Product ID
   */
  async deleteProduct(productId) {
    await db.query('DELETE FROM yovo_tbl_aiva_products WHERE id = ?', [productId]);
  }
  
  /**
   * Clean HTML from description
   * @private
   */
  _cleanHtml(html) {
    if (!html) return '';
    
    // Remove HTML tags
    let text = html.replace(/<[^>]*>/g, ' ');
    
    // Replace HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }
}

module.exports = new ProductService();