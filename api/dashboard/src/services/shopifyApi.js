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
 * List products
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Products list
 */
export const getProducts = (params = {}) => 
  api.get('/shopify/products', { params });

/**
 * Get product details
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Product details
 */
export const getProduct = (productId) => 
  api.get(`/shopify/products/${productId}`);

/**
 * Refresh single product
 * @param {string} productId - Product ID
 * @returns {Promise<Object>} Updated product
 */
export const refreshProduct = (productId) => 
  api.post(`/shopify/products/${productId}/refresh`);

/**
 * Get statistics
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Statistics
 */
export const getStats = (params = {}) => 
  api.get('/shopify/stats', { params });