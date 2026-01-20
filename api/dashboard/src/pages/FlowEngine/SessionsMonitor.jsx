/**
 * Flow Engine - Sessions Monitor
 * 
 * View and manage active chat sessions:
 * - List sessions with status
 * - View session details (active flow, context)
 * - Force close sessions
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  RefreshCw,
  Clock,
  User,
  MessageSquare,
  XCircle,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Phone,
  Hash,
  GitBranch,
  Pause,
  Brain,
  Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { listSessions, closeSession, getFlowEngineStatus } from '../../services/flowEngineApi';
import { getAgent } from '../../services/api';

// Status badge colors
const statusColors = {
  active: 'bg-green-100 text-green-700',
  soft_closed: 'bg-yellow-100 text-yellow-700',
  closed: 'bg-gray-100 text-gray-600'
};

const statusIcons = {
  active: <Activity className="w-3 h-3" />,
  soft_closed: <Clock className="w-3 h-3" />,
  closed: <XCircle className="w-3 h-3" />
};

// Format time ago
const timeAgo = (date) => {
  if (!date) return 'Never';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const SessionsMonitor = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [agent, setAgent] = useState(null);
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedSession, setExpandedSession] = useState(null);
  const [closingSession, setClosingSession] = useState(null);
  
  // Auto-refresh interval
  const [autoRefresh, setAutoRefresh] = useState(true);
  
  useEffect(() => {
    loadData();
  }, [agentId, statusFilter]);
  
  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);
    
    return () => clearInterval(interval);
  }, [autoRefresh, agentId, statusFilter]);
  
  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      
      // Load agent
      const agentRes = await getAgent(agentId);
      setAgent(agentRes.data.data || agentRes.data);
      
      // Load status
      const statusRes = await getFlowEngineStatus(agentId);
      setStatus(statusRes.data.data);
      
      // Load sessions
      const sessionsRes = await listSessions(agentId, { 
        status: statusFilter || undefined,
        limit: pagination.limit,
        offset: pagination.offset
      });
      setSessions(sessionsRes.data.data.sessions || []);
      setPagination(sessionsRes.data.data.pagination);
      
    } catch (error) {
      console.error('Error loading sessions:', error);
      if (!silent) toast.error('Failed to load sessions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  const handleCloseSession = async (sessionId, hard = false) => {
    try {
      setClosingSession(sessionId);
      await closeSession(sessionId, hard);
      toast.success(hard ? 'Session closed' : 'Session soft-closed');
      loadData(true);
    } catch (error) {
      console.error('Error closing session:', error);
      toast.error('Failed to close session');
    } finally {
      setClosingSession(null);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  const activeSessions = sessions.filter(s => s.session_status === 'active').length;
  const softClosedSessions = sessions.filter(s => s.session_status === 'soft_closed').length;
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/agents/${agentId}/flows`)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Activity className="w-6 h-6" />
              Active Sessions
            </h1>
            <p className="text-gray-500 mt-1">
              {agent?.name} • {pagination.total} total sessions
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              autoRefresh 
                ? 'bg-green-100 text-green-700' 
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? 'Auto-refresh On' : 'Auto-refresh Off'}
          </button>
          
          {/* Manual refresh */}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-gray-800">{pagination.total}</div>
          <div className="text-sm text-gray-500">Total Sessions</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-green-600">{activeSessions}</div>
          <div className="text-sm text-gray-500">Active</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-yellow-600">{softClosedSessions}</div>
          <div className="text-sm text-gray-500">Soft-closed</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold text-blue-600">
            {status?.sessions_24h?.total_sessions || 0}
          </div>
          <div className="text-sm text-gray-500">Sessions (24h)</div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="soft_closed">Soft-closed</option>
            <option value="closed">Closed</option>
          </select>
          
          {statusFilter && (
            <button
              onClick={() => setStatusFilter('')}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>
      
      {/* Sessions List */}
      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center">
            <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-gray-600 font-medium">No sessions found</h3>
            <p className="text-gray-400 text-sm mt-1">
              {statusFilter 
                ? `No ${statusFilter} sessions at the moment`
                : 'Sessions will appear here when customers start chatting'}
            </p>
          </div>
        ) : (
          sessions.map(session => (
            <SessionCard
              key={session.id}
              session={session}
              isExpanded={expandedSession === session.id}
              onToggle={() => setExpandedSession(
                expandedSession === session.id ? null : session.id
              )}
              onClose={handleCloseSession}
              isClosing={closingSession === session.id}
            />
          ))
        )}
      </div>
      
      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-center gap-4 mt-6">
          <button
            onClick={() => {
              setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }));
              loadData();
            }}
            disabled={pagination.offset === 0}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </span>
          <button
            onClick={() => {
              setPagination(p => ({ ...p, offset: p.offset + p.limit }));
              loadData();
            }}
            disabled={pagination.offset + pagination.limit >= pagination.total}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

