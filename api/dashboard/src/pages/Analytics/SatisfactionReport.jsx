import React, { useState, useEffect } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  Target,
  Clock,
  AlertCircle,
  Download,
  TrendingUp,
  TrendingDown
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

const CustomerSatisfaction = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data states
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [positiveFeedback, setPositiveFeedback] = useState([]);
  const [negativeFeedback, setNegativeFeedback] = useState([]);
  const [agentStats, setAgentStats] = useState([]);
  const [intentStats, setIntentStats] = useState([]);

  // Filters
  const [filters, setFilters] = useState({
    date_from: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    agent_id: ''
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
      if (!params.agent_id) delete params.agent_id;

      const [overviewRes, trendsRes, positiveFeedbackRes, negativeFeedbackRes, agentsRes, intentsRes] = await Promise.all([
        AnalyticsService.getSatisfactionOverview(params),
        AnalyticsService.getSatisfactionTrends(params),
        AnalyticsService.getSatisfactionFeedback({ ...params, rating: 'GOOD', limit: 5 }),
        AnalyticsService.getSatisfactionFeedback({ ...params, rating: 'BAD', limit: 5 }),
        AnalyticsService.getSatisfactionByAgent(params),
        AnalyticsService.getSatisfactionByIntent(params)
      ]);

      setOverview(overviewRes.data.data);
      setTrends(trendsRes.data.data.trends || []);
      setPositiveFeedback(positiveFeedbackRes.data.data.feedback || []);
      setNegativeFeedback(negativeFeedbackRes.data.data.feedback || []);
      setAgentStats(agentsRes.data.data.agents || []);
      setIntentStats(intentsRes.data.data.intents || []);

    } catch (err) {
      console.error('Failed to fetch satisfaction data:', err);
      setError(err.response?.data?.message || 'Failed to load satisfaction data');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchAllData();
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <ThumbsUp className="w-16 h-16 text-green-600 mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-gray-600">Loading satisfaction data...</p>
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
            Customer Satisfaction & Feedback
          </div>
          <h1 className="text-3xl font-bold text-gray-900">⭐ Customer Satisfaction & Feedback</h1>
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

      {/* Overall Satisfaction Hero */}
      {overview && (
        <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg shadow-lg p-10 text-center">
          <div className="text-7xl font-bold mb-3">
            {overview.satisfaction.satisfaction_rate}%
          </div>
          <div className="text-2xl mb-8 opacity-95">
            Overall Customer Satisfaction
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white/20 rounded-lg p-5">
              <div className="text-3xl font-bold mb-2">{overview.satisfaction.good_count}</div>
              <div className="text-sm opacity-90">Satisfied</div>
            </div>
            <div className="bg-white/20 rounded-lg p-5">
              <div className="text-3xl font-bold mb-2">
                {overview.satisfaction.total_feedback - overview.satisfaction.good_count - overview.satisfaction.bad_count}
              </div>
              <div className="text-sm opacity-90">Neutral</div>
            </div>
            <div className="bg-white/20 rounded-lg p-5">
              <div className="text-3xl font-bold mb-2">{overview.satisfaction.bad_count}</div>
              <div className="text-sm opacity-90">Unsatisfied</div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics */}
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Resolution Rate */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-500 uppercase font-semibold">Resolution Rate</div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900 mb-2">
              {overview.resolution.resolution_rate}%
            </div>
            <div className="text-sm text-green-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Good performance
            </div>
          </div>

          {/* First Contact Resolution */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-500 uppercase font-semibold">First Contact Resolution</div>
              <Target className="w-8 h-8 text-blue-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900 mb-2">
              {overview.escalation.first_contact_resolution_rate}%
            </div>
            <div className="text-sm text-green-600 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Strong efficiency
            </div>
          </div>

          {/* Avg Response Time */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-500 uppercase font-semibold">Avg Response Time</div>
              <Clock className="w-8 h-8 text-purple-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900 mb-2">
              {overview.response_time.avg_seconds}s
            </div>
            <div className="text-sm text-green-600 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              Fast responses
            </div>
          </div>

          {/* Escalation Rate */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-500 uppercase font-semibold">Escalation Rate</div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
            <div className="text-4xl font-bold text-gray-900 mb-2">
              {overview.escalation.escalation_rate}%
            </div>
            <div className="text-sm text-green-600 flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              Low escalations
            </div>
          </div>
        </div>
      )}

      {/* Satisfaction Trends */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
          📈 Satisfaction Trends Over Time
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis tickFormatter={(value) => `${value}%`} />
            <Tooltip 
              formatter={(value) => `${parseFloat(value).toFixed(1)}%`}
              labelFormatter={(date) => new Date(date).toLocaleDateString()}
            />
            <Legend />
            <Line type="monotone" dataKey="satisfaction_rate" stroke="#2ecc71" strokeWidth={3} name="Satisfaction Rate" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Resolution Funnel */}
      {overview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            🎯 Resolution Funnel
          </h2>
          <div className="space-y-4">
            {/* Total Interactions */}
            <div className="flex items-center justify-between p-5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-2xl">
                  📞
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Total Interactions</div>
                  <div className="h-2 bg-gray-200 rounded-full w-48 mt-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{overview.resolution.total_interactions}</div>
                <div className="text-sm text-gray-500">100%</div>
              </div>
            </div>

            {/* Issue Resolved */}
            <div className="flex items-center justify-between p-5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-2xl">
                  ✅
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Issue Resolved</div>
                  <div className="h-2 bg-gray-200 rounded-full w-48 mt-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${overview.resolution.resolution_rate}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{overview.resolution.resolved_count}</div>
                <div className="text-sm text-gray-500">{overview.resolution.resolution_rate}%</div>
              </div>
            </div>

            {/* Customer Satisfied */}
            <div className="flex items-center justify-between p-5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-2xl">
                  😊
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">Customer Satisfied</div>
                  <div className="h-2 bg-gray-200 rounded-full w-48 mt-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${overview.satisfaction.satisfaction_rate}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{overview.satisfaction.good_count}</div>
                <div className="text-sm text-gray-500">{overview.satisfaction.satisfaction_rate}%</div>
              </div>
            </div>

            {/* First Contact Resolution */}
            <div className="flex items-center justify-between p-5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-2xl">
                  🎯
                </div>
                <div>
                  <div className="text-base font-semibold text-gray-900">First Contact Resolution</div>
                  <div className="h-2 bg-gray-200 rounded-full w-48 mt-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${overview.escalation.first_contact_resolution_rate}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  {overview.escalation.total_sessions - overview.escalation.escalated_sessions}
                </div>
                <div className="text-sm text-gray-500">{overview.escalation.first_contact_resolution_rate}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Positive Feedback */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            🔍 Top Satisfaction Drivers
          </h2>
          <ul className="space-y-4">
            {positiveFeedback.map((feedback) => (
              <li key={feedback.id} className="bg-green-50 border-l-4 border-green-500 p-5 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                      Positive
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(feedback.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xl">
                    {feedback.rating === 'GOOD' ? '👍' : '⭐⭐⭐⭐⭐'}
                  </div>
                </div>
                <div className="text-sm text-gray-700 mb-3">
                  {feedback.comment || 'Customer rated this interaction positively'}
                </div>
                <div className="flex gap-2">
                  {feedback.intents && feedback.intents.slice(0, 3).map((intent, idx) => (
                    <span key={idx} className="px-2 py-1 bg-white border border-gray-300 rounded-md text-xs text-gray-600">
                      {intent}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Negative Feedback */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            ⚠️ Areas for Improvement
          </h2>
          <ul className="space-y-4">
            {negativeFeedback.map((feedback) => (
              <li key={feedback.id} className="bg-red-50 border-l-4 border-red-500 p-5 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-semibold">
                      Negative
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(feedback.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-xl">
                    {feedback.rating === 'BAD' ? '👎' : '⭐⭐'}
                  </div>
                </div>
                <div className="text-sm text-gray-700 mb-3">
                  {feedback.comment || 'Customer rated this interaction negatively'}
                </div>
                <div className="flex gap-2">
                  {feedback.intents && feedback.intents.slice(0, 3).map((intent, idx) => (
                    <span key={idx} className="px-2 py-1 bg-white border border-gray-300 rounded-md text-xs text-gray-600">
                      {intent}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Satisfaction by Agent and Intent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Agent */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            👥 Satisfaction by Agent
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={agentStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="agent_name" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => `${parseFloat(value).toFixed(1)}%`} />
              <Bar dataKey="satisfaction_rate" fill="#2ecc71" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* By Intent */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-4 border-b border-gray-200">
            📊 Satisfaction by Intent
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={intentStats}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="intent" />
              <YAxis tickFormatter={(value) => `${value}%`} />
              <Tooltip formatter={(value) => `${parseFloat(value).toFixed(1)}%`} />
              <Bar dataKey="satisfaction_rate" fill="#3498db" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default CustomerSatisfaction;