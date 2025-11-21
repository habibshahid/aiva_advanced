import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Phone, 
  MessageSquare, 
  DollarSign,
  Users,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ThumbsDown,
  Download
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import AnalyticsService from '../../services/AnalyticsService';

const OverviewDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [agents, setAgents] = useState([]);
  const [intents, setIntents] = useState([]);
  const [topics, setTopics] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [costBreakdown, setCostBreakdown] = useState([]);
  
  const [filters, setFilters] = useState({
    date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    agent_id: ''
  });
  
  const [agentsList, setAgentsList] = useState([]);

  // Fetch agents list
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await AnalyticsService.getOverviewAgents();
        setAgentsList(response.data.data.agents || []);
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
  }, []);

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, [filters]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { ...filters };
      if (!params.agent_id) delete params.agent_id;

      const [summaryRes, trendsRes, agentsRes, intentsRes, topicsRes, keywordsRes, costsRes] = await Promise.all([
        AnalyticsService.getOverviewSummary(params),
        AnalyticsService.getOverviewTrends(params),
        AnalyticsService.getOverviewAgents(params),
        AnalyticsService.getAdvancedIntents(params),
        AnalyticsService.getAdvancedTopics(params),
        AnalyticsService.getAdvancedTopics(params), // Using topics for keywords too
        AnalyticsService.getCostBreakdown(params)
      ]);

      setSummary(summaryRes.data.data);
      setTrends(trendsRes.data.data.trends || []);
      setAgents(agentsRes.data.data.agents || []);
      setIntents(intentsRes.data.data.intents || []);
      setTopics(topicsRes.data.data.topics || []);
      setKeywords(topicsRes.data.data.keywords || []);
      setCostBreakdown(costsRes.data.data.breakdown || []);

    } catch (err) {
      console.error('Failed to fetch overview data:', err);
      setError(err.response?.data?.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchAllData();
  };

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Activity className="w-16 h-16 text-primary-600 mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-gray-600">Loading analytics dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate negative sentiment alert
  const negativeCount = summary?.negative_count || 0;
  const showAlert = negativeCount > 10;

  // Sentiment distribution data for pie chart
  const sentimentData = [
    { name: 'Positive', value: summary?.positive_percentage || 0, color: '#2ecc71' },
    { name: 'Neutral', value: summary?.neutral_percentage || 0, color: '#95a5a6' },
    { name: 'Negative', value: summary?.negative_percentage || 0, color: '#e74c3c' },
    { name: 'Mixed', value: summary?.mixed_percentage || 0, color: '#f39c12' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-2">
            <a href="/analytics" className="text-primary-600 hover:text-primary-700">Dashboard</a>
            {' '}/{' '}
            Overview
          </div>
          <h1 className="text-3xl font-bold text-gray-900">📊 Analytics Dashboard</h1>
          <p className="text-gray-600 mt-2">Complete overview of your AiVA platform performance</p>
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
            value={filters.agent_id}
            onChange={(e) => setFilters(prev => ({ ...prev, agent_id: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          >
            <option value="">All Agents</option>
            {agentsList.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
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

      {/* Alert Box */}
      {showAlert && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-yellow-800 font-semibold text-base mb-1">Action Required</h3>
              <p className="text-yellow-700 text-sm">
                {negativeCount} interactions detected with negative sentiment today. Consider reviewing for quality improvement.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Interactions */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <Activity className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Total Interactions</div>
              <div className="text-4xl font-bold mb-2">{(summary.total_interactions || 0).toLocaleString()}</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                12.5% from last period
              </div>
            </div>
          </div>

          {/* Voice Calls */}
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <Phone className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Voice Calls</div>
              <div className="text-4xl font-bold mb-2">{(summary.total_calls || 0).toLocaleString()}</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                8.3% from last period
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <MessageSquare className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Chat Messages</div>
              <div className="text-4xl font-bold mb-2">{(summary.total_chats || 0).toLocaleString()}</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                15.7% from last period
              </div>
            </div>
          </div>

          {/* Avg Call Duration */}
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <Clock className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Avg Call Duration</div>
              <div className="text-4xl font-bold mb-2">
                {Math.floor((summary.avg_call_duration || 0) / 60)}:{String(Math.round((summary.avg_call_duration || 0) % 60)).padStart(2, '0')}
              </div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1 rotate-180" />
                5.2% from last period
              </div>
            </div>
          </div>

          {/* Customer Satisfaction */}
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <CheckCircle className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Customer Satisfaction</div>
              <div className="text-4xl font-bold mb-2">{(summary.satisfaction_rate || 0).toFixed(1)}%</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                3.1% from last period
              </div>
            </div>
          </div>

          {/* Issue Resolution Rate */}
          <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <CheckCircle className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Issue Resolution Rate</div>
              <div className="text-4xl font-bold mb-2">{(summary.resolution_rate || 0).toFixed(1)}%</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                6.4% from last period
              </div>
            </div>
          </div>

          {/* Profanity Incidents */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <AlertCircle className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Profanity Incidents</div>
              <div className="text-4xl font-bold mb-2">{summary.profanity_incidents || 0}</div>
              <div className="flex items-center text-sm opacity-90">
                <AlertTriangle className="w-4 h-4 mr-1" />
                Monitor closely
              </div>
            </div>
          </div>

          {/* Total Cost */}
          <div className="bg-gradient-to-br from-pink-500 to-pink-600 text-white rounded-lg shadow-lg p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 opacity-20">
              <DollarSign className="w-32 h-32" />
            </div>
            <div className="relative">
              <div className="text-sm uppercase tracking-wide opacity-90 mb-2">Total Cost (USD)</div>
              <div className="text-4xl font-bold mb-2">${(summary.total_cost || 0).toFixed(2)}</div>
              <div className="flex items-center text-sm opacity-90">
                <TrendingUp className="w-4 h-4 mr-1" />
                9.8% from last period
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Interaction Trends */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            📈 Interaction Trends (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(date) => new Date(date).toLocaleDateString()}
              />
              <Legend />
              <Line type="monotone" dataKey="calls" stroke="#8b5cf6" strokeWidth={2} name="Voice Calls" />
              <Line type="monotone" dataKey="chats" stroke="#10b981" strokeWidth={2} name="Chat Sessions" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sentiment Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            😊 Sentiment Distribution
          </h2>
          <div className="space-y-4">
            {sentimentData.map((sentiment, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: sentiment.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-700">{sentiment.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{sentiment.value.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${sentiment.value}%`,
                      backgroundColor: sentiment.color
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Insights Grid */}
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		  {/* Top Customer Intents */}
		  <div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
			  🎯 Top Customer Intents
			</h3>
			<ul className="space-y-3">
			  {intents.slice(0, 5).map((intent, idx) => (
				<li key={idx} className="flex items-center justify-between text-sm">
				  <span className="text-gray-600">{intent.intent || intent.name}</span>
				  <span className="font-semibold text-gray-900">
					{intent.count} ({parseFloat(intent.percentage || 0).toFixed(0)}%)
				  </span>
				</li>
			  ))}
			  {intents.length === 0 && (
				<li className="text-gray-500 text-sm">No data available</li>
			  )}
			</ul>
		  </div>

		  {/* Most Discussed Topics */}
		  <div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
			  💬 Most Discussed Topics
			</h3>
			<ul className="space-y-3">
			  {topics.slice(0, 5).map((topic, idx) => (
				<li key={idx} className="flex items-center justify-between text-sm">
				  <span className="text-gray-600">{topic.topic || topic.name}</span>
				  <span className="font-semibold text-gray-900">{topic.count} mentions</span>
				</li>
			  ))}
			  {topics.length === 0 && (
				<li className="text-gray-500 text-sm">No data available</li>
			  )}
			</ul>
		  </div>

		  {/* Top Keywords */}
		  <div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
			  🔑 Top Keywords
			</h3>
			<ul className="space-y-3">
			  {keywords.slice(0, 5).map((keyword, idx) => (
				<li key={idx} className="flex items-center justify-between text-sm">
				  <span className="text-gray-600">{keyword.keyword || keyword.word}</span>
				  <span className="font-semibold text-gray-900">{keyword.count} times</span>
				</li>
			  ))}
			  {keywords.length === 0 && (
				<li className="text-gray-500 text-sm">No data available</li>
			  )}
			</ul>
		  </div>

		  {/* Cost Breakdown */}
		  <div className="bg-white rounded-lg shadow p-6">
			<h3 className="text-base font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-200 flex items-center gap-2">
			  💰 Cost Breakdown
			</h3>
			<ul className="space-y-3">
			  {costBreakdown.slice(0, 5).map((item, idx) => (
				<li key={idx} className="flex items-center justify-between text-sm">
				  <span className="text-gray-600">{item.category || item.name || item.type}</span>
				  <span className="font-semibold text-gray-900">
					${parseFloat(item.cost || 0).toFixed(2)} ({parseFloat(item.percentage || 0).toFixed(1)}%)
				  </span>
				</li>
			  ))}
			  {costBreakdown.length === 0 && (
				<li className="text-gray-500 text-sm">No data available</li>
			  )}
			</ul>
		  </div>
		</div>

      {/* Top Performing Agents */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
          👥 Top Performing Agents
        </h2>
        {agents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.slice(0, 6).map((agent, idx) => (
              <div key={agent.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center flex-1">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center text-primary-700 font-bold">
                    #{idx + 1}
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-500">
                      {agent.total_interactions} interactions • {(agent.avg_sentiment * 100).toFixed(0)}% sentiment
                    </p>
                  </div>
                </div>
                <div className="text-sm font-semibold text-gray-900">
                  ${(agent.total_cost || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No agent data available</p>
        )}
      </div>

      {/* Status Summary */}
      {summary && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-center flex-wrap gap-6 text-sm">
            <div className="flex items-center">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-gray-700">Completed Calls: <strong>{summary.completed_calls}</strong></span>
            </div>
            <div className="flex items-center">
              <XCircle className="w-4 h-4 text-red-500 mr-2" />
              <span className="text-gray-700">Failed Calls: <strong>{summary.failed_calls}</strong></span>
            </div>
            <div className="flex items-center">
              <Phone className="w-4 h-4 text-purple-500 mr-2" />
              <span className="text-gray-700">Call Costs: <strong>${(summary.call_costs || 0).toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center">
              <MessageSquare className="w-4 h-4 text-green-500 mr-2" />
              <span className="text-gray-700">Chat Costs: <strong>${(summary.chat_costs || 0).toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center">
              <Users className="w-4 h-4 text-blue-500 mr-2" />
              <span className="text-gray-700">Active Agents: <strong>{summary.active_agents}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OverviewDashboard;