/**
 * IVR API Service
 * Dashboard API calls for IVR system management
 */

import api from './api';

// ============================================================================
// LANGUAGES
// ============================================================================

export const getLanguages = async (activeOnly = true) => {
    const response = await api.get('/languages', { params: { active_only: activeOnly } });
    return response.data;
};

export const getLanguage = async (code) => {
    const response = await api.get(`/languages/${code}`);
    return response.data;
};

export const detectLanguage = async (text) => {
    const response = await api.post('/languages/detect', { text });
    return response.data;
};

export const getAgentLanguages = async (agentId) => {
    const response = await api.get(`/languages/agent/${agentId}`);
    return response.data;
};

export const updateAgentLanguages = async (agentId, languages, defaultLanguage) => {
    const response = await api.put(`/languages/agent/${agentId}`, {
        languages,
        default_language: defaultLanguage
    });
    return response.data;
};

export const getAgentLanguageCoverage = async (agentId) => {
    const response = await api.get(`/languages/agent/${agentId}/coverage`);
    return response.data;
};

// ============================================================================
// SEGMENTS
// ============================================================================

export const getSegments = async (agentId, options = {}) => {
    const response = await api.get(`/segments/${agentId}`, { params: options });
    return response.data;
};

export const getSegment = async (agentId, segmentId) => {
    const response = await api.get(`/segments/${agentId}/${segmentId}`);
    return response.data;
};

export const getSegmentByKey = async (agentId, segmentKey, language = null) => {
    const response = await api.get(`/segments/${agentId}/key/${segmentKey}`, {
        params: { language }
    });
    return response.data;
};

export const createSegment = async (agentId, data) => {
    const response = await api.post(`/segments/${agentId}`, data);
    return response.data;
};

export const updateSegment = async (agentId, segmentId, data) => {
    const response = await api.put(`/segments/${agentId}/${segmentId}`, data);
    return response.data;
};

export const deleteSegment = async (agentId, segmentId) => {
    const response = await api.delete(`/segments/${agentId}/${segmentId}`);
    return response.data;
};

export const setSegmentContent = async (agentId, segmentId, languageCode, content) => {
    const response = await api.put(
        `/segments/${agentId}/${segmentId}/content/${languageCode}`,
        content
    );
    return response.data;
};

export const deleteSegmentContent = async (agentId, segmentId, languageCode) => {
    const response = await api.delete(
        `/segments/${agentId}/${segmentId}/content/${languageCode}`
    );
    return response.data;
};

export const getSegmentCoverage = async (agentId) => {
    const response = await api.get(`/segments/${agentId}/coverage/languages`);
    return response.data;
};

export const getMissingTranslations = async (agentId, languageCode) => {
    const response = await api.get(`/segments/${agentId}/coverage/missing/${languageCode}`);
    return response.data;
};

export const bulkCreateSegments = async (agentId, segments) => {
    const response = await api.post(`/segments/${agentId}/bulk`, { segments });
    return response.data;
};

// ============================================================================
// TEMPLATES
// ============================================================================

export const getTemplates = async (agentId, options = {}) => {
    const response = await api.get(`/templates/${agentId}`, { params: options });
    return response.data;
};

export const getTemplate = async (agentId, templateId) => {
    const response = await api.get(`/templates/${agentId}/${templateId}`);
    return response.data;
};

export const getTemplateByKey = async (agentId, templateKey) => {
    const response = await api.get(`/templates/${agentId}/key/${templateKey}`);
    return response.data;
};

export const createTemplate = async (agentId, data) => {
    const response = await api.post(`/templates/${agentId}`, data);
    return response.data;
};

export const updateTemplate = async (agentId, templateId, data) => {
    const response = await api.put(`/templates/${agentId}/${templateId}`, data);
    return response.data;
};

export const deleteTemplate = async (agentId, templateId) => {
    const response = await api.delete(`/templates/${agentId}/${templateId}`);
    return response.data;
};

export const duplicateTemplate = async (agentId, templateId, newKey = null) => {
    const response = await api.post(`/templates/${agentId}/${templateId}/duplicate`, {
        new_key: newKey
    });
    return response.data;
};

export const previewTemplate = async (agentId, templateId, variables, language = 'en') => {
    const response = await api.post(`/templates/${agentId}/${templateId}/preview`, {
        variables,
        language
    });
    return response.data;
};

export const getResolvedTemplate = async (agentId, templateId, language = 'en') => {
    const response = await api.get(`/templates/${agentId}/${templateId}/resolved`, {
        params: { language }
    });
    return response.data;
};

export const validateTemplate = async (agentId, structure) => {
    const response = await api.post(`/templates/${agentId}/validate`, {
        template_structure: structure
    });
    return response.data;
};

// ============================================================================
// FLOWS
// ============================================================================

export const getFlows = async (agentId, includeInactive = false) => {
    const response = await api.get(`/flows/${agentId}`, {
        params: { include_inactive: includeInactive }
    });
    return response.data;
};

