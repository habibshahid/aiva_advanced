/**
 * User Management API Service
 */

import api from './api';

/**
 * List users
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Users list
 */
export const getUsers = (params = {}) => 
  api.get('/users', { params });

/**
 * Get user details
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User details
 */
export const getUser = (userId) => 
  api.get(`/users/${userId}`);

/**
 * Create user
 * @param {Object} data - User data
 * @returns {Promise<Object>} Created user
 */
export const createUser = (data) => 
  api.post('/users', data);

/**
 * Update user
 * @param {string} userId - User ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated user
 */
export const updateUser = (userId, data) => 
  api.put(`/users/${userId}`, data);

/**
 * Delete user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result
 */
export const deleteUser = (userId) => 
  api.delete(`/users/${userId}`);

/**
 * Get user audit log
 * @param {string} userId - User ID
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Audit logs
 */
export const getUserAuditLog = (userId, params = {}) => 
  api.get(`/users/${userId}/audit-log`, { params });