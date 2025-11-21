import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  CreditCard
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import AnalyticsService from '../../services/AnalyticsService';

const CostAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [costOverview, setCostOverview] = useState(null);
  const [costTrends, setCostTrends] = useState([]);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [agentPerformance, setAgentPerformance] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    date_from: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    channel: ''
  });

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { ...filters };
      if (!params.channel) delete params.channel;

      const [overviewRes, trendsRes, breakdownRes, agentsRes] = await Promise.all([
        AnalyticsService.getCostOverview(params),
        AnalyticsService.getCostTrends(params),
        AnalyticsService.getCostBreakdown(params),
        AnalyticsService.getAgentPerformance(params)
      ]);

      setCostOverview(overviewRes.data.data);
      setCostTrends(trendsRes.data.data.trends || []);
      setCostBreakdown(breakdownRes.data.data.breakdown || []);
      setAgentPerformance(agentsRes.data.data.agents || []);

    } catch (err) {
      console.error('Failed to fetch cost analytics:', err);
      setError(err.response?.data?.message || 'Failed to load cost analytics');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchAllData();
  };

  // Get avatar initials
  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  // Get avatar gradient
  const getAvatarGradient = (index) => {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    ];
    return gradients[index % gradients.length];
  };

  if (loading && !costOverview) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <DollarSign className="w-16 h-16 text-primary-600 mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-gray-600">Loading cost analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-2">
            <a href="/analytics" className="text-primary-600 hover:text-primary-700">Dashboard</a>
            {' '}/{' '}
            Cost Analytics & Performance
          </div>
          <h1 className="text-3xl font-bold text-gray-900">💰 Cost Analytics & Agent Performance</h1>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          />
          
          <select
            value={filters.channel}
            onChange={(e) => setFilters(prev => ({ ...prev, channel: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          >
            <option value="">All Channels</option>
            <option value="voice">Voice Calls</option>
            <option value="chat">Chat Messages</option>
          </select>

          <button
            onClick={applyFilters}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold"
          >
            Apply Filters
          </button>

          <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Credit Usage Overview */}
      {costOverview && (
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-lg shadow-lg p-8">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
              <CreditCard className="w-8 h-8" />
              <h2 className="text-2xl font-bold">Current Credit Balance</h2>
            </div>
            <div className="text-4xl font-bold">
              ${parseFloat(costOverview.credits.balance).toFixed(2)}
            </div>
          </div>
          
          <div className="mb-6">
            <div className="h-5 bg-white/30 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${costOverview.credits.usage_percentage}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-sm opacity-90 mb-1">Total Purchased</div>
              <div className="text-2xl font-bold">${parseFloat(costOverview.credits.purchased).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Used This Period</div>
              <div className="text-2xl font-bold">${parseFloat(costOverview.credits.used_period).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Total Used</div>
              <div className="text-2xl font-bold">${parseFloat(costOverview.credits.used_total).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-sm opacity-90 mb-1">Estimated Remaining Days</div>
              <div className="text-2xl font-bold">{costOverview.credits.estimated_days_remaining} days</div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Breakdown Metrics */}
      {costOverview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Cost */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
            <div className="text-sm text-gray-500 uppercase font-semibold mb-2">Total Cost</div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              ${parseFloat(costOverview.period.total_cost).toFixed(2)}
            </div>
            <div className="text-sm text-gray-500 mb-2">
              {costOverview.period.total_interactions.toLocaleString()} interactions
            </div>
            <div className="text-sm text-red-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              9.8% from last period
            </div>
          </div>

          {/* LLM Completions */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-pink-500">
            <div className="text-sm text-gray-500 uppercase font-semibold mb-2">LLM Completions</div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              ${parseFloat(costOverview.period.llm_cost).toFixed(2)}
            </div>
            <div className="text-sm text-gray-500 mb-2">
              {costOverview.period.llm_percentage}% of total
            </div>
            <div className="text-sm text-red-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              11.2% from last period
            </div>
          </div>

          {/* Transcription */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500 uppercase font-semibold mb-2">Transcription</div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              ${parseFloat(costOverview.period.transcription_cost).toFixed(2)}
            </div>
            <div className="text-sm text-gray-500 mb-2">
              {costOverview.period.transcription_percentage}% of total
            </div>
            <div className="text-sm text-red-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              8.5% from last period
            </div>
          </div>

          {/* Analysis Services */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
            <div className="text-sm text-gray-500 uppercase font-semibold mb-2">Analysis Services</div>
            <div className="text-3xl font-bold text-gray-900 mb-2">
              ${parseFloat(costOverview.period.analysis_cost).toFixed(2)}
            </div>
            <div className="text-sm text-gray-500 mb-2">
              {costOverview.period.analysis_percentage}% of total
            </div>
            <div className="text-sm text-green-600 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              2.3% from last period
            </div>
          </div>
        </div>
      )}

      {/* Daily Cost Trends */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
          📈 Daily Cost Trends
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={costTrends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis tickFormatter={(value) => `$${value.toFixed(2)}`} />
            <Tooltip 
              formatter={(value) => `$${parseFloat(value).toFixed(2)}`}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
            />
            <Legend />
            <Line type="monotone" dataKey="llm_cost" stroke="#f093fb" strokeWidth={2} name="LLM" />
            <Line type="monotone" dataKey="transcription_cost" stroke="#4facfe" strokeWidth={2} name="Transcription" />
            <Line type="monotone" dataKey="analysis_cost" stroke="#43e97b" strokeWidth={2} name="Analysis" />
            <Line type="monotone" dataKey="total_cost" stroke="#667eea" strokeWidth={3} name="Total" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown and Cost per Interaction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Detailed Cost Breakdown */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            💸 Detailed Cost Breakdown
          </h2>
          <ul className="space-y-3">
            {costBreakdown.map((item, idx) => (
              <li 
                key={idx}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-2xl">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">${item.cost.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">{item.percentage}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Cost per Interaction */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            📊 Cost per Interaction
          </h2>
          <div className="h-80 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center text-white text-center p-8">
            <div>
              <div className="text-xl font-semibold mb-2">Bar Chart: Average Cost by Type</div>
              <div className="text-sm opacity-90">
                Voice Calls vs Chat Messages
              </div>
              <div className="text-xs opacity-75 mt-4">
                (Requires additional data aggregation)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Performance */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            👥 Agent Performance Metrics
          </h2>
        </div>
        
        <ul className="divide-y divide-gray-200">
          {agentPerformance.map((agent, idx) => (
            <li key={agent.agent_id} className="p-6 hover:bg-gray-50 transition-colors">
              {/* Agent Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ background: getAvatarGradient(idx) }}
                  >
                    {getInitials(agent.agent_name)}
                  </div>
                  <div>
                    <div className="text-base font-semibold text-gray-900">{agent.agent_name}</div>
                    <div className="text-sm text-gray-500">{agent.agent_email || 'Support Agent'}</div>
                  </div>
                </div>
                <div>
                  <span className={`px-4 py-2 rounded-full text-sm font-bold text-white ${
                    agent.performance_grade === 'good' ? 'bg-gradient-to-r from-green-500 to-green-600' :
                    agent.performance_grade === 'average' ? 'bg-gradient-to-r from-orange-500 to-orange-600' :
                    'bg-gradient-to-r from-red-500 to-red-600'
                  }`}>
                    {agent.performance_score}%
                  </span>
                </div>
              </div>

              {/* Agent Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Total Interactions</div>
                  <div className="text-lg font-bold text-gray-900">{agent.total_interactions}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Avg Sentiment</div>
                  <div className="text-lg font-bold" style={{ 
                    color: parseFloat(agent.avg_sentiment) >= 0.7 ? '#2ecc71' : 
                           parseFloat(agent.avg_sentiment) >= 0.5 ? '#f39c12' : '#e74c3c'
                  }}>
                    {agent.avg_sentiment}
                  </div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Resolution Rate</div>
                  <div className="text-lg font-bold text-gray-900">{agent.resolution_rate}%</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Avg Duration</div>
                  <div className="text-lg font-bold text-gray-900">{agent.avg_duration_formatted}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Total Cost</div>
                  <div className="text-lg font-bold text-gray-900">${agent.total_cost}</div>
                </div>
                <div className="bg-white p-3 rounded-lg border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase mb-1">Cost/Interaction</div>
                  <div className="text-lg font-bold text-gray-900">${agent.cost_per_interaction}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default CostAnalytics;