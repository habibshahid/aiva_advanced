/**
 * Segment API Service
 */

import axios from 'axios';

const API_BASE = '/api/segments';

export const listSegments = async (agentId, options = {}) => {
    const params = new URLSearchParams();
    if (options.language) params.append('language', options.language);
    if (options.type) params.append('type', options.type);
    if (options.search) params.append('search', options.search);
    
    const response = await axios.get(`${API_BASE}/${agentId}?${params}`);
    return response.data;
};

export const getSegment = async (agentId, segmentId) => {
    const response = await axios.get(`${API_BASE}/${agentId}/${segmentId}`);
    return response.data;
};

export const getSegmentByKey = async (agentId, segmentKey, language = null) => {
    const params = language ? `?language=${language}` : '';
    const response = await axios.get(`${API_BASE}/${agentId}/key/${segmentKey}${params}`);
    return response.data;
};

export const createSegment = async (agentId, data) => {
    const response = await axios.post(`${API_BASE}/${agentId}`, data);
    return response.data;
};

export const updateSegment = async (agentId, segmentId, data) => {
    const response = await axios.put(`${API_BASE}/${agentId}/${segmentId}`, data);
    return response.data;
};

export const deleteSegment = async (agentId, segmentId) => {
    const response = await axios.delete(`${API_BASE}/${agentId}/${segmentId}`);
    return response.data;
};

export const setSegmentContent = async (agentId, segmentId, languageCode, content) => {
    const response = await axios.put(
        `${API_BASE}/${agentId}/${segmentId}/content/${languageCode}`,
        content
    );
    return response.data;
};

export const deleteSegmentContent = async (agentId, segmentId, languageCode) => {
    const response = await axios.delete(
        `${API_BASE}/${agentId}/${segmentId}/content/${languageCode}`
    );
    return response.data;
};

export const getLanguageCoverage = async (agentId) => {
    const response = await axios.get(`${API_BASE}/${agentId}/coverage/languages`);
    return response.data;
};

export const getMissingTranslations = async (agentId, languageCode) => {
    const response = await axios.get(`${API_BASE}/${agentId}/coverage/missing/${languageCode}`);
    return response.data;
};

export const bulkCreateSegments = async (agentId, segments) => {
    const response = await axios.post(`${API_BASE}/${agentId}/bulk`, { segments });
    return response.data;
};