// Session Card Component
const SessionCard = ({ session, isExpanded, onToggle, onClose, isClosing }) => {
  const hasActiveFlow = session.active_flow !== null;
  const hasPausedFlows = session.paused_flows && session.paused_flows.length > 0;
  const hasContext = session.context_memory && Object.keys(session.context_memory).length > 0;
  
  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${
      isExpanded ? 'border-blue-300 shadow-sm' : ''
    }`}>
      {/* Header */}
      <div
        onClick={onToggle}
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
      >
        <div className="flex items-center gap-4">
          {/* Status Badge */}
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            statusColors[session.session_status] || statusColors.closed
          }`}>
            {statusIcons[session.session_status]}
            {session.session_status}
          </span>
          
          {/* Channel Info */}
          <div className="flex items-center gap-2 text-gray-600">
            <Phone className="w-4 h-4" />
            <span className="text-sm font-mono">
              {session.channel_user_id || session.channel || 'Unknown'}
            </span>
          </div>
          
          {/* Active Flow Indicator */}
          {hasActiveFlow && (
            <span className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
              <GitBranch className="w-3 h-3" />
              {session.active_flow.flow_id}
            </span>
          )}
          
          {/* Paused Flows Indicator */}
          {hasPausedFlows && (
            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
              <Pause className="w-3 h-3" />
              {session.paused_flows.length} paused
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {/* Last Activity */}
          <span className="text-sm text-gray-500 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {timeAgo(session.last_activity_at)}
          </span>
          
          {/* Expand Icon */}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </div>
      
      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t p-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            {/* Session Info */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Session Info
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">ID:</span>
                  <span className="font-mono text-xs">{session.id.substring(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Channel:</span>
                  <span>{session.channel || 'api'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Started:</span>
                  <span>{new Date(session.start_time).toLocaleString()}</span>
                </div>
                {session.soft_closed_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Soft-closed:</span>
                    <span>{timeAgo(session.soft_closed_at)}</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* Active Flow */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Active Flow
              </h4>
              {hasActiveFlow ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Flow:</span>
                    <span className="font-medium">{session.active_flow.flow_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Step:</span>
                    <span>{session.active_flow.current_step || 'start'}</span>
                  </div>
                  {session.active_flow.params_collected && (
                    <div>
                      <span className="text-gray-500">Collected:</span>
                      <div className="mt-1 p-2 bg-white rounded border text-xs font-mono">
                        {JSON.stringify(session.active_flow.params_collected, null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No active flow</p>
              )}
            </div>
            
            {/* Context Memory */}
            {hasContext && (
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Context Memory
                </h4>
                <div className="p-2 bg-white rounded border text-xs font-mono max-h-32 overflow-auto">
                  {JSON.stringify(session.context_memory, null, 2)}
                </div>
              </div>
            )}
            
            {/* Paused Flows */}
            {hasPausedFlows && (
              <div className="col-span-2">
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Pause className="w-4 h-4" />
                  Paused Flows ({session.paused_flows.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {session.paused_flows.map((flow, i) => (
                    <span 
                      key={i}
                      className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs"
                    >
                      {flow.flow_id} @ {flow.current_step}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Actions */}
          {session.session_status !== 'closed' && (
            <div className="flex items-center gap-3 mt-4 pt-4 border-t">
              {session.session_status === 'active' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(session.id, false);
                  }}
                  disabled={isClosing}
                  className="flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm"
                >
                  <Clock className="w-4 h-4" />
                  {isClosing ? 'Closing...' : 'Soft Close'}
                </button>
              )}
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Are you sure you want to permanently close this session?')) {
                    onClose(session.id, true);
                  }
                }}
                disabled={isClosing}
                className="flex items-center gap-2 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm"
              >
                <XCircle className="w-4 h-4" />
                {isClosing ? 'Closing...' : 'Hard Close'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionsMonitor;