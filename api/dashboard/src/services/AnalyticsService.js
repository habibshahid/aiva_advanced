/**
 * Analytics API Service
 * Handles all analytics-related API calls
 */

import api from './api';

// ============================================================================
// DASHBOARD OVERVIEW
// ============================================================================

/**
 * Get overview dashboard metrics
 * @param {Object} params - Query parameters (date_from, date_to, agent_id)
 * @returns {Promise<Object>} Overview metrics
 */
export const getOverviewMetrics = (params = {}) => 
  api.get('/analytics/overview', { params });

// ============================================
// OVERVIEW DASHBOARD (Enhanced Dashboard 1)
// ============================================

export const getOverviewSummary = (params = {}) => 
  api.get('/analytics/overview/summary', { params });

export const getOverviewTrends = (params = {}) => 
  api.get('/analytics/overview/trends', { params });

export const getOverviewAgents = (params = {}) => 
  api.get('/analytics/overview/agents', { params });

export const getAgentsList = () => 
  api.get('/analytics/overview/agents');
  
export const getAdvancedIntents = (params = {}) => 
  api.get('/analytics/advanced/top-intents', { params });

export const getAdvancedTopics = (params = {}) => 
  api.get('/analytics/advanced/topics', { params });


// ============================================================================
// CALLS ANALYTICS
// ============================================================================

/**
 * Get calls report with pagination and filters
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Calls list
 */
export const getCallsReport = (params = {}) => 
  api.get('/analytics/calls', { params });

/**
 * Get single call details
 * @param {string} callId - Call log ID
 * @returns {Promise<Object>} Call details
 */
export const getCallDetails = (callId) => 
  api.get(`/analytics/calls/${callId}/details`);

/**
 * Get call transcription
 * @param {string} callId - Call log ID
 * @returns {Promise<Object>} Call transcription
 */
export const getCallTranscription = (callId) => 
  api.get(`/analytics/calls/${callId}/transcript`);

/**
 * Get call analytics
 * @param {string} callId - Call log ID
 * @returns {Promise<Object>} Call analytics
 */
export const getCallAnalytics = (callId) => 
  api.get(`/analytics/calls/${callId}/analytics`);

/**
 * Export calls report
 * @param {Object} params - Filter parameters
 * @param {string} format - Export format ('csv' or 'pdf')
 * @returns {Promise<Blob>} File blob
 */
export const exportCallsReport = (params = {}, format = 'csv') => 
  api.get(`/analytics/calls/export/${format}`, { 
    params,
    responseType: 'blob' 
  });

// ============================================================================
// CHAT ANALYTICS
// ============================================================================

/**
 * Get chat sessions report
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Chat sessions list
 */
export const getChatReport = (params = {}) => 
  api.get('/analytics/chats', { params });

/**
 * Get single chat session details
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Object>} Session details
 */
export const getChatSessionDetails = (sessionId) => 
  api.get(`/analytics/chats/${sessionId}/details`);

/**
 * Get chat messages for a session
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Object>} Chat messages
 */
export const getChatMessages = (sessionId) => 
  api.get(`/analytics/chats/${sessionId}/messages`);

/**
 * Get chat session analytics
 * @param {string} sessionId - Chat session ID
 * @returns {Promise<Object>} Session analytics
 */
export const getChatAnalytics = (sessionId) => 
  api.get(`/analytics/chats/${sessionId}/analytics`);

/**
 * Export chat report
 * @param {Object} params - Filter parameters
 * @param {string} format - Export format ('csv' or 'pdf')
 * @returns {Promise<Blob>} File blob
 */
export const exportChatReport = (params = {}, format = 'csv') => 
  api.get(`/analytics/chats/export/${format}`, { 
    params,
    responseType: 'blob' 
  });

// ============================================================================
// ADVANCED ANALYTICS
// ============================================================================

/**
 * Get sentiment trends
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Sentiment trends data
 */
export const getSentimentTrends = (params = {}) => 
  api.get('/analytics/advanced/sentiment-trends', { params });

/**
 * Get intent distribution
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Intent distribution data
 */
export const getIntentDistribution = (params = {}) => 
  api.get('/analytics/advanced/intent-distribution', { params });

/**
 * Get top customer intents
 * @param {Object} params - Query parameters (date_from, date_to, limit)
 * @returns {Promise<Object>} Top intents with counts
 */
export const getTopIntents = (params = {}) => 
  api.get('/analytics/advanced/top-intents', { params });

/**
 * Get profanity statistics
 * @param {Object} params - Query parameters (date_from, date_to)
 * @returns {Promise<Object>} Profanity stats
 */
export const getProfanityStats = (params = {}) => 
  api.get('/analytics/advanced/profanity-stats', { params });

/**
 * Get top keywords
 * @param {Object} params - Query parameters (date_from, date_to, limit)
 * @returns {Promise<Object>} Top keywords with frequency
 */
export const getTopKeywords = (params = {}) => 
  api.get('/analytics/advanced/top-keywords', { params });


/**
 * Get keyword analysis
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Keywords data
 */
export const getKeywordAnalysis = (params = {}) => 
  api.get('/analytics/advanced/keywords', { params });

/**
 * Get language distribution
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Language distribution data
 */
export const getLanguageDistribution = (params = {}) => 
  api.get('/analytics/advanced/language-distribution', { params });

/**
 * Get emotion analysis
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Emotion analysis data
 */
