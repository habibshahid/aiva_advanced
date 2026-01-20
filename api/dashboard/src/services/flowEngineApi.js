/**
 * Flow Engine API Service
 * 
 * API calls for Flow Engine v2:
 * - Flow management
 * - Agent flow configuration
 * - Session inspection
 */

import api from './api';

// ============================================================================
// FLOW CRUD
// ============================================================================

/**
 * List all flows for an agent
 */
export const getFlows = (agentId, includeInactive = false) =>
  api.get(`/flow-engine/agents/${agentId}/flows`, {
    params: { include_inactive: includeInactive }
  });

/**
 * Get a single flow
 */
export const getFlow = (flowId) =>
  api.get(`/flow-engine/flows/${flowId}`);

/**
 * Create a new flow
 */
export const createFlow = (agentId, data) =>
  api.post(`/flow-engine/agents/${agentId}/flows`, data);

/**
 * Update a flow
 */
export const updateFlow = (flowId, data) =>
  api.put(`/flow-engine/flows/${flowId}`, data);

/**
 * Delete a flow
 */
export const deleteFlow = (flowId) =>
  api.delete(`/flow-engine/flows/${flowId}`);

/**
 * Toggle flow active status
 */
export const toggleFlow = (flowId, isActive) =>
  api.post(`/flow-engine/flows/${flowId}/toggle`, { is_active: isActive });

/**
 * Duplicate a flow
 */
export const duplicateFlow = (flowId, name) =>
  api.post(`/flow-engine/flows/${flowId}/duplicate`, { name });

// ============================================================================
// FLOW ENGINE CONTROL
// ============================================================================

/**
 * Get FlowEngine status for an agent
 */
export const getFlowEngineStatus = (agentId) =>
  api.get(`/flow-engine/agents/${agentId}/status`);

/**
 * Get FlowEngine analytics for an agent
 */
export const getFlowAnalytics = (agentId, range = '7d') =>
  api.get(`/flow-engine/agents/${agentId}/analytics`, {
    params: { range }
  });

/**
 * Enable FlowEngine for an agent
 */
export const enableFlowEngine = (agentId) =>
  api.post(`/flow-engine/agents/${agentId}/enable`);

/**
 * Disable FlowEngine for an agent
 */
export const disableFlowEngine = (agentId) =>
  api.post(`/flow-engine/agents/${agentId}/disable`);

/**
 * Initialize system flows for an agent
 */
export const initializeFlows = (agentId) =>
  api.post(`/flow-engine/agents/${agentId}/initialize`);

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * List sessions for an agent
 */
export const listSessions = (agentId, { status, limit = 50, offset = 0 } = {}) =>
  api.get(`/flow-engine/agents/${agentId}/sessions`, {
    params: { status, limit, offset }
  });

/**
 * Get session state
 */
export const getSession = (sessionId) =>
  api.get(`/flow-engine/sessions/${sessionId}`);

/**
 * Close a session
 */
export const closeSession = (sessionId, hard = false) =>
  api.post(`/flow-engine/sessions/${sessionId}/close`, { hard });

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Run cleanup job
 */
export const runCleanup = (timeoutMinutes = 30) =>
  api.post(`/flow-engine/cleanup`, { timeout_minutes: timeoutMinutes });

/**
 * Health check
 */
export const healthCheck = () =>
  api.get(`/flow-engine/health`);

export default {
  // Flows
  getFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow,
  toggleFlow,
  duplicateFlow,
  
  // Control
  getFlowEngineStatus,
  getFlowAnalytics,
  enableFlowEngine,
  disableFlowEngine,
  initializeFlows,
  
  // Sessions
  listSessions,
  getSession,
  closeSession,
  
  // Utils
  runCleanup,
  healthCheck
};