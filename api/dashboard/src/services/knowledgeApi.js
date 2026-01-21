import api from './api';

// Knowledge Bases
export const getKnowledgeBases = (params) => 
  api.get('/knowledge', { params });

export const getKnowledgeBase = (id) => 
  api.get(`/knowledge/${id}`);

export const createKnowledgeBase = (data) => 
  api.post('/knowledge', data);

export const updateKnowledgeBase = (id, data) => 
  api.put(`/knowledge/${id}`, data);

export const deleteKnowledgeBase = (id) => 
  api.delete(`/knowledge/${id}`);

// Documents
export const getDocuments = (kbId, params) => 
  api.get(`/knowledge/${kbId}/documents`, { params });

export const uploadDocument = (kbId, formData, onUploadProgress) => 
  api.post(`/knowledge/${kbId}/documents`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  });

export const deleteDocument = (kbId, docId) => 
  api.delete(`/knowledge/${kbId}/documents/${docId}`);

export const getDocumentStatus = (docId) => 
  api.get(`/knowledge/documents/${docId}/status`);

// Web Scraping
export const scrapeUrl = (kbId, data, onUploadProgress) => 
  api.post(`/knowledge/${kbId}/scrape-url`, data, { onUploadProgress });

export const scrapeSitemap = (kbId, data, onUploadProgress) => 
  api.post(`/knowledge/${kbId}/scrape-sitemap`, data, { onUploadProgress });

export const testUrl = (url) => 
  api.post('/knowledge/test-url', { url });

// Search
export const searchKnowledge = (data) => 
  api.post('/knowledge/search', data);

export const batchSearch = (data) => 
  api.post('/knowledge/search/batch', data);

// Stats
export const getKBStats = (kbId) => 
  api.get(`/knowledge/${kbId}/stats`);

export const getSearchHistory = (kbId, params) => 
  api.get(`/knowledge/${kbId}/searches`, { params });
  
/**
 * Upload image to knowledge base with progress tracking
 */
export const uploadImage = async (kbId, formData, onProgress) => {
  try {
    const config = {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    };

    // Add progress tracking if callback provided
    if (onProgress) {
      config.onUploadProgress = onProgress;
    }

    const response = await api.post(`/knowledge/${kbId}/images/upload`, formData, config);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Upload image error:', error);
    throw error;
  }
};

/**
 * Search images in knowledge base
 */
export const searchImages = async (kbId, params) => {
  try {
    const response = await api.post(`/knowledge/${kbId}/images/search`, params);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Search images error:', error);
    throw error;
  }
};

/**
 * Get image statistics
 */
export const getImageStats = async (kbId) => {
  try {
    const response = await api.get(`/knowledge/${kbId}/images/stats`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Get image stats error:', error);
    throw error;
  }
};

/**
 * List images in knowledge base
 */
export const listImages = async (kbId, page = 1, limit = 20) => {
  try {
    const response = await api.get(`/knowledge/${kbId}/images/list?page=${page}&limit=${limit}`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('List images error:', error);
    throw error;
  }
};

/**
 * Delete image from knowledge base
 */
export const deleteImage = async (kbId, imageId) => {
  try {
    const response = await api.delete(`/knowledge/${kbId}/images/${imageId}?kb_id=${kbId}`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Delete image error:', error);
    throw error;
  }
};

// ADD THESE NEW FUNCTIONS

/**
 * Get semantic cache statistics
 * @param {string} kbId - Knowledge base ID (optional)
 * @returns {Promise} Cache statistics
 */
export const getCacheStats = async (kbId = null) => {
  const url = kbId 
    ? `/knowledge/cache/stats?kb_id=${kbId}`
    : '/knowledge/cache/stats';
  
  const response = await api.get(url);
  return response.data;
};

/**
 * Clear semantic cache
 * @param {string} kbId - Knowledge base ID (optional, clears all if null)
 * @returns {Promise} Success message
 */
export const clearCache = async (kbId = null) => {
  const url = kbId 
    ? `/knowledge/cache/clear?kb_id=${kbId}`
    : '/knowledge/cache/clear';
  
  const response = await api.delete(url);
  return response.data;
};

// Scrape Sources

// Get scrape sources for a knowledge base
export const getScrapeSources = (kbId) => {
  return api.get(`/knowledge/${kbId}/scrape-sources`);
};

// Update scrape source settings (auto-save)
export const updateScrapeSource = (sourceId, data) => {
  return api.patch(`/knowledge/scrape-sources/${sourceId}`, data);
};

// Trigger manual sync for a scrape source
export const syncScrapeSource = (sourceId, force = false) => {
  return api.post(`/knowledge/scrape-sources/${sourceId}/sync`, { force });
};

// Check for changes without syncing
export const checkScrapeChanges = (sourceId) => {
  return api.get(`/knowledge/scrape-sources/${sourceId}/check-changes`);
};

// Delete a scrape source
export const deleteScrapeSource = (sourceId, deleteDocuments = false) => {
  return api.delete(`/knowledge/scrape-sources/${sourceId}?delete_documents=${deleteDocuments}`);
};