export const getEmotionAnalysis = (params = {}) => 
  api.get('/analytics/advanced/emotions', { params });

/**
 * Get topic analysis
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Topic analysis data
 */
export const getTopicAnalysis = (params = {}) => 
  api.get('/analytics/advanced/topics', { params });

// ============================================================================
// COST & PERFORMANCE ANALYTICS
// ============================================================================

export const getCostOverview = (params = {}) => 
  api.get('/analytics/costs/overview', { params });
  
export const getCostTrends = (params = {}) => 
  api.get('/analytics/costs/trends', { params });
  
export const getCostBreakdown = (params = {}) => 
  api.get('/analytics/costs/breakdown', { params });
  
export const getAgentPerformance = (params = {}) => 
  api.get('/analytics/agents/performance', { params });

/**
 * Get single agent performance details
 * @param {string} agentId - Agent ID
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Agent performance details
 */
export const getAgentPerformanceDetails = (agentId, params = {}) => 
  api.get(`/analytics/performance/agents/${agentId}`, { params });

/**
 * Get efficiency metrics
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Efficiency metrics
 */
export const getEfficiencyMetrics = (params = {}) => 
  api.get('/analytics/performance/efficiency', { params });

/**
 * Get cost per operation breakdown
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Cost per operation data
 */
export const getCostPerOperation = (params = {}) => 
  api.get('/analytics/costs/per-operation', { params });

// ============================================================================
// CUSTOMER SATISFACTION ANALYTICS
// ============================================================================

export const getSatisfactionOverview = (params = {}) => 
  api.get('/analytics/satisfaction/overview', { params });

export const getSatisfactionTrends = (params = {}) => 
  api.get('/analytics/satisfaction/trends', { params });

export const getSatisfactionFeedback = (params = {}) => 
  api.get('/analytics/satisfaction/feedback', { params });

export const getSatisfactionByAgent = (params = {}) => 
  api.get('/analytics/satisfaction/by-agent', { params });

export const getSatisfactionByIntent = (params = {}) => 
  api.get('/analytics/satisfaction/by-intent', { params });

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get date range presets
 * @returns {Object} Date range presets
 */
export const getDateRangePresets = () => {
  const today = new Date();
  const getDateString = (date) => date.toISOString().split('T')[0];
  
  return {
    today: {
      label: 'Today',
      date_from: getDateString(today),
      date_to: getDateString(today)
    },
    yesterday: {
      label: 'Yesterday',
      date_from: getDateString(new Date(today.getTime() - 24 * 60 * 60 * 1000)),
      date_to: getDateString(new Date(today.getTime() - 24 * 60 * 60 * 1000))
    },
    last7days: {
      label: 'Last 7 Days',
      date_from: getDateString(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)),
      date_to: getDateString(today)
    },
    last30days: {
      label: 'Last 30 Days',
      date_from: getDateString(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)),
      date_to: getDateString(today)
    },
    thisMonth: {
      label: 'This Month',
      date_from: getDateString(new Date(today.getFullYear(), today.getMonth(), 1)),
      date_to: getDateString(today)
    },
    lastMonth: {
      label: 'Last Month',
      date_from: getDateString(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      date_to: getDateString(new Date(today.getFullYear(), today.getMonth(), 0))
    }
  };
};
  
/**
 * Format currency
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
export const formatCurrency = (amount) => {
  return `$${parseFloat(amount || 0).toFixed(2)}`;
};

/**
 * Format percentage
 * @param {number} value - Value to format
 * @returns {string} Formatted percentage
 */
export const formatPercentage = (value) => {
  return `${parseFloat(value || 0).toFixed(1)}%`;
};

/**
 * Format duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
};

/**
 * Format date
 * @param {string} dateString - ISO date string
 * @param {string} format - Format type ('short', 'long', 'time')
 * @returns {string} Formatted date
 */
export const formatDate = (dateString, format = 'short') => {
  const date = new Date(dateString);
  
  switch (format) {
    case 'short':
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    case 'long':
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    case 'time':
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    case 'datetime':
      return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    default:
      return date.toLocaleDateString();
  }
};

// Default export
const AnalyticsService = {
  // Overview
  // Overview Dashboard
  getOverviewSummary,
  getOverviewTrends,
  getOverviewAgents,
  getOverviewMetrics,
  getAgentsList,
  getAdvancedIntents,
  getAdvancedTopics,
  
  // Calls
  getCallsReport,
  getCallDetails,
  getCallTranscription,
  getCallAnalytics,
  exportCallsReport,
  
  // Chats
  getChatReport,
  getChatSessionDetails,
  getChatMessages,
  getChatAnalytics,
  exportChatReport,
  
  // Advanced
  getSentimentTrends,
  getIntentDistribution,
  getKeywordAnalysis,
  getLanguageDistribution,
  getEmotionAnalysis,
  getTopicAnalysis,
  getTopIntents,
  getProfanityStats,
  getTopKeywords, 
  getProfanityStats,
  // Cost & Performance
  getCostOverview, 
  getCostTrends, 
  getCostBreakdown, 
  getAgentPerformance,
  
  // Satisfaction
  getSatisfactionOverview,
  getSatisfactionTrends,
  getSatisfactionFeedback,
  getSatisfactionByAgent,
  getSatisfactionByIntent,
  
  // Utilities
  getDateRangePresets,
  formatCurrency,
  formatPercentage,
  formatDuration,
  formatDate
};

export default AnalyticsService;