export const getFlow = async (agentId, flowId) => {
    const response = await api.get(`/flows/${agentId}/${flowId}`);
    return response.data;
};

export const createFlow = async (agentId, data) => {
    const response = await api.post(`/flows/${agentId}`, data);
    return response.data;
};

export const updateFlow = async (agentId, flowId, data) => {
    const response = await api.put(`/flows/${agentId}/${flowId}`, data);
    return response.data;
};

export const deleteFlow = async (agentId, flowId) => {
    const response = await api.delete(`/flows/${agentId}/${flowId}`);
    return response.data;
};

export const duplicateFlow = async (agentId, flowId) => {
    const response = await api.post(`/flows/${agentId}/${flowId}/duplicate`);
    return response.data;
};

// Flow Steps
export const getFlowSteps = async (agentId, flowId) => {
    const response = await api.get(`/flows/${agentId}/${flowId}/steps`);
    return response.data;
};

export const createFlowStep = async (agentId, flowId, data) => {
    const response = await api.post(`/flows/${agentId}/${flowId}/steps`, data);
    return response.data;
};

export const updateFlowStep = async (agentId, flowId, stepId, data) => {
    const response = await api.put(`/flows/${agentId}/${flowId}/steps/${stepId}`, data);
    return response.data;
};

export const deleteFlowStep = async (agentId, flowId, stepId) => {
    const response = await api.delete(`/flows/${agentId}/${flowId}/steps/${stepId}`);
    return response.data;
};

export const reorderFlowSteps = async (agentId, flowId, stepIds) => {
    const response = await api.post(`/flows/${agentId}/${flowId}/steps/reorder`, {
        step_ids: stepIds
    });
    return response.data;
};

// Flow I18n
export const setFlowI18nContent = async (agentId, flowId, fieldName, languageCode, data) => {
    const response = await api.put(
        `/flows/${agentId}/${flowId}/i18n/${fieldName}/${languageCode}`,
        data
    );
    return response.data;
};

export const getFlowI18nContent = async (agentId, flowId) => {
    const response = await api.get(`/flows/${agentId}/${flowId}/i18n`);
    return response.data;
};

// ============================================================================
// FUNCTIONS (for flow builder)
// ============================================================================

export const getFunctions = async (agentId) => {
    const response = await api.get(`/agents/${agentId}/functions`);
    return response.data;
};

// ============================================================================
// IVR CONFIG
// ============================================================================

export const getIVRConfig = async (agentId) => {
    const response = await api.get(`/ivr/${agentId}/config`);
    return response.data;
};

export const updateIVRConfig = async (agentId, data) => {
    const response = await api.put(`/ivr/${agentId}/config`, data);
    return response.data;
};

// ============================================================================
// INTENTS
// ============================================================================

export const getIntents = async (agentId, includeInactive = false) => {
    const response = await api.get(`/ivr/${agentId}/intents`, {
        params: { include_inactive: includeInactive }
    });
    return response.data;
};

export const getIntent = async (agentId, intentId) => {
    const response = await api.get(`/ivr/${agentId}/intents/${intentId}`);
    return response.data;
};

export const createIntent = async (agentId, data) => {
    const response = await api.post(`/ivr/${agentId}/intents`, data);
    return response.data;
};

export const updateIntent = async (agentId, intentId, data) => {
    const response = await api.put(`/ivr/${agentId}/intents/${intentId}`, data);
    return response.data;
};

export const deleteIntent = async (agentId, intentId) => {
    const response = await api.delete(`/ivr/${agentId}/intents/${intentId}`);
    return response.data;
};

export const reorderIntents = async (agentId, intentIds) => {
    const response = await api.post(`/ivr/${agentId}/intents/reorder`, {
        intent_ids: intentIds
    });
    return response.data;
};

// ============================================================================
// CACHE
// ============================================================================

export const getCacheStats = async (agentId) => {
    const response = await api.get(`/ivr/${agentId}/cache/stats`);
    return response.data;
};

export const clearCache = async (agentId, type = 'all') => {
    const response = await api.delete(`/ivr/${agentId}/cache`, {
        params: { type }
    });
    return response.data;
};

// ============================================================================
// AUDIO
// ============================================================================

export const generateTTS = async (agentId, data) => {
    // Support both object and individual params
    const payload = typeof data === 'object' ? {
        text: data.text,
        name: data.name,
        description: data.description,
        language: data.language || 'en',
        voice_id: data.voice_id || data.voiceId || null
    } : {
        text: data,
        language: 'en',
        voice_id: null
    };
    
    const response = await api.post(`/ivr/${agentId}/audio/generate`, payload);
    return response.data;
};

// Alias for generateTTS
export const generateAudio = generateTTS;

export const generateIntentAudio = async (agentId, intentId) => {
    const response = await api.post(`/ivr/${agentId}/intents/${intentId}/generate-audio`);
    return response.data;
};

