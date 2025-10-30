/**
 * Knowledge Service
 * Manages knowledge bases, documents, and integrates with Python service
 */
require('dotenv').config();

const db = require('../config/database');
const redisClient = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const PythonServiceClient = require('./PythonServiceClient');
const CostCalculator = require('../utils/cost-calculator');
const CreditService = require('./CreditService');
const fs = require('fs').promises;
const path = require('path');

class KnowledgeService {
  constructor() {
    this.storageBasePath = process.env.STORAGE_PATH || '/etc/aiva-oai/storage';
  }

  /**
   * Create knowledge base
   * @param {string} tenantId - Tenant ID
   * @param {Object} kbData - KB data
   * @returns {Promise<Object>} Created KB
   */
  async createKnowledgeBase(tenantId, kbData) {
    const kbId = uuidv4();
    
    const settings = {
      embedding_model: kbData.embedding_model || process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      chunk_size: kbData.chunk_size || parseInt(process.env.DEFAULT_CHUNK_SIZE) || 500,
      chunk_overlap: kbData.chunk_overlap || parseInt(process.env.DEFAULT_CHUNK_OVERLAP) || 50,
      enable_image_search: kbData.enable_image_search !== undefined 
        ? kbData.enable_image_search 
        : (process.env.ENABLE_IMAGE_SEARCH === 'true')
    };

    const stats = {
      document_count: 0,
      chunk_count: 0,
      image_count: 0,
      total_size_mb: 0
    };

    await db.query(
      `INSERT INTO yovo_tbl_aiva_knowledge_bases (
        id, tenant_id, name, description, type, status, settings, stats
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        kbId,
        tenantId,
        kbData.name,
        kbData.description || null,
        kbData.type || 'general',
        JSON.stringify(settings),
        JSON.stringify(stats)
      ]
    );

    return this.getKnowledgeBase(kbId);
  }

  /**
   * Get knowledge base
   * @param {string} kbId - KB ID
   * @returns {Promise<Object|null>} KB or null
   */
  async getKnowledgeBase(kbId) {
    const [kbs] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_knowledge_bases WHERE id = ?',
      [kbId]
    );

    if (kbs.length === 0) {
      return null;
    }

    const kb = kbs[0];
    
    return {
      ...kb,
      settings: typeof kb.settings === 'string' ? JSON.parse(kb.settings) : kb.settings,
      stats: typeof kb.stats === 'string' ? JSON.parse(kb.stats) : kb.stats
    };
  }

  /**
   * List knowledge bases for tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} filters - Filters
   * @returns {Promise<Array>} KBs
   */
  async listKnowledgeBases(tenantId, filters = {}) {
    let query = 'SELECT * FROM yovo_tbl_aiva_knowledge_bases WHERE tenant_id = ?';
    const params = [tenantId];

    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY created_at DESC';

    const [kbs] = await db.query(query, params);

    return kbs.map(kb => ({
      ...kb,
      settings: typeof kb.settings === 'string' ? JSON.parse(kb.settings) : kb.settings,
      stats: typeof kb.stats === 'string' ? JSON.parse(kb.stats) : kb.stats
    }));
  }

  /**
   * Update knowledge base
   * @param {string} kbId - KB ID
   * @param {Object} updates - Updates
   * @returns {Promise<Object>} Updated KB
   */
  async updateKnowledgeBase(kbId, updates) {
    const fields = [];
    const values = [];

    const allowedFields = ['name', 'description', 'type', 'status'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    // Handle settings update
    if (updates.settings) {
      const currentKB = await this.getKnowledgeBase(kbId);
      const newSettings = { ...currentKB.settings, ...updates.settings };
      fields.push('settings = ?');
      values.push(JSON.stringify(newSettings));
    }

    if (fields.length === 0) {
      return this.getKnowledgeBase(kbId);
    }

    values.push(kbId);

    await db.query(
      `UPDATE yovo_tbl_aiva_knowledge_bases SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    return this.getKnowledgeBase(kbId);
  }

  /**
   * Delete knowledge base
   * @param {string} kbId - KB ID
   * @returns {Promise<void>}
   */
  async deleteKnowledgeBase(kbId) {
    // Get all documents
    const [documents] = await db.query(
      'SELECT id, storage_url FROM yovo_tbl_aiva_documents WHERE kb_id = ?',
      [kbId]
    );

    // Delete files from storage
    for (const doc of documents) {
      try {
        await fs.unlink(process.env.APP_BASE_URL + doc.storage_url);
      } catch (error) {
        console.error(`Failed to delete file ${doc.storage_url}:`, error);
      }
    }

    // Delete KB (cascade will handle related records)
    await db.query('DELETE FROM yovo_tbl_aiva_knowledge_bases WHERE id = ?', [kbId]);
  }

  /**
   * Upload document
   * @param {Object} params - Upload parameters
   * @returns {Promise<Object>} Upload result with cost
   */
  async uploadDocument({ kbId, tenantId, file, originalFilename, uploadedBy, metadata = {} }) {
    const documentId = uuidv4();
    const fileExtension = path.extname(originalFilename);
    const filename = `${documentId}${fileExtension}`;
    const storagePath = path.join(this.storageBasePath, 'documents', filename);

    // Ensure directory exists
    await fs.mkdir(path.dirname(storagePath), { recursive: true });

    // Save file
    await fs.writeFile(storagePath, file.buffer);

    // Get file stats
    const fileStats = await fs.stat(storagePath);
    const fileSizeBytes = fileStats.size;

    // Create document record
    await db.query(
      `INSERT INTO yovo_tbl_aiva_documents (
        id, kb_id, tenant_id, filename, original_filename,
        file_type, file_size_bytes, storage_url, status,
        metadata, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, ?)`,
      [
        documentId,
        kbId,
        tenantId,
        filename,
        originalFilename,
        file.mimetype,
        fileSizeBytes,
        storagePath,
        JSON.stringify(metadata),
        uploadedBy
      ]
    );

    // Process document with Python service (async)
    this._processDocumentAsync(documentId, kbId, tenantId, storagePath, originalFilename, fileSizeBytes);

    return {
      document_id: documentId,
      status: 'processing',
      message: 'Document uploaded and processing started'
    };
  }

  /**
   * Process document asynchronously
   * @private
   */
  async _processDocumentAsync(documentId, kbId, tenantId, filePath, filename, fileSizeBytes) {
    try {
      // Read file
      const fileBuffer = await fs.readFile(filePath);

      // Send to Python service for processing
      const result = await PythonServiceClient.uploadDocument({
        kb_id: kbId,
        tenant_id: tenantId,
        file: fileBuffer,
        filename: filename,
        file_type: path.extname(filename).substring(1),
        metadata: {}
      });

      // Calculate processing cost
      const costBreakdown = CostCalculator.calculateKnowledgeOperationCost({
        pages_processed: result.processing_results?.total_pages || 0,
        embedding_tokens: result.embeddings?.total_tokens_embedded || 0,
        images_processed: result.processing_results?.extracted_images || 0,
        file_size_bytes: fileSizeBytes,
        embedding_model: result.embeddings?.embedding_model
      });

      // Update document status
      await db.query(
        `UPDATE yovo_tbl_aiva_documents 
         SET status = 'completed', 
             processing_stats = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          JSON.stringify(result.processing_results),
          documentId
        ]
      );

      // Update KB stats
      await this._updateKBStats(kbId);

      // Store cost for later deduction
      await redisClient.setEx(
        `doc_cost:${documentId}`,
        86400, // 24 hours
        JSON.stringify(costBreakdown)
      );

      console.log(`Document ${documentId} processed successfully`);

    } catch (error) {
      console.error(`Document processing failed for ${documentId}:`, error);

      // Update document status to failed
      await db.query(
        `UPDATE yovo_tbl_aiva_documents 
         SET status = 'failed', 
             error_message = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [error.message, documentId]
      );
    }
  }

  /**
   * Get document
   * @param {string} documentId - Document ID
   * @returns {Promise<Object|null>} Document or null
   */
  async getDocument(documentId) {
    const [docs] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_documents WHERE id = ?',
      [documentId]
    );

    if (docs.length === 0) {
      return null;
    }

    const doc = docs[0];

    return {
      ...doc,
      processing_stats: doc.processing_stats 
        ? (typeof doc.processing_stats === 'string' ? JSON.parse(doc.processing_stats) : doc.processing_stats)
        : null,
      metadata: doc.metadata 
        ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata)
        : null
    };
  }

  /**
   * List documents in KB
   * @param {string} kbId - KB ID
   * @param {Object} pagination - Pagination params
   * @returns {Promise<Object>} Documents and total
   */
  async listDocuments(kbId, { page = 1, limit = 20, status = null }) {
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM yovo_tbl_aiva_documents WHERE kb_id = ?';
    const params = [kbId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [docs] = await db.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM yovo_tbl_aiva_documents WHERE kb_id = ?';
    const countParams = [kbId];

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const [countResult] = await db.query(countQuery, countParams);
    const total = countResult[0].total;

    return {
      documents: docs.map(doc => ({
        ...doc,
        processing_stats: doc.processing_stats 
          ? doc.processing_stats
          : null,
        metadata: doc.metadata 
          ? doc.metadata
          : null
      })),
      total
    };
  }

  /**
   * Delete document
   * @param {string} documentId - Document ID
   * @returns {Promise<void>}
   */
  async deleteDocument(documentId) {
    // Get document info
    const doc = await this.getDocument(documentId);
    if (!doc) {
      throw new Error('Document not found');
    }

    // Delete file from storage
    try {
      await fs.unlink(process.env.APP_BASE_URL + doc.storage_url);
    } catch (error) {
      console.error(`Failed to delete file ${doc.storage_url}:`, error);
    }

    // Delete from Python service (vectors, chunks)
    try {
      await PythonServiceClient.deleteDocument(documentId);
    } catch (error) {
      console.error(`Failed to delete from Python service:`, error);
    }

    // Delete from database
    await db.query('DELETE FROM yovo_tbl_aiva_documents WHERE id = ?', [documentId]);

    // Update KB stats
    await this._updateKBStats(doc.kb_id);
  }

  /**
   * Search knowledge base
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results with cost
   */
  async search({ kbId, query, image = null, topK = 5, searchType = 'hybrid', filters = {} }) {
    // Call Python service
    const results = await PythonServiceClient.search({
      kb_id: kbId,
      query,
      image,
      top_k: topK,
      search_type: searchType,
      filters
    });
	  
    // Calculate search cost
    const costBreakdown = {
      base_cost: 0.0005, // Base search cost
      profit_amount: 0,
      final_cost: 0,
      operations: [
        {
          operation: 'knowledge_search',
          quantity: 1,
          unit_cost: 0.0005,
          total_cost: 0.0005,
          details: {
            query_length: query.length,
            results_returned: results.results?.total_found || 0,
            search_type: searchType
          }
        }
      ]
    };

    // Add embedding cost if query was embedded
    if (results.metrics?.query_tokens) {
      const embeddingCost = CostCalculator.calculateEmbeddingCost(
        results.metrics.query_tokens,
        results.metrics.embedding_model || 'text-embedding-3-small'
      );
      costBreakdown.operations.push(...embeddingCost.operations);
    }

    // Calculate totals
    const totalBaseCost = costBreakdown.operations.reduce((sum, op) => sum + op.total_cost, 0);
    const profitMargin = parseFloat(process.env.PROFIT_MARGIN_PERCENT || 20) / 100;
    const profitAmount = totalBaseCost * profitMargin;
    const finalCost = totalBaseCost + profitAmount;

    costBreakdown.base_cost = totalBaseCost;
    costBreakdown.profit_amount = profitAmount;
    costBreakdown.final_cost = finalCost;

    // Log search
    await this._logSearch(kbId, query, searchType, results, finalCost);

    return {
      results: results.results,
      cost: finalCost,
      cost_breakdown: costBreakdown
    };
  }

  /**
   * Update KB statistics
   * @private
   * @param {string} kbId - KB ID
   */
  async _updateKBStats(kbId) {
    // Count documents
    const [docCount] = await db.query(
      'SELECT COUNT(*) as count FROM yovo_tbl_aiva_documents WHERE kb_id = ? AND status = "completed"',
      [kbId]
    );

    // Count chunks
    const [chunkCount] = await db.query(
      'SELECT COUNT(*) as count FROM yovo_tbl_aiva_document_chunks WHERE kb_id = ?',
      [kbId]
    );

    // Count images
    const [imageCount] = await db.query(
      'SELECT COUNT(*) as count FROM yovo_tbl_aiva_images WHERE kb_id = ?',
      [kbId]
    );

	 const [productCount] = await db.query(
		'SELECT COUNT(*) as count FROM yovo_tbl_aiva_products WHERE kb_id = ? AND status = "active"',
		[kbId]
	);
	  
    // Calculate total size
    const [sizeResult] = await db.query(
      'SELECT SUM(file_size_bytes) as total_bytes FROM yovo_tbl_aiva_documents WHERE kb_id = ?',
      [kbId]
    );

    const totalSizeMB = (sizeResult[0].total_bytes || 0) / (1024 * 1024);

    const stats = {
      document_count: docCount[0].count,
      chunk_count: chunkCount[0].count,
      image_count: imageCount[0].count,
	  product_count: productCount[0].count,
      total_size_mb: parseFloat(totalSizeMB.toFixed(2))
    };

    await db.query(
      'UPDATE yovo_tbl_aiva_knowledge_bases SET stats = ? WHERE id = ?',
      [JSON.stringify(stats), kbId]
    );
  }

  /**
   * Log search for analytics
   * @private
   */
  async _logSearch(kbId, query, searchType, results, cost) {
    const searchId = uuidv4();

    try {
      await db.query(
        `INSERT INTO yovo_tbl_aiva_knowledge_searches (
          id, kb_id, tenant_id, query, search_type,
          results_count, top_result_score, processing_time_ms, cost
        ) 
        SELECT ?, ?, tenant_id, ?, ?, ?, ?, ?, ?
        FROM yovo_tbl_aiva_knowledge_bases
        WHERE id = ?`,
        [
          searchId,
          kbId,
          query,
          searchType,
          results.results?.total_found || 0,
          results.results?.text_results?.[0]?.score || 0,
          results.metrics?.processing_time_ms || 0,
          cost,
          kbId
        ]
      );
    } catch (error) {
      console.error('Failed to log search:', error);
    }
  }

  /**
   * Get KB statistics and analytics
   * @param {string} kbId - KB ID
   * @param {number} days - Days to look back
   * @returns {Promise<Object>} Statistics
   */
  async getKBAnalytics(kbId, days = 30) {
    // Get current stats
    const kb = await this.getKnowledgeBase(kbId);

    // Get search stats
    const [searchStats] = await db.query(
      `SELECT 
        COUNT(*) as total_searches,
        AVG(top_result_score) as avg_score,
        AVG(processing_time_ms) as avg_processing_time,
        SUM(cost) as total_cost
      FROM yovo_tbl_aiva_knowledge_searches
      WHERE kb_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [kbId, days]
    );

    // Get top queries
    const [topQueries] = await db.query(
      `SELECT query, COUNT(*) as count
      FROM yovo_tbl_aiva_knowledge_searches
      WHERE kb_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      GROUP BY query
      ORDER BY count DESC
      LIMIT 10`,
      [kbId, days]
    );

    return {
      kb_stats: kb.stats,
      search_stats: {
        total_searches: searchStats[0].total_searches || 0,
        avg_score: parseFloat(searchStats[0].avg_score || 0).toFixed(4),
        avg_processing_time_ms: parseInt(searchStats[0].avg_processing_time || 0),
        total_cost: parseFloat(searchStats[0].total_cost || 0).toFixed(6)
      },
      top_queries: topQueries,
      period_days: days
    };
  }
  
  async getKBStats(kbId) {
    // Get document count
    const [docCount] = await db.query(
      'SELECT COUNT(*) as total FROM yovo_tbl_aiva_documents WHERE kb_id = ?',
      [kbId]
    );
  
    // Get chunk count
    const [chunkCount] = await db.query(
      'SELECT COUNT(*) as total FROM yovo_tbl_aiva_document_chunks WHERE kb_id = ?',
      [kbId]
    );
  
    // Get total size
    const [sizeData] = await db.query(
      'SELECT SUM(file_size_bytes) as total_bytes FROM yovo_tbl_aiva_documents WHERE kb_id = ?',
      [kbId]
    );
  
	const [imageCount] = await db.query(
		'SELECT COUNT(*) as total FROM yovo_tbl_aiva_images WHERE kb_id = ?',
		[kbId]
	);

	// ✅ NEW: Get product count
	const [productCount] = await db.query(
		'SELECT COUNT(*) as total FROM yovo_tbl_aiva_products WHERE kb_id = ? AND status = "active"',
		[kbId]
	);
	  
    // Get KB settings
    const kb = await this.getKnowledgeBase(kbId);
  
    return {
      kb_id: kbId,
      total_documents: docCount[0]?.total || 0,
      total_chunks: chunkCount[0]?.total || 0,
	  total_image_count: imageCount[0].total || 0,
	  total_product_count: productCount[0].total || 0,
      total_size_bytes: sizeData[0]?.total_bytes || 0,
      embedding_model: kb?.settings?.embedding_model || 'text-embedding-3-small',
      vector_dimension: 1536,
      total_vectors: chunkCount[0]?.total || 0 // Same as chunks
    };
  }
  
  /**
   * Upload image to knowledge base
   * @param {Object} params - Upload parameters
   * @returns {Promise<Object>} Upload result with cost
   */
  async uploadImage({ kbId, tenantId, file, metadata = {} }) {
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Add file
      formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
      });
      
      // Add required fields
      formData.append('kb_id', kbId);
      formData.append('tenant_id', tenantId);
      
      // Add metadata
      if (Object.keys(metadata).length > 0) {
        formData.append('metadata', JSON.stringify(metadata));
      }

      // Upload to Python service
      const result = await PythonServiceClient.uploadImage(formData);
      
      // Deduct credits
      if (result.cost && result.cost > 0) {
        try {
		  //tenantId, amount, operationType, operationDetails, referenceId
          await CreditService.deductCredits(
            tenantId,
            result.cost,
            'image_processing',
            {
              image_id: result.image_id,
              filename: file.originalname,
              kb_id: kbId,
              processing_time_ms: result.processing_time_ms,
              embedding_dimension: result.embedding_dimension
            },
			result.image_id
          );
        } catch (creditError) {
          console.error('Error deducting credits for image upload:', creditError);
          // Don't fail the upload if credit deduction fails
        }
      }

      return result;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  /**
   * Search images in knowledge base
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchImages({ kbId, tenantId, query, imageBase64 = null, searchType = 'text', topK = 5, filters = {} }) {
    try {
      const result = await PythonServiceClient.searchImages({
        kb_id: kbId,
        query,
        image_base64: imageBase64,
        search_type: searchType,
        top_k: topK,
        filters
      });

      // Deduct credits for search
      if (result.cost && result.cost > 0) {
        try {
          await CreditService.deductCredits(
            tenantId,
            result.cost,
            'image_search',
            {
              query,
              search_type: searchType,
              results_count: result.returned,
              kb_id: kbId
            },
            `search-${Date.now()}`
          );
        } catch (creditError) {
          console.error('Error deducting credits for image search:', creditError);
          // Don't fail the search if credit deduction fails
        }
      }

      return result;
    } catch (error) {
      console.error('Error searching images:', error);
      throw error;
    }
  }

  /**
   * Get image statistics for knowledge base
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Object>} Statistics
   */
  async getImageStats(kbId) {
    try {
      return await PythonServiceClient.getImageStats(kbId);
    } catch (error) {
      console.error('Error getting image stats:', error);
      throw error;
    }
  }

  /**
   * List images in knowledge base
   * @param {string} kbId - Knowledge base ID
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<Object>} Images list
   */
  async listImages(kbId, page = 1, limit = 20) {
    try {
      return await PythonServiceClient.listImages(kbId, page, limit);
    } catch (error) {
      console.error('Error listing images:', error);
      throw error;
    }
  }

  /**
   * Delete image from knowledge base
   * @param {string} kbId - Knowledge base ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteImage(kbId, imageId) {
    try {
      return await PythonServiceClient.deleteImage(imageId, kbId);
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Get image file for viewing
   * @param {string} kbId - Knowledge base ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Object>} Image data
   */
  async getImageFile(kbId, imageId) {
    try {
      return await PythonServiceClient.getImageFile(kbId, imageId);
    } catch (error) {
      console.error('Error getting image file:', error);
      throw error;
    }
  }
}
 
module.exports = new KnowledgeService();