/**
 * Language API Service
 */

import axios from 'axios';

const API_BASE = '/api/languages';

export const getLanguages = async (activeOnly = true) => {
    const params = activeOnly ? '' : '?active_only=false';
    const response = await axios.get(`${API_BASE}${params}`);
    return response.data;
};

export const getLanguage = async (code) => {
    const response = await axios.get(`${API_BASE}/${code}`);
    return response.data;
};

export const getLanguagesByRegion = async (region) => {
    const response = await axios.get(`${API_BASE}/region/${region}`);
    return response.data;
};

export const detectLanguage = async (text, useLLM = false) => {
    const response = await axios.post(`${API_BASE}/detect`, { text, use_llm: useLLM });
    return response.data;
};

export const getAgentLanguages = async (agentId) => {
    const response = await axios.get(`${API_BASE}/agent/${agentId}`);
    return response.data;
};

export const updateAgentLanguages = async (agentId, languages, defaultLanguage = null) => {
    const response = await axios.put(`${API_BASE}/agent/${agentId}`, {
        languages,
        default_language: defaultLanguage
    });
    return response.data;
};

export const getAgentLanguageCoverage = async (agentId) => {
    const response = await axios.get(`${API_BASE}/agent/${agentId}/coverage`);
    return response.data;
};

// Language display helpers
export const LANGUAGE_FLAGS = {
    'en': '🇬🇧',
    'ur': '🇵🇰',
    'ur-roman': '🇵🇰',
    'pa': '🇵🇰',
    'sd': '🇵🇰',
    'ps': '🇦🇫',
    'bal': '🇵🇰',
    'hi': '🇮🇳',
    'ta': '🇮🇳',
    'te': '🇮🇳',
    'bn': '🇧🇩',
    'mr': '🇮🇳',
    'gu': '🇮🇳',
    'ar': '🇸🇦',
    'ar-eg': '🇪🇬',
    'ar-sa': '🇸🇦',
    'es': '🇪🇸',
    'fr': '🇫🇷',
    'de': '🇩🇪',
    'zh': '🇨🇳'
};

export const getLanguageFlag = (code) => {
    return LANGUAGE_FLAGS[code] || '🌐';
};

export const LANGUAGE_REGIONS = [
    { value: 'Pakistan', label: 'Pakistan', codes: ['en', 'ur', 'ur-roman', 'pa', 'sd', 'ps', 'bal'] },
    { value: 'India', label: 'India', codes: ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu'] },
    { value: 'Middle East', label: 'Middle East', codes: ['ar', 'ar-eg', 'ar-sa', 'en'] },
    { value: 'Global', label: 'Global', codes: ['en', 'es', 'fr', 'de', 'zh'] }
];

export const getRegionLanguages = (region) => {
    return LANGUAGE_REGIONS.find(r => r.value === region)?.codes || ['en'];
};
