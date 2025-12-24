/**
 * Flow API Service
 * Dashboard API calls for IVR Conversation Flows
 */

import api from './api';

// =============================================================================
// FLOWS
// =============================================================================

export const getFlows = (agentId, includeInactive = false) => 
    api.get(`/flows/${agentId}`, { params: { include_inactive: includeInactive } });

export const getFlow = (agentId, flowId) => 
    api.get(`/flows/${agentId}/flow/${flowId}`);

export const createFlow = (agentId, data) => 
    api.post(`/flows/${agentId}`, data);

export const updateFlow = (agentId, flowId, data) => 
    api.put(`/flows/${agentId}/flow/${flowId}`, data);

export const deleteFlow = (agentId, flowId) => 
    api.delete(`/flows/${agentId}/flow/${flowId}`);

export const duplicateFlow = (agentId, flowId, data = {}) => 
    api.post(`/flows/${agentId}/flow/${flowId}/duplicate`, data);

// =============================================================================
// STEPS
// =============================================================================

export const getSteps = (agentId, flowId) => 
    api.get(`/flows/${agentId}/flow/${flowId}/steps`);

export const getStep = (agentId, flowId, stepId) => 
    api.get(`/flows/${agentId}/flow/${flowId}/steps/${stepId}`);

export const createStep = (agentId, flowId, data) => 
    api.post(`/flows/${agentId}/flow/${flowId}/steps`, data);

export const updateStep = (agentId, flowId, stepId, data) => 
    api.put(`/flows/${agentId}/flow/${flowId}/steps/${stepId}`, data);

export const deleteStep = (agentId, flowId, stepId) => 
    api.delete(`/flows/${agentId}/flow/${flowId}/steps/${stepId}`);

export const reorderSteps = (agentId, flowId, stepIds) => 
    api.post(`/flows/${agentId}/flow/${flowId}/steps/reorder`, { step_ids: stepIds });

// =============================================================================
// SESSIONS
// =============================================================================

export const getSessions = (agentId, flowId, params = {}) => 
    api.get(`/flows/${agentId}/flow/${flowId}/sessions`, { params });

export const getSession = (agentId, flowId, sessionId) => 
    api.get(`/flows/${agentId}/flow/${flowId}/sessions/${sessionId}`);

// =============================================================================
// ANALYTICS
// =============================================================================

export const getFlowAnalytics = (agentId, flowId) => 
    api.get(`/flows/${agentId}/flow/${flowId}/analytics`);

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a flow key from flow name
 */
export const generateFlowKey = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
};

/**
 * Generate a step key from step name
 */
export const generateStepKey = (name) => {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50);
};

/**
 * Slot type options
 */
export const SLOT_TYPES = [
    { value: 'name', label: 'Name', description: 'Person\'s name' },
    { value: 'phone', label: 'Phone Number', description: 'Phone number (auto-normalized)' },
    { value: 'email', label: 'Email', description: 'Email address' },
    { value: 'number', label: 'Number', description: 'Numeric value' },
    { value: 'alphanumeric', label: 'Alphanumeric', description: 'Invoice/Order numbers' },
    { value: 'address', label: 'Address', description: 'Full address' },
    { value: 'city', label: 'City', description: 'City name' },
    { value: 'date', label: 'Date', description: 'Date value' },
    { value: 'time', label: 'Time', description: 'Time value' },
    { value: 'yes_no', label: 'Yes/No', description: 'Boolean response' },
    { value: 'choice', label: 'Choice', description: 'Select from options' },
    { value: 'freeform', label: 'Free Text', description: 'Any text input' }
];

/**
 * Step type options
 */
export const STEP_TYPES = [
    { value: 'collect_slot', label: 'Collect Information', icon: '📝', description: 'Ask user for information' },
    { value: 'confirm', label: 'Confirm Value', icon: '✓', description: 'Confirm a previous answer' },
    { value: 'respond', label: 'Respond', icon: '💬', description: 'Speak a message' },
    { value: 'branch', label: 'Branch', icon: '🔀', description: 'Conditional branching' },
    { value: 'function', label: 'Call Function', icon: '⚡', description: 'Execute a function' },
    { value: 'transfer', label: 'Transfer', icon: '📞', description: 'Transfer to agent' }
];

/**
 * Completion action options
 */
export const COMPLETION_ACTIONS = [
    { value: 'function_call', label: 'Call Function', description: 'Execute a function with collected data' },
    { value: 'transfer', label: 'Transfer Call', description: 'Transfer to human agent' },
    { value: 'respond', label: 'Respond & End', description: 'Speak a message and end' },
    { value: 'end_call', label: 'End Call', description: 'End the call immediately' }
];

/**
 * On retry exceeded options
 */
export const RETRY_EXCEEDED_ACTIONS = [
    { value: 'transfer', label: 'Transfer to Agent', description: 'Transfer call to human' },
    { value: 'skip', label: 'Skip Step', description: 'Skip and continue to next step' },
    { value: 'end', label: 'End Call', description: 'End the call with error message' },
    { value: 'default_value', label: 'Use Default', description: 'Use a default value' }
];

export default {
    getFlows,
    getFlow,
    createFlow,
    updateFlow,
    deleteFlow,
    duplicateFlow,
    getSteps,
    getStep,
    createStep,
    updateStep,
    deleteStep,
    reorderSteps,
    getSessions,
    getSession,
    getFlowAnalytics,
    generateFlowKey,
    generateStepKey,
    SLOT_TYPES,
    STEP_TYPES,
    COMPLETION_ACTIONS,
    RETRY_EXCEEDED_ACTIONS
};
