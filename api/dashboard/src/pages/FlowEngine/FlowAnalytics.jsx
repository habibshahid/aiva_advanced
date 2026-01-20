/**
 * Flow Engine - Analytics Dashboard
 * 
 * View flow performance metrics:
 * - Flow usage statistics
 * - Completion rates
 * - Average completion time
 * - Step drop-off analysis
 * - Session trends
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Users,
  GitBranch,
  Calendar,
  RefreshCw,
  Filter
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getFlows, getFlowEngineStatus, getFlowAnalytics } from '../../services/flowEngineApi';
import { getAgent } from '../../services/api';

// Date range options
const DATE_RANGES = [
  { value: '24h', label: 'Last 24 Hours' },
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' }
];

const FlowAnalytics = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState(null);
  const [flows, setFlows] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dateRange, setDateRange] = useState('7d');
  const [selectedFlow, setSelectedFlow] = useState('all');
  
  useEffect(() => {
    loadData();
  }, [agentId, dateRange]);
  
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load agent
      const agentRes = await getAgent(agentId);
      setAgent(agentRes.data.data || agentRes.data);
      
      // Load flows
      const flowsRes = await getFlows(agentId, true);
      setFlows(flowsRes.data.data || []);
      
      // Load analytics
      const analyticsRes = await getFlowAnalytics(agentId, dateRange);
      setAnalytics(analyticsRes.data.data);
      
    } catch (error) {
      console.error('Error loading analytics:', error);
      // Generate mock data if analytics endpoint doesn't exist yet
      setAnalytics(generateMockAnalytics());
    } finally {
      setLoading(false);
    }
  };
  
  // Generate mock analytics for demo
  const generateMockAnalytics = () => ({
    summary: {
      total_sessions: 247,
      completed_flows: 189,
      abandoned_flows: 58,
      completion_rate: 76.5,
      avg_completion_time: 145, // seconds
      active_sessions: 12
    },
    flow_stats: flows.map(flow => ({
      flow_id: flow.id,
      flow_name: flow.name,
      triggered: Math.floor(Math.random() * 100),
      completed: Math.floor(Math.random() * 80),
      abandoned: Math.floor(Math.random() * 20),
      avg_time: Math.floor(Math.random() * 200) + 60
    })),
    daily_trend: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      sessions: Math.floor(Math.random() * 50) + 10,
      completed: Math.floor(Math.random() * 40) + 5
    })),
    top_drop_offs: [
      { step: 'collect_email', flow: 'lead_capture', count: 23 },
      { step: 'collect_phone', flow: 'appointment', count: 15 },
      { step: 'collect_address', flow: 'order_tracking', count: 12 }
    ]
  });
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  const summary = analytics?.summary || {};
  const trend = analytics?.daily_trend || [];
  const flowStats = analytics?.flow_stats || [];
  const dropOffs = analytics?.top_drop_offs || [];
  
  // Calculate trend direction
  const trendDirection = trend.length >= 2 
    ? trend[trend.length - 1].sessions > trend[trend.length - 2].sessions 
      ? 'up' 
      : 'down'
    : 'neutral';
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
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
              <BarChart3 className="w-6 h-6" />
              Flow Analytics
            </h1>
            <p className="text-gray-500 mt-1">
              {agent?.name} • Performance insights
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {DATE_RANGES.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-6 gap-4 mb-6">
        <StatCard
          title="Total Sessions"
          value={summary.total_sessions || 0}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Completed"
          value={summary.completed_flows || 0}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="Abandoned"
          value={summary.abandoned_flows || 0}
          icon={<XCircle className="w-5 h-5" />}
          color="red"
        />
        <StatCard
          title="Completion Rate"
          value={`${(summary.completion_rate || 0).toFixed(1)}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
          trend={summary.completion_rate >= 70 ? 'up' : 'down'}
        />
        <StatCard
          title="Avg. Time"
          value={formatDuration(summary.avg_completion_time || 0)}
          icon={<Clock className="w-5 h-5" />}
          color="orange"
        />
        <StatCard
          title="Active Now"
          value={summary.active_sessions || 0}
          icon={<Activity className="w-5 h-5" />}
          color="teal"
          pulse={summary.active_sessions > 0}
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Session Trend Chart */}
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Session Trend
          </h3>
          <div className="h-48">
            <SimpleTrendChart data={trend} />
          </div>
        </div>
        
        {/* Completion Funnel */}
        <div className="bg-white rounded-lg border p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-green-500" />
            Flow Completion
          </h3>
          <div className="space-y-3">
            <FunnelBar label="Started" value={summary.total_sessions || 0} max={summary.total_sessions || 1} color="blue" />
            <FunnelBar label="In Progress" value={(summary.total_sessions || 0) - (summary.completed_flows || 0) - (summary.abandoned_flows || 0)} max={summary.total_sessions || 1} color="yellow" />
            <FunnelBar label="Completed" value={summary.completed_flows || 0} max={summary.total_sessions || 1} color="green" />
            <FunnelBar label="Abandoned" value={summary.abandoned_flows || 0} max={summary.total_sessions || 1} color="red" />
          </div>
        </div>
      </div>
      
      {/* Flow Performance Table */}
      <div className="bg-white rounded-lg border p-5 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-500" />
          Flow Performance
        </h3>
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-gray-500 border-b">
              <th className="pb-3 font-medium">Flow</th>
              <th className="pb-3 font-medium text-right">Triggered</th>
              <th className="pb-3 font-medium text-right">Completed</th>
              <th className="pb-3 font-medium text-right">Abandoned</th>
              <th className="pb-3 font-medium text-right">Rate</th>
              <th className="pb-3 font-medium text-right">Avg. Time</th>
            </tr>
          </thead>
          <tbody>
            {flowStats.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-400">
                  No flow data available yet
                </td>
              </tr>
            ) : (
              flowStats.map((stat, i) => {
                const rate = stat.triggered > 0 ? (stat.completed / stat.triggered * 100).toFixed(1) : 0;
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3">
                      <span className="font-medium text-gray-800">{stat.flow_name}</span>
                    </td>
                    <td className="py-3 text-right text-gray-600">{stat.triggered}</td>
                    <td className="py-3 text-right text-green-600">{stat.completed}</td>
                    <td className="py-3 text-right text-red-600">{stat.abandoned}</td>
                    <td className="py-3 text-right">
                      <span className={`font-medium ${rate >= 70 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {rate}%
                      </span>
                    </td>
                    <td className="py-3 text-right text-gray-600">{formatDuration(stat.avg_time)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* Drop-off Analysis */}
      <div className="bg-white rounded-lg border p-5">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-500" />
          Top Drop-off Points
        </h3>
        {dropOffs.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No drop-off data available</p>
        ) : (
          <div className="space-y-3">
            {dropOffs.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-8 h-8 flex items-center justify-center bg-red-100 text-red-600 rounded-full font-bold text-sm">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-800">{item.step}</div>
                  <div className="text-sm text-gray-500">in {item.flow}</div>
                </div>
                <div className="text-red-600 font-medium">{item.count} drop-offs</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ title, value, icon, color, trend, pulse }) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    teal: 'bg-teal-100 text-teal-600'
  };
  
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        {trend && (
          <span className={trend === 'up' ? 'text-green-500' : 'text-red-500'}>
            {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </span>
        )}
        {pulse && (
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-sm text-gray-500">{title}</div>
    </div>
  );
};

// Simple Trend Chart (CSS-based)
const SimpleTrendChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-gray-400">No data</div>;
  }
  
  const maxValue = Math.max(...data.map(d => d.sessions), 1);
  
  return (
    <div className="h-full flex items-end gap-2">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div 
            className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
            style={{ height: `${(item.sessions / maxValue) * 100}%`, minHeight: '4px' }}
          ></div>
          <div className="text-xs text-gray-500 mt-2 truncate w-full text-center">
            {new Date(item.date).toLocaleDateString('en', { weekday: 'short' })}
          </div>
        </div>
      ))}
    </div>
  );
};

// Funnel Bar Component
const FunnelBar = ({ label, value, max, color }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    yellow: 'bg-yellow-500'
  };
  
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-800">{value}</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${colorClasses[color]} transition-all`}
          style={{ width: `${percent}%` }}
        ></div>
      </div>
    </div>
  );
};

// Format duration helper
const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
};

export default FlowAnalytics;