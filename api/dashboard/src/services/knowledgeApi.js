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