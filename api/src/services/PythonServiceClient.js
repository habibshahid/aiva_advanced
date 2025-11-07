/**
 * Python Service Client
 * HTTP client for communicating with the Python knowledge processing service
 */

const axios = require('axios');
const logger = require('../utils/logger');
require('dotenv').config();

class PythonServiceClient {
  constructor() {
    this.baseUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:62002';
    this.apiKey = process.env.PYTHON_SERVICE_API_KEY;
    this.timeout = parseInt(process.env.PYTHON_SERVICE_TIMEOUT_MS) || 120000; // 60 seconds default
    
    // Create axios instance with defaults
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      }
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`Python Service Request: ${config.method.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Python Service Request Error:', error);
        return Promise.reject(error);
      }
    );


    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`Python Service Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
		  console.log(error)
        if (error.response) {
          logger.error(`Python Service Error: ${error.response.status} ${error.response.data?.error || error.message}`);
        } else if (error.request) {
          logger.error('Python Service Error: No response received');
        } else {
          logger.error('Python Service Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw new Error(`Python service health check failed: ${error.message}`);
    }
  }

  /**
   * Upload and process document
   * @param {Object} params - Upload parameters
   * @param {string} params.kb_id - Knowledge base ID
   * @param {string} params.tenant_id - Tenant ID
   * @param {Buffer} params.file - File buffer
   * @param {string} params.filename - Original filename
   * @param {string} params.file_type - File MIME type
   * @param {Object} params.metadata - Additional metadata
   * @returns {Promise<Object>} Processing result
   */
  async uploadDocument({ kb_id, tenant_id, file, filename, file_type, metadata = {} }) {
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('kb_id', kb_id);
      formData.append('tenant_id', tenant_id);
      formData.append('file', file, filename);
      formData.append('metadata', JSON.stringify(metadata));

      const response = await this.client.post('/api/v1/documents/upload', formData, {
        headers: {
          ...formData.getHeaders()
        },
        timeout: 300000 // 5 minutes for large files
      });

      return response.data;
    } catch (error) {
      throw new Error(`Document upload failed: ${error.message}`);
    }
  }

  /**
   * Get document processing status
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} Document status
   */
  async getDocumentStatus(documentId) {
    try {
      const response = await this.client.get(`/api/v1/documents/${documentId}/status`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get document status: ${error.message}`);
    }
  }

  /**
   * Search knowledge base
   * @param {Object} params - Search parameters
   * @param {string} params.kb_id - Knowledge base ID
   * @param {string} params.query - Search query
   * @param {string} params.image - Base64 image (optional)
   * @param {number} params.top_k - Number of results
   * @param {string} params.search_type - 'text', 'image', or 'hybrid'
   * @param {Object} params.filters - Additional filters
   * @returns {Promise<Object>} Search results
   */
  async search({ kb_id, query, image = null, top_k = 3, search_type = 'hybrid', filters = {} }) {
    try {
      const response = await this.client.post('/api/v1/search', {
        kb_id,
        query,
        image,
        top_k,
        search_type,
        filters
      });

      return response.data;
    } catch (error) {
      throw new Error(`Knowledge search failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for text
   * @param {Object} params - Embedding parameters
   * @param {string} params.text - Text to embed
   * @param {string} params.model - Embedding model
   * @returns {Promise<Object>} Embeddings
   */
  async generateEmbedding({ text, model = 'text-embedding-3-small' }) {
    try {
      const response = await this.client.post('/api/v1/embeddings', {
        text,
        model
      });

      return response.data;
    } catch (error) {
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Process image with CLIP
   * @param {Object} params - Image parameters
   * @param {string} params.image - Base64 image or URL
   * @param {string} params.kb_id - Knowledge base ID
   * @returns {Promise<Object>} Image processing result
   */
  async processImage({ image, kb_id }) {
    try {
      const response = await this.client.post('/api/v1/images/process', {
        image,
        kb_id
      });

      return response.data;
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Delete document and its chunks
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteDocument(documentId) {
    try {
      const response = await this.client.delete(`/api/v1/documents/${documentId}`);
      return response.data;
    } catch (error) {
      throw new Error(`Document deletion failed: ${error.message}`);
    }
  }

  /**
   * Get knowledge base statistics
   * @param {string} kb_id - Knowledge base ID
   * @returns {Promise<Object>} KB statistics
   */
  async getKBStats(kb_id) {
    try {
      const response = await this.client.get(`/api/v1/kb/${kb_id}/stats`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get KB stats: ${error.message}`);
    }
  }

  /**
   * Reprocess document (re-extract and re-embed)
   * @param {string} documentId - Document ID
   * @returns {Promise<Object>} Reprocessing result
   */
  async reprocessDocument(documentId) {
    try {
      const response = await this.client.post(`/api/v1/documents/${documentId}/reprocess`);
      return response.data;
    } catch (error) {
      throw new Error(`Document reprocessing failed: ${error.message}`);
    }
  }

  /**
   * Batch search (search multiple queries at once)
   * @param {Object} params - Batch search parameters
   * @param {string} params.kb_id - Knowledge base ID
   * @param {Array<string>} params.queries - Array of queries
   * @param {number} params.top_k - Results per query
   * @returns {Promise<Object>} Batch search results
   */
  async batchSearch({ kb_id, queries, top_k = 5 }) {
    try {
      const response = await this.client.post('/api/v1/search/batch', {
        kb_id,
        queries,
        top_k
      });

      return response.data;
    } catch (error) {
      throw new Error(`Batch search failed: ${error.message}`);
    }
  }

  /**
   * Get similar documents
   * @param {string} documentId - Reference document ID
   * @param {number} top_k - Number of similar documents
   * @returns {Promise<Object>} Similar documents
   */
  async getSimilarDocuments(documentId, top_k = 5) {
    try {
      const response = await this.client.get(`/api/v1/documents/${documentId}/similar`, {
        params: { top_k }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get similar documents: ${error.message}`);
    }
  }

  /**
   * Extract text from document (without indexing)
   * @param {Buffer} file - File buffer
   * @param {string} filename - Filename
   * @returns {Promise<Object>} Extracted text
   */
  async extractText(file, filename) {
    try {
      const FormData = require('form-data');
      const formData = new FormData();
      
      formData.append('file', file, filename);

      const response = await this.client.post('/api/v1/documents/extract', formData, {
        headers: {
          ...formData.getHeaders()
        }
      });

      return response.data;
    } catch (error) {
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Check if service is available
   * @returns {Promise<boolean>} True if available
   */
  async isAvailable() {
    try {
      await this.healthCheck();
      return true;
    } catch (error) {
      logger.warn('Python service is not available:', error.message);
      return false;
    }
  }
  
  /**
   * Upload image to Python service
   * @param {FormData} formData - Image form data
   * @returns {Promise<Object>} Upload result
   */
  async uploadImage(formData) {
    try {
      const response = await this.client.post('/api/v1/images/upload', formData, {
        headers: formData.getHeaders ? formData.getHeaders() : {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Python service - Image upload error:', error.response?.data || error.message);
      throw new Error(`Image upload failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Search images in Python service
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} Search results
   */
  async searchImages(params) {
    try {
      const response = await this.client.post('/api/v1/images/search', params);
      return response.data;
    } catch (error) {
      console.error('Python service - Image search error:', error.response?.data || error.message);
      throw new Error(`Image search failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Get image statistics
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Object>} Statistics
   */
  async getImageStats(kbId) {
    try {
      const response = await this.client.get(`/api/v1/images/${kbId}/stats`);
      return response.data;
    } catch (error) {
      console.error('Python service - Get image stats error:', error.response?.data || error.message);
      throw new Error(`Get image stats failed: ${error.response?.data?.detail || error.message}`);
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
      const response = await this.client.get(`/api/v1/images/${kbId}/list?page=${page}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error('Python service - List images error:', error.response?.data || error.message);
      throw new Error(`List images failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Delete image
   * @param {string} imageId - Image ID
   * @param {string} kbId - Knowledge base ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteImage(imageId, kbId) {
    try {
      const response = await this.client.delete(`/api/v1/images/${imageId}?kb_id=${kbId}`);
      return response.data;
    } catch (error) {
      console.error('Python service - Delete image error:', error.response?.data || error.message);
      throw new Error(`Delete image failed: ${error.response?.data?.detail || error.message}`);
    }
  }
  
  /**
   * Get semantic cache statistics
   * @param {string} kbId - Knowledge base ID (optional)
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats(kbId = null) {
    try {
      const url = kbId 
        ? `/api/v1/cache/stats?kb_id=${kbId}`
        : '/api/v1/cache/stats';
      
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      console.error('Python service - Get cache stats error:', error.response?.data || error.message);
      throw new Error(`Get cache stats failed: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Clear semantic cache
   * @param {string} kbId - Knowledge base ID (optional)
   * @returns {Promise<Object>} Success message
   */
  async clearCache(kbId = null) {
    try {
      const url = kbId 
        ? `/api/v1/cache/clear?kb_id=${kbId}`
        : '/api/v1/cache/clear';
      
      const response = await this.client.delete(url);
      return response.data;
    } catch (error) {
      console.error('Python service - Clear cache error:', error.response?.data || error.message);
      throw new Error(`Clear cache failed: ${error.response?.data?.detail || error.message}`);
    }
  }
  
  /**
   * Get image file
   * @param {string} kbId - Knowledge base ID
   * @param {string} imageId - Image ID
   * @returns {Promise<Object>} Image buffer and metadata
   */
  async getImageFile(kbId, imageId) {
    try {
      const response = await this.client.get(
        `/api/v1/images/${imageId}/file?kb_id=${kbId}`,
        { responseType: 'arraybuffer' }
      );
      
      return {
        buffer: response.data,
        content_type: response.headers['content-type'],
        file_size: response.headers['content-length']
      };
    } catch (error) {
      console.error('Python service - Get image file error:', error.response?.data || error.message);
      throw new Error(`Get image file failed: ${error.message}`);
    }
  }
}

module.exports = new PythonServiceClient();