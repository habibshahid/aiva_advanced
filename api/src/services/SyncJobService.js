/**
 * Sync Job Service
 * Manages sync job lifecycle and status tracking
 */

const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class SyncJobService {
  
  /**
   * Create a new sync job
   * @param {Object} params - Job parameters
   * @returns {Promise<Object>} Created job
   */
  async createJob(params) {
    const {
      store_id,
      kb_id,
      tenant_id,
      job_type = 'full_sync',
      metadata = {}
    } = params;
    
    const jobId = uuidv4();
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_sync_jobs (
        id, store_id, kb_id, tenant_id, job_type, 
        status, metadata
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `, [
      jobId,
      store_id,
      kb_id,
      tenant_id,
      job_type,
      JSON.stringify(metadata)
    ]);
    
    return this.getJob(jobId);
  }
  
  /**
   * Get job by ID
   * @param {string} jobId - Job ID
   * @returns {Promise<Object|null>} Job or null
   */
  async getJob(jobId) {
    const [jobs] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_sync_jobs WHERE id = ?',
      [jobId]
    );
    
    if (jobs.length === 0) {
      return null;
    }
    
    const job = jobs[0];
    
    // Parse JSON fields
    if (job.metadata && typeof job.metadata === 'string') {
      job.metadata = JSON.parse(job.metadata);
    }
    if (job.error_details && typeof job.error_details === 'string') {
      job.error_details = JSON.parse(job.error_details);
    }
    
    return job;
  }
  
  /**
   * Get active job for a store
   * @param {string} storeId - Store ID
   * @returns {Promise<Object|null>} Active job or null
   */
  async getActiveJob(storeId) {
    const [jobs] = await db.query(`
      SELECT * FROM yovo_tbl_aiva_sync_jobs 
      WHERE store_id = ? 
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `, [storeId]);
    
    if (jobs.length === 0) {
      return null;
    }
    
    return this.getJob(jobs[0].id);
  }
  
  /**
   * Update job status
   * @param {string} jobId - Job ID
   * @param {string} status - New status
   * @param {Object} extra - Extra fields to update
   */
  async updateStatus(jobId, status, extra = {}) {
    const updates = [];
    const values = [];
    
    updates.push('status = ?');
    values.push(status);
    
    if (status === 'processing' && !extra.started_at) {
      updates.push('started_at = NOW()');
    }
    
    if (status === 'completed' && !extra.completed_at) {
      updates.push('completed_at = NOW()');
    }
    
    // Add any extra fields
    Object.keys(extra).forEach(key => {
      updates.push(`${key} = ?`);
      
      const value = extra[key];
      
      // Handle Date objects - convert to MySQL datetime format
      if (value instanceof Date) {
        values.push(value.toISOString().slice(0, 19).replace('T', ' '));
      }
      // Handle other objects - JSON stringify
      else if (typeof value === 'object' && value !== null) {
        values.push(JSON.stringify(value));
      }
      // Handle primitives
      else {
        values.push(value);
      }
    });
    
    values.push(jobId);
    
    await db.query(`
      UPDATE yovo_tbl_aiva_sync_jobs 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ?
    `, values);
  }
  
  /**
   * Update job progress
   * @param {string} jobId - Job ID
   * @param {Object} progress - Progress data
   */
  // FIND the updateProgress method and UPDATE it:

	async updateProgress(jobId, progress) {
	  const updates = [];
	  const values = [];
	  
	  const fields = [
		'total_products',
		'processed_products',
		'failed_products',
		'total_images',
		'processed_images',
		'failed_images',
		'products_added',
		'products_updated',
		'products_deleted'
	  ];
	  
	  fields.forEach(field => {
		if (progress[field] !== undefined) {
		  updates.push(`${field} = ?`);
		  values.push(progress[field]);
		}
	  });
	  
	  if (updates.length === 0) {
		return;
	  }
	  
	  // Calculate estimated completion if we have progress
	  if (progress.processed_products !== undefined && progress.total_products) {
		const job = await this.getJob(jobId);
		
		if (job && job.started_at && progress.processed_products > 0) {
		  const elapsed = Date.now() - new Date(job.started_at).getTime();
		  const avgTimePerProduct = elapsed / progress.processed_products;
		  const remaining = progress.total_products - progress.processed_products;
		  const estimatedMs = remaining * avgTimePerProduct;
		  const estimatedCompletion = new Date(Date.now() + estimatedMs);
		  
		  // ✅ ADD THIS - Save estimated_completion_at to database
		  updates.push('estimated_completion_at = ?');
		  values.push(estimatedCompletion.toISOString().slice(0, 19).replace('T', ' '));
		}
	  }
	  
	  values.push(jobId);
	  
	  await db.query(`
		UPDATE yovo_tbl_aiva_sync_jobs 
		SET ${updates.join(', ')}, updated_at = NOW()
		WHERE id = ?
	  `, values);
	}
  
  /**
   * Increment processed count
   * @param {string} jobId - Job ID
   * @param {string} type - 'products' or 'images'
   */
  async incrementProcessed(jobId, type) {
    const field = type === 'products' ? 'processed_products' : 'processed_images';
    
    await db.query(`
      UPDATE yovo_tbl_aiva_sync_jobs 
      SET ${field} = ${field} + 1, updated_at = NOW()
      WHERE id = ?
    `, [jobId]);
  }
  
  /**
   * Increment failed count
   * @param {string} jobId - Job ID
   * @param {string} type - 'products' or 'images'
   */
  async incrementFailed(jobId, type) {
    const field = type === 'products' ? 'failed_products' : 'failed_images';
    
    await db.query(`
      UPDATE yovo_tbl_aiva_sync_jobs 
      SET ${field} = ${field} + 1, updated_at = NOW()
      WHERE id = ?
    `, [jobId]);
  }
  
  /**
   * Mark job as completed
   * @param {string} jobId - Job ID
   */
  async complete(jobId) {
    await this.updateStatus(jobId, 'completed', {
      completed_at: new Date()
    });
  }
  
  /**
   * Mark job as failed
   * @param {string} jobId - Job ID
   * @param {string} errorMessage - Error message
   * @param {Object} errorDetails - Detailed error info
   */
  async fail(jobId, errorMessage, errorDetails = {}) {
    await this.updateStatus(jobId, 'failed', {
      error_message: errorMessage,
      error_details: errorDetails,
      completed_at: new Date()
    });
  }
  
  /**
   * Cancel job
   * @param {string} jobId - Job ID
   */
  async cancel(jobId) {
    await this.updateStatus(jobId, 'cancelled', {
      completed_at: new Date()
    });
  }
  
  /**
   * Get jobs for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Array>} Jobs
   */
  async getJobs(tenantId, filters = {}) {
    let query = 'SELECT * FROM yovo_tbl_aiva_sync_jobs WHERE tenant_id = ?';
    const params = [tenantId];
    
    if (filters.store_id) {
      query += ' AND store_id = ?';
      params.push(filters.store_id);
    }
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.job_type) {
      query += ' AND job_type = ?';
      params.push(filters.job_type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(filters.limit || 50);
    
    const [jobs] = await db.query(query, params);
    
    // Parse JSON fields
    return jobs.map(job => {
      if (job.metadata && typeof job.metadata === 'string') {
        job.metadata = JSON.parse(job.metadata);
      }
      if (job.error_details && typeof job.error_details === 'string') {
        job.error_details = JSON.parse(job.error_details);
      }
      return job;
    });
  }
  
  /**
   * Create product sync status
   * @param {Object} params - Status parameters
   */
  async createProductStatus(params) {
    const {
      job_id,
      product_id = null,
      shopify_product_id,
      images_total = 0
    } = params;
    
    const statusId = uuidv4();
    
    await db.query(`
      INSERT INTO yovo_tbl_aiva_product_sync_status (
        id, job_id, product_id, shopify_product_id, 
        status, images_total
      ) VALUES (?, ?, ?, ?, 'processing', ?)
    `, [
      statusId,
      job_id,
      product_id,
      shopify_product_id,
      images_total
    ]);
    
    return statusId;
  }
  
  /**
   * Update product sync status
   * @param {string} statusId - Status ID
   * @param {Object} updates - Updates
   */
  async updateProductStatus(statusId, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      fields.push(`${key} = ?`);
      
      const value = updates[key];
      
      // Handle Date objects - convert to MySQL datetime format
      if (value instanceof Date) {
        values.push(value.toISOString().slice(0, 19).replace('T', ' '));
      }
      // Handle other values
      else {
        values.push(value);
      }
    });
    
    if (fields.length === 0) {
      return;
    }
    
    values.push(statusId);
    
    await db.query(`
      UPDATE yovo_tbl_aiva_product_sync_status 
      SET ${fields.join(', ')}
      WHERE id = ?
    `, values);
  }
  
  /**
   * Get product statuses for a job
   * @param {string} jobId - Job ID
   * @returns {Promise<Array>} Product statuses
   */
  async getProductStatuses(jobId) {
    const [statuses] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_product_sync_status WHERE job_id = ? ORDER BY created_at',
      [jobId]
    );
    
    return statuses;
  }
}

module.exports = new SyncJobService();