export const uploadAudio = async (agentId, file, metadata = {}) => {
    const formData = new FormData();
    formData.append('audio', file);
    Object.keys(metadata).forEach(key => {
        formData.append(key, metadata[key]);
    });
    
    const response = await api.post(`/ivr/${agentId}/audio/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const deleteAudio = async (agentId, audioId) => {
    const response = await api.delete(`/ivr/${agentId}/audio/${audioId}`);
    return response.data;
};

export const saveGeneratedAudio = async (agentId, data) => {
    const response = await api.post(`/ivr/${agentId}/audio`, data);
    return response.data;
};

export const getAudioFiles = async (agentId) => {
    const response = await api.get(`/ivr/${agentId}/audio`);
    return response.data;
};

export const getAudioStreamUrl = (agentId, audioId) => {
	const token = localStorage.getItem('token');
    return `${api.defaults.baseURL}/ivr/${agentId}/audio/${audioId}/stream?token=${token}`;
};

// ============================================================================
// HELPERS
// ============================================================================

export const SEGMENT_TYPES = [
    { value: 'prefix', label: 'Prefix', description: 'Start of a sentence' },
    { value: 'connector', label: 'Connector', description: 'Middle of a sentence' },
    { value: 'suffix', label: 'Suffix', description: 'End of a sentence' },
    { value: 'standalone', label: 'Standalone', description: 'Complete sentence' }
];

export const SLOT_TYPES = [
    { value: 'name', label: 'Name', description: 'Person name' },
    { value: 'phone', label: 'Phone Number', description: 'Phone/mobile number' },
    { value: 'email', label: 'Email', description: 'Email address' },
    { value: 'number', label: 'Number', description: 'Numeric value' },
    { value: 'alphanumeric', label: 'Alphanumeric', description: 'Order/Invoice number' },
    { value: 'address', label: 'Address', description: 'Street address' },
    { value: 'city', label: 'City', description: 'City name' },
    { value: 'date', label: 'Date', description: 'Date value' },
    { value: 'time', label: 'Time', description: 'Time value' },
    { value: 'yes_no', label: 'Yes/No', description: 'Confirmation' },
    { value: 'choice', label: 'Choice', description: 'Multiple choice' },
    { value: 'freeform', label: 'Free Text', description: 'Any text' }
];

export const STEP_TYPES = [
    { value: 'collect_slot', label: 'Collect Information', icon: 'MessageSquare' },
    { value: 'confirm', label: 'Confirm Value', icon: 'CheckCircle' },
    { value: 'respond', label: 'Speak Message', icon: 'Volume2' },
    { value: 'branch', label: 'Branch/Condition', icon: 'GitBranch' },
    { value: 'function', label: 'Call Function', icon: 'Zap' },
    { value: 'transfer', label: 'Transfer Call', icon: 'Phone' }
];

export const COMPLETION_ACTIONS = [
    { value: 'function_call', label: 'Call Function' },
    { value: 'transfer', label: 'Transfer Call' },
    { value: 'respond', label: 'Speak & End' },
    { value: 'end_call', label: 'End Call' }
];

export const AUDIO_SOURCES = [
    { value: 'none', label: 'None (TTS)' },
    { value: 'library', label: 'Select from Library' },
    { value: 'tts', label: 'Generate TTS' },
    { value: 'template', label: 'Use Template' }
];

export const generateSegmentKey = (text) => {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
};

export const generateFlowKey = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
};

export const generateStepKey = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 30);
};

export default {
    // Functions
    getFunctions,
    
    // IVR Config
    getIVRConfig,
    updateIVRConfig,
    
    // Intents
    getIntents,
    getIntent,
    createIntent,
    updateIntent,
    deleteIntent,
    reorderIntents,
    
    // Cache
    getCacheStats,
    clearCache,
    
    // Languages
    getLanguages,
    getLanguage,
    detectLanguage,
    getAgentLanguages,
    updateAgentLanguages,
    getAgentLanguageCoverage,
    
    // Segments
    getSegments,
    getSegment,
    getSegmentByKey,
    createSegment,
    updateSegment,
    deleteSegment,
    setSegmentContent,
    deleteSegmentContent,
    getSegmentCoverage,
    getMissingTranslations,
    bulkCreateSegments,
    
    // Templates
    getTemplates,
    getTemplate,
    getTemplateByKey,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    previewTemplate,
    getResolvedTemplate,
    validateTemplate,
    
    // Flows
    getFlows,
    getFlow,
    createFlow,
    updateFlow,
    deleteFlow,
    duplicateFlow,
    getFlowSteps,
    createFlowStep,
    updateFlowStep,
    deleteFlowStep,
    reorderFlowSteps,
    setFlowI18nContent,
    getFlowI18nContent,
    
    // Audio
    generateTTS,
    generateAudio,
    generateIntentAudio,
    uploadAudio,
    deleteAudio,
    saveGeneratedAudio,
    getAudioFiles,
    getAudioStreamUrl,
    
    // Constants
    SEGMENT_TYPES,
    SLOT_TYPES,
    STEP_TYPES,
    COMPLETION_ACTIONS,
    AUDIO_SOURCES,
    
    // Helpers
    generateSegmentKey,
    generateFlowKey,
    generateStepKey
};