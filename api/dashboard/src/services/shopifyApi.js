/**
 * Shopify API Service
 * Frontend service for Shopify integration
 */

import api from './api';

/**
 * Connect Shopify store
 * @param {Object} data - Store connection data
 * @returns {Promise<Object>} Connected store
 */
export const connectStore = (data) => 
  api.post('/shopify/connect', data);

/**
 * Test Shopify connection
 * @param {Object} data - Connection test data
 * @returns {Promise<Object>} Test result
 */
export const testConnection = (data) => 
  api.post('/shopify/test-connection', data);

/**
 * List connected stores
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Stores list
 */
export const getStores = (params = {}) => 
  api.get('/shopify/stores', { params });

/**
 * Get store details
 * @param {string} storeId - Store ID
 * @returns {Promise<Object>} Store details
 */
export const getStore = (storeId) => 
  api.get(`/shopify/stores/${storeId}`);

/**
 * Update store settings
 * @param {string} storeId - Store ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated store
 */
export const updateStore = (storeId, data) => 
  api.put(`/shopify/stores/${storeId}/settings`, data);

/**
 * Disconnect store
 * @param {string} storeId - Store ID
 * @returns {Promise<Object>} Result
 */
export const disconnectStore = (storeId) => 
  api.delete(`/shopify/stores/${storeId}`);

/**
 * Trigger product sync
 * @param {string} storeId - Store ID
 * @param {Object} options - Sync options
 * @returns {Promise<Object>} Sync job
 */
export const triggerSync = (storeId, options = {}) => 
  api.post(`/shopify/sync/${storeId}`, options);

/**
 * Get sync job status
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Job status
 */
export const getSyncStatus = (jobId) => 
  api.get(`/shopify/sync/${jobId}/status`);

/**
 * Get product sync statuses
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Product statuses
 */
export const getProductStatuses = (jobId) => 
  api.get(`/shopify/sync/${jobId}/products`);

/**
 * List products with pagination
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Products list with pagination
 */
export const getProducts = (params = {}) => 
  api.get('/shopify/products', { params });

/**
 * Get product filter options
 * @param {string} kbId - Knowledge base ID
 * @returns {Promise<Object>} Filter options (vendors, product types)
 */
export const getProductFilters = (kbId) => 
  api.get(`/shopify/products/filters/${kbId}`);

/**
 * Get single product details
 */
export const getProduct = async (productId) => {
  try {
    const response = await api.get(`/shopify/products/${productId}`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Get product error:', error);
    throw error;
  }
};

/**
 * Refresh single product from Shopify
 */
export const refreshProduct = async (productId) => {
  try {
    const response = await api.post(`/shopify/products/${productId}/refresh`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Refresh product error:', error);
    throw error;
  }
};

/**
 * Delete product from knowledge base
 */
export const deleteProduct = async (productId) => {
  try {
    const response = await api.delete(`/shopify/products/${productId}`);
    return response.data.data || response.data;
  } catch (error) {
    console.error('Delete product error:', error);
    throw error;
  }
};
/**
 * Get statistics
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Statistics
 */
export const getStats = (params = {}) => 
  api.get('/shopify/stats', { params });
  
/**
 * Get product statistics
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Product statistics
 */
export const getProductStats = (params = {}) => 
  api.get('/shopify/products/stats', { params });
  
/**
 * Get store sync status (current or last)
 * @param {string} storeId - Store ID
 * @returns {Promise<Object>} Sync status
 */
export const getStoreSyncStatus = (storeId) => 
  api.get(`/shopify/stores/${storeId}/sync-status`);
  
/**
 * Cancel a running sync job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Result
 */
export const cancelSync = (jobId) => 
  api.delete(`/shopify/sync/${jobId}/cancel`);