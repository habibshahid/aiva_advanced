/**
 * IVR API Extensions
 * 
 * Additional API functions for multi-language support.
 * These extend the existing ivrApi.js without modifying it.
 * 
 * Import both in your component:
 * import * as ivrApi from '../../services/ivrApi';
 * import * as ivrApiExt from '../../services/ivrApiExtensions';
 */

import api from './api';

// ============================================================================
// STEP I18N
// ============================================================================

/**
 * Get all i18n content for a step
 */
export const getStepI18nContent = async (agentId, flowId, stepId) => {
    const response = await api.get(`/flows/${agentId}/${flowId}/steps/${stepId}/i18n`);
    return response.data;
};

/**
 * Set i18n content for a step field
 */
export const setStepI18nContent = async (agentId, flowId, stepId, fieldName, languageCode, data) => {
    const response = await api.put(
        `/flows/${agentId}/${flowId}/steps/${stepId}/i18n/${fieldName}/${languageCode}`,
        data
    );
    return response.data;
};

// ============================================================================
// INTENT I18N
// ============================================================================

/**
 * Get all i18n content for an intent
 */
export const getIntentI18nContent = async (agentId, intentId) => {
    const response = await api.get(`/ivr/${agentId}/intents/${intentId}/i18n`);
    return response.data;
};

/**
 * Set i18n content for an intent field
 */
export const setIntentI18nContent = async (agentId, intentId, fieldName, languageCode, data) => {
    const response = await api.put(
        `/ivr/${agentId}/intents/${intentId}/i18n/${fieldName}/${languageCode}`,
        data
    );
    return response.data;
};

// ============================================================================
// IVR CONFIG I18N
// ============================================================================

/**
 * Get all i18n content for IVR config
 */
export const getConfigI18nContent = async (agentId) => {
    const response = await api.get(`/ivr/${agentId}/config/i18n`);
    return response.data;
};

/**
 * Set i18n content for an IVR config field
 */
export const setConfigI18nContent = async (agentId, fieldName, languageCode, data) => {
    const response = await api.put(
        `/ivr/${agentId}/config/i18n/${fieldName}/${languageCode}`,
        data
    );
    return response.data;
};

// ============================================================================
// GENERIC I18N (via internal API)
// ============================================================================

/**
 * Get i18n content for any entity type using internal API
 * Fallback for entity types without dedicated endpoints
 */
export const getGenericI18nContent = async (entityType, entityId) => {
    const response = await api.get(`/internal/i18n/${entityType}/${entityId}`);
    return response.data;
};

/**
 * Set i18n content for any entity type using internal API
 */
export const setGenericI18nContent = async (entityType, entityId, fieldName, languageCode, data) => {
    const response = await api.put(
        `/internal/i18n/${entityType}/${entityId}/${fieldName}/${languageCode}`,
        data
    );
    return response.data;
};

// ============================================================================
// LANGUAGE HELPERS
// ============================================================================

/**
 * Get language metadata with additional info
 */
export const getLanguageMetadata = (languageCode) => {
    const LANGUAGE_META = {
        'en': { flag: '🇺🇸', name: 'English', direction: 'ltr' },
        'ur': { flag: '🇵🇰', name: 'Urdu', direction: 'rtl' },
        'ur-roman': { flag: '🇵🇰', name: 'Roman Urdu', direction: 'ltr' },
        'hi': { flag: '🇮🇳', name: 'Hindi', direction: 'ltr' },
        'pa': { flag: '🇵🇰', name: 'Punjabi', direction: 'ltr' },
        'ar': { flag: '🇸🇦', name: 'Arabic', direction: 'rtl' },
        'ar-eg': { flag: '🇪🇬', name: 'Arabic (Egyptian)', direction: 'rtl' },
        'ar-sa': { flag: '🇸🇦', name: 'Arabic (Saudi)', direction: 'rtl' },
        'sd': { flag: '🇵🇰', name: 'Sindhi', direction: 'rtl' },
        'ps': { flag: '🇦🇫', name: 'Pashto', direction: 'rtl' },
        'bal': { flag: '🇵🇰', name: 'Balochi', direction: 'rtl' },
        'bn': { flag: '🇧🇩', name: 'Bengali', direction: 'ltr' },
        'ta': { flag: '🇮🇳', name: 'Tamil', direction: 'ltr' },
        'te': { flag: '🇮🇳', name: 'Telugu', direction: 'ltr' },
        'mr': { flag: '🇮🇳', name: 'Marathi', direction: 'ltr' },
        'gu': { flag: '🇮🇳', name: 'Gujarati', direction: 'ltr' },
        'es': { flag: '🇪🇸', name: 'Spanish', direction: 'ltr' },
        'fr': { flag: '🇫🇷', name: 'French', direction: 'ltr' },
        'de': { flag: '🇩🇪', name: 'German', direction: 'ltr' },
        'zh': { flag: '🇨🇳', name: 'Chinese', direction: 'ltr' }
    };
    
    return LANGUAGE_META[languageCode] || { flag: '🌐', name: languageCode, direction: 'ltr' };
};

/**
 * Check if language is RTL
 */
export const isRTL = (languageCode) => {
    const rtlLanguages = ['ur', 'ar', 'ar-eg', 'ar-sa', 'ps', 'sd', 'bal', 'he', 'fa'];
    return rtlLanguages.includes(languageCode);
};

/**
 * Merge agent languages with metadata
 */
export const enrichLanguages = (agentLanguages) => {
    return (agentLanguages || []).map(lang => ({
        ...lang,
        ...getLanguageMetadata(lang.language_code || lang.code),
        language_code: lang.language_code || lang.code
    }));
};

export default {
    // Step I18n
    getStepI18nContent,
    setStepI18nContent,
    
    // Intent I18n
    getIntentI18nContent,
    setIntentI18nContent,
    
    // Config I18n
    getConfigI18nContent,
    setConfigI18nContent,
    
    // Generic I18n
    getGenericI18nContent,
    setGenericI18nContent,
    
    // Helpers
    getLanguageMetadata,
    isRTL,
    enrichLanguages
};