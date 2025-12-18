/**
 * IVR API Service
 * API calls for Intent IVR configuration management
 */

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// =============================================================================
// IVR CONFIG
// =============================================================================

export const getIVRConfig = (agentId) => 
  api.get(`/ivr/${agentId}/config`);

export const updateIVRConfig = (agentId, data) => 
  api.put(`/ivr/${agentId}/config`, data);

// =============================================================================
// INTENTS
// =============================================================================

export const getIntents = (agentId, includeInactive = false) => 
  api.get(`/ivr/${agentId}/intents`, { params: { include_inactive: includeInactive } });

export const getIntent = (agentId, intentId) => 
  api.get(`/ivr/${agentId}/intents/${intentId}`);

export const createIntent = (agentId, data) => 
  api.post(`/ivr/${agentId}/intents`, data);

export const updateIntent = (agentId, intentId, data) => 
  api.put(`/ivr/${agentId}/intents/${intentId}`, data);

export const deleteIntent = (agentId, intentId) => 
  api.delete(`/ivr/${agentId}/intents/${intentId}`);

export const reorderIntents = (agentId, intentIds) => 
  api.post(`/ivr/${agentId}/intents/reorder`, { intent_ids: intentIds });

export const generateIntentAudio = (agentId, intentId, voice = null) => 
  api.post(`/ivr/${agentId}/intents/${intentId}/generate-audio`, { voice });

// =============================================================================
// AUDIO
// =============================================================================

export const getAudioFiles = (agentId, filters = {}) => 
  api.get(`/ivr/${agentId}/audio`, { params: filters });

export const getAudioFile = (agentId, audioId) => 
  api.get(`/ivr/${agentId}/audio/${audioId}`);

export const uploadAudio = (agentId, formData) => 
  api.post(`/ivr/${agentId}/audio/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const generateAudio = (agentId, data) => 
  api.post(`/ivr/${agentId}/audio/generate`, data);

export const deleteAudio = (agentId, audioId) => 
  api.delete(`/ivr/${agentId}/audio/${audioId}`);

export const getAudioStreamUrl = (agentId, audioId) => {
  const token = localStorage.getItem('token');
  return `${API_URL}/ivr/${agentId}/audio/${audioId}/stream${token ? `?token=${token}` : ''}`;
};

// =============================================================================
// TEMPLATES
// =============================================================================

export const getTemplates = (agentId) => 
  api.get(`/ivr/${agentId}/templates`);

export const createTemplate = (agentId, data) => 
  api.post(`/ivr/${agentId}/templates`, data);

export const updateTemplate = (agentId, templateId, data) => 
  api.put(`/ivr/${agentId}/templates/${templateId}`, data);

export const deleteTemplate = (agentId, templateId) => 
  api.delete(`/ivr/${agentId}/templates/${templateId}`);

// =============================================================================
// SEGMENTS
// =============================================================================

export const getSegments = (agentId) => 
  api.get(`/ivr/${agentId}/segments`);

export const upsertSegment = (agentId, data) => 
  api.post(`/ivr/${agentId}/segments`, data);

export const deleteSegment = (agentId, segmentKey) => 
  api.delete(`/ivr/${agentId}/segments/${segmentKey}`);

export const generateAllSegmentAudio = (agentId) => 
  api.post(`/ivr/${agentId}/segments/generate-all`);

// =============================================================================
// CACHE
// =============================================================================

export const getCacheStats = (agentId) => 
  api.get(`/ivr/${agentId}/cache/stats`);

export const clearCache = (agentId, type = 'all') => 
  api.post(`/ivr/${agentId}/cache/clear`, { type });

export const getCachedResponses = (agentId, params = {}) => 
  api.get(`/ivr/${agentId}/cache/responses`, { params });

export const getCachedVariables = (agentId, params = {}) => 
  api.get(`/ivr/${agentId}/cache/variables`, { params });

export const deleteCachedResponse = (agentId, cacheId) => 
  api.delete(`/ivr/${agentId}/cache/responses/${cacheId}`);

export const deleteCachedVariable = (agentId, cacheId) => 
  api.delete(`/ivr/${agentId}/cache/variables/${cacheId}`);

export default {
  getIVRConfig,
  updateIVRConfig,
  getIntents,
  getIntent,
  createIntent,
  updateIntent,
  deleteIntent,
  reorderIntents,
  generateIntentAudio,
  getAudioFiles,
  getAudioFile,
  uploadAudio,
  generateAudio,
  deleteAudio,
  getAudioStreamUrl,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getSegments,
  upsertSegment,
  deleteSegment,
  generateAllSegmentAudio,
  getCacheStats,
  clearCache,
  getCachedResponses,
  getCachedVariables,
  deleteCachedResponse,
  deleteCachedVariable
};