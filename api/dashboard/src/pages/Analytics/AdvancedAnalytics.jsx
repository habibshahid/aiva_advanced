import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Target,
  AlertTriangle,
  Tag,
  Globe,
  Smile,
  Download
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

const AdvancedAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [sentimentTrends, setSentimentTrends] = useState([]);
  const [topIntents, setTopIntents] = useState([]);
  const [profanityStats, setProfanityStats] = useState(null);
  const [topKeywords, setTopKeywords] = useState([]);
  const [languageDistribution, setLanguageDistribution] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    channel: '',
    agent_id: ''
  });

  const [agents, setAgents] = useState([]);

  // Fetch agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await AnalyticsService.getAgentsList();
        setAgents(response.data.data.agents || []);
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
  }, []);

  // Fetch all analytics
  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { ...filters };
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      // Fetch all analytics in parallel
      const [
        trendsRes,
        intentsRes,
        profanityRes,
        keywordsRes,
        languageRes
      ] = await Promise.all([
        AnalyticsService.getSentimentTrends(params),
        AnalyticsService.getTopIntents({ ...params, limit: 5 }),
        AnalyticsService.getProfanityStats(params),
        AnalyticsService.getTopKeywords({ ...params, limit: 15 }),
        AnalyticsService.getLanguageDistribution(params)
      ]);

      setSentimentTrends(trendsRes.data.data.trends || []);
      setTopIntents(intentsRes.data.data.intents || []);
      setProfanityStats(profanityRes.data.data || {});
      setTopKeywords(keywordsRes.data.data.keywords || []);
      setLanguageDistribution(languageRes.data.data.distribution || []);

    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError(err.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const applyFilters = () => {
    fetchAnalytics();
  };

  // Intent icons mapping
  const getIntentIcon = (intent) => {
    const icons = {
      'Product Inquiry': '🛍️',
      'Support Request': '🆘',
      'Order Status': '📦',
      'Complaint': '😠',
      'Return/Refund': '↩️',
      'Billing': '💳',
      'Technical Support': '🔧',
      'Account': '👤',
      'General Inquiry': '❓'
    };
    return icons[intent] || '💬';
  };

  // Language flags
  const getLanguageFlag = (lang) => {
    const flags = {
      'english': '🇺🇸',
      'en': '🇺🇸',
      'spanish': '🇪🇸',
      'es': '🇪🇸',
      'urdu': '🇵🇰',
      'ur': '🇵🇰',
      'french': '🇫🇷',
      'fr': '🇫🇷',
      'arabic': '🇸🇦',
      'ar': '🇸🇦',
      'chinese': '🇨🇳',
      'zh': '🇨🇳'
    };
    return flags[lang.toLowerCase()] || '🌐';
  };

  // Language names
  const getLanguageName = (code) => {
    const names = {
      'en': 'English',
      'es': 'Spanish',
      'ur': 'Urdu',
      'fr': 'French',
      'ar': 'Arabic',
      'zh': 'Chinese'
    };
    return names[code] || code.toUpperCase();
  };

  // Topic colors
  const topicColors = [
    'linear-gradient(135deg, #e74c3c, #c0392b)',
    'linear-gradient(135deg, #3498db, #2980b9)',
    'linear-gradient(135deg, #f39c12, #e67e22)',
    'linear-gradient(135deg, #9b59b6, #8e44ad)',
    'linear-gradient(135deg, #1abc9c, #16a085)',
    'linear-gradient(135deg, #34495e, #2c3e50)'
  ];

  if (loading && sentimentTrends.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <TrendingUp className="w-16 h-16 text-primary-600 mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-gray-600">Loading advanced analytics...</p>
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
            Advanced Analytics
          </div>
          <h1 className="text-3xl font-bold text-gray-900">🔬 Advanced Analytics</h1>
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

          <select
            value={filters.agent_id}
            onChange={(e) => setFilters(prev => ({ ...prev, agent_id: e.target.value }))}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
          >
            <option value="">All Agents</option>
            {agents.map(agent => (
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

      {/* Sentiment Trends Line Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
          📈 Sentiment Trends Over Time
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sentimentTrends}>
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
            <Line type="monotone" dataKey="positive" stroke="#2ecc71" strokeWidth={2} name="Positive" />
            <Line type="monotone" dataKey="neutral" stroke="#95a5a6" strokeWidth={2} name="Neutral" />
            <Line type="monotone" dataKey="negative" stroke="#e74c3c" strokeWidth={2} name="Negative" />
            <Line type="monotone" dataKey="mixed" stroke="#f39c12" strokeWidth={2} name="Mixed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Daily Sentiment Distribution & Top Intents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Sentiment Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            📊 Daily Sentiment Distribution
          </h2>
          <div className="space-y-5">
            {sentimentTrends.slice(0, 7).reverse().map((day, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="min-w-[80px] text-sm font-semibold text-gray-500">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="flex-1 h-10 bg-gray-100 rounded-lg overflow-hidden">
                  <div className="h-full flex">
                    {parseFloat(day.positive_pct) > 0 && (
                      <div 
                        className="bg-green-500 flex items-center justify-center text-white text-xs font-semibold hover:brightness-110 transition-all"
                        style={{ width: `${day.positive_pct}%` }}
                      >
                        {parseFloat(day.positive_pct) > 10 && `${day.positive_pct}%`}
                      </div>
                    )}
                    {parseFloat(day.neutral_pct) > 0 && (
                      <div 
                        className="bg-gray-400 flex items-center justify-center text-white text-xs font-semibold hover:brightness-110 transition-all"
                        style={{ width: `${day.neutral_pct}%` }}
                      >
                        {parseFloat(day.neutral_pct) > 10 && `${day.neutral_pct}%`}
                      </div>
                    )}
                    {parseFloat(day.negative_pct) > 0 && (
                      <div 
                        className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold hover:brightness-110 transition-all"
                        style={{ width: `${day.negative_pct}%` }}
                      >
                        {parseFloat(day.negative_pct) > 10 && `${day.negative_pct}%`}
                      </div>
                    )}
                    {parseFloat(day.mixed_pct) > 0 && (
                      <div 
                        className="bg-orange-500 flex items-center justify-center text-white text-xs font-semibold hover:brightness-110 transition-all"
                        style={{ width: `${day.mixed_pct}%` }}
                      >
                        {parseFloat(day.mixed_pct) > 10 && `${day.mixed_pct}%`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Customer Intents */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            🎯 Top Customer Intents
          </h2>
          <ul className="space-y-3">
            {topIntents.map((item, idx) => (
              <li 
                key={idx}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all hover:translate-x-1"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center text-2xl">
                    {getIntentIcon(item.intent)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{item.intent}</div>
                    <div className="text-xs text-gray-500">Customer requests</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{item.count}</div>
                  <div className="text-sm text-gray-500">{item.percentage}%</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Profanity Tracking */}
      {profanityStats && profanityStats.total_incidents > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Profanity Incidents Detected
              </h2>
              <div className="text-3xl font-bold text-red-600">
                {profanityStats.total_incidents} Total
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Sessions</div>
                <div className="text-xl font-bold text-red-600">
                  {profanityStats.sessions_with_profanity}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Severity: Low</div>
                <div className="text-xl font-bold text-red-600">
                  {profanityStats.by_severity?.low || 0}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Severity: Medium</div>
                <div className="text-xl font-bold text-red-600">
                  {profanityStats.by_severity?.medium || 0}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Severity: High</div>
                <div className="text-xl font-bold text-red-600">
                  {profanityStats.by_severity?.high || 0}
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg text-center">
                <div className="text-xs text-gray-500 uppercase mb-1">Avg Score</div>
                <div className="text-xl font-bold text-red-600">
                  {profanityStats.avg_score}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keywords & Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Keywords */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            🔑 Top Keywords
          </h2>
          <div className="flex flex-wrap gap-3">
            {topKeywords.map((item, idx) => (
              <div
                key={idx}
                className="px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold flex items-center gap-2 hover:shadow-lg hover:-translate-y-1 transition-all cursor-pointer"
                style={{ 
                  fontSize: `${14 - (idx * 0.5)}px`,
                  opacity: 1 - (idx * 0.03)
                }}
              >
                <span>{item.keyword}</span>
                <span className="bg-white/30 px-2 py-0.5 rounded-full text-xs">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Topic Heatmap (using top intents as topics) */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            💬 Topic Heatmap
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {topIntents.slice(0, 6).map((item, idx) => (
              <div
                key={idx}
                className="aspect-square rounded-lg text-white font-semibold flex flex-col items-center justify-center p-3 hover:scale-105 transition-all cursor-pointer"
                style={{ background: topicColors[idx] }}
              >
                <div className="text-sm text-center mb-2">{item.intent.split(' ')[0]}</div>
                <div className="text-2xl font-bold">{item.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Language Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            🌍 Language Distribution
          </h2>
          <div className="space-y-5">
            {languageDistribution.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="text-4xl">{getLanguageFlag(item.language)}</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900 mb-2">
                    {getLanguageName(item.language)}
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-600 to-blue-600 rounded-full transition-all"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
                <div className="text-right min-w-[100px]">
                  <div className="text-lg font-bold text-gray-900">{item.percentage}%</div>
                  <div className="text-xs text-gray-500">{item.count} interactions</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emotion Detection Placeholder */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            😊 Emotion Detection
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: '😊', label: 'Happy', count: sentimentTrends.reduce((sum, d) => sum + d.positive, 0) },
              { icon: '😐', label: 'Neutral', count: sentimentTrends.reduce((sum, d) => sum + d.neutral, 0) },
              { icon: '😠', label: 'Frustrated', count: sentimentTrends.reduce((sum, d) => sum + d.negative, 0) },
              { icon: '😕', label: 'Confused', count: Math.floor(sentimentTrends.reduce((sum, d) => sum + d.mixed, 0) * 0.6) },
              { icon: '😌', label: 'Satisfied', count: Math.floor(sentimentTrends.reduce((sum, d) => sum + d.positive, 0) * 0.5) },
              { icon: '😤', label: 'Angry', count: Math.floor(sentimentTrends.reduce((sum, d) => sum + d.negative, 0) * 0.4) }
            ].map((emotion, idx) => (
              <div 
                key={idx}
                className="bg-gray-50 p-4 rounded-lg text-center hover:bg-white hover:shadow-md hover:-translate-y-1 transition-all cursor-pointer"
              >
                <div className="text-4xl mb-2">{emotion.icon}</div>
                <div className="text-sm font-semibold text-gray-900 mb-1">{emotion.label}</div>
                <div className="text-xl font-bold text-gray-700">{emotion.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Intent Flow Placeholder */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
          🔀 Intent Flow & Transitions
        </h2>
        <div className="h-80 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center text-white text-center p-8">
          <div>
            <div className="text-xl font-semibold mb-2">Sankey Diagram: Customer Journey</div>
            <div className="text-sm opacity-90">
              Initial Intent → Conversation Flow → Resolution Intent
            </div>
            <div className="text-xs opacity-75 mt-4">
              (Advanced visualization - requires additional charting library)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedAnalytics;