import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Search,
  Download,
  X as CloseIcon,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import AnalyticsService from '../../services/AnalyticsService';

const ChatReport = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  // Filters
  const [filters, setFilters] = useState({
    date_from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_to: new Date().toISOString().split('T')[0],
    agent_id: '',
    status: '',
    sentiment: '',
    search: ''
  });

  const [agents, setAgents] = useState([]);

  // Modal state
  const [selectedChat, setSelectedChat] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

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

  // Fetch chats
  useEffect(() => {
    fetchChats();
  }, [pagination.page]);

  const fetchChats = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await AnalyticsService.getChatReport(params);
      setData(response.data.data);
      setPagination(prev => ({
        ...prev,
        total: response.data.data.pagination.total,
        pages: response.data.data.pagination.pages
      }));
    } catch (err) {
      console.error('Failed to fetch chats:', err);
      setError(err.response?.data?.message || 'Failed to load chat sessions');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters
  const applyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchChats();
  };

  // View chat details
  const viewChat = async (chat) => {
    setSelectedChat(chat);
    setShowModal(true);
    setModalLoading(true);
    setModalData(null);
    setMessages([]);

    try {
      // Fetch chat details
      const detailsResponse = await AnalyticsService.getChatSessionDetails(chat.id);
      setModalData(detailsResponse.data.data);
      
      // Fetch messages
      try {
        const messagesResponse = await AnalyticsService.getChatMessages(chat.id);
        console.log('Messages response:', messagesResponse.data);
        setMessages(messagesResponse.data.data.messages || []);
      } catch (messagesErr) {
        console.error('Failed to fetch messages:', messagesErr);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to fetch chat details:', err);
      setModalData(null);
      setMessages([]);
    } finally {
      setModalLoading(false);
    }
  };

  // Export CSV
  const exportCSV = async () => {
    try {
      const params = { ...filters };
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await AnalyticsService.exportChatReport(params, 'csv');
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `chat_sessions_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to export:', err);
      alert('Failed to export report');
    }
  };

  // Status badge component
  const StatusBadge = ({ status }) => {
    const styles = {
      ended: 'bg-green-100 text-green-800',
      active: 'bg-blue-100 text-blue-800',
      expired: 'bg-gray-100 text-gray-800'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.expired}`}>
        {status || 'Unknown'}
      </span>
    );
  };

  // Sentiment badge component
  const SentimentBadge = ({ sentiment }) => {
    const styles = {
      positive: 'bg-green-100 text-green-800',
      negative: 'bg-red-100 text-red-800',
      neutral: 'bg-gray-100 text-gray-800',
      mixed: 'bg-yellow-100 text-yellow-800'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[sentiment] || styles.neutral}`}>
        {sentiment || 'N/A'}
      </span>
    );
  };

  // Sentiment emoji
  const getSentimentEmoji = (sentiment) => {
    const emojis = {
      positive: '😊',
      negative: '😞',
      neutral: '😐',
      mixed: '😕'
    };
    return emojis[sentiment] || '😐';
  };

  const stats = data?.stats || {};
  const chats = data?.chats || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-4">
          <div className="text-sm text-gray-500 mb-2">
            <a href="/analytics" className="text-primary-600 hover:text-primary-700">Dashboard</a>
            {' '}/{' '}
            Chat Report
          </div>
          <h1 className="text-3xl font-bold text-gray-900">💬 Chat Sessions Report</h1>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
          {/* Date From */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">From Date</label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">To Date</label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>
          
          {/* Search */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Session ID, name..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            >
              <option value="">All Status</option>
              <option value="ended">Ended</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Sentiment */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sentiment</label>
            <select
              value={filters.sentiment}
              onChange={(e) => setFilters(prev => ({ ...prev, sentiment: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            >
              <option value="">All Sentiments</option>
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="neutral">Neutral</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>

          {/* Agent */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Agent</label>
            <select
              value={filters.agent_id}
              onChange={(e) => setFilters(prev => ({ ...prev, agent_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            >
              <option value="">All Agents</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={applyFilters}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold"
          >
            Apply Filters
          </button>

          <button
            onClick={exportCSV}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-xs text-gray-500 uppercase mb-2">Total Chats</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total_chats?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-xs text-gray-500 uppercase mb-2">Avg Messages</div>
          <div className="text-2xl font-bold text-gray-900">
            {stats.avg_messages ? stats.avg_messages.toFixed(1) : '0.0'}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-xs text-gray-500 uppercase mb-2">Total Messages</div>
          <div className="text-2xl font-bold text-gray-900">{stats.total_messages?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-xs text-gray-500 uppercase mb-2">Success Rate</div>
          <div className="text-2xl font-bold text-gray-900">{stats.success_rate || 0}%</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="text-xs text-gray-500 uppercase mb-2">Avg Satisfaction</div>
          <div className="text-2xl font-bold text-gray-900">{stats.avg_satisfaction || 0}%</div>
        </div>
      </div>

      {/* Chat Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Chat Sessions ({stats.total_chats?.toLocaleString() || 0} total)
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-primary-600 mx-auto mb-4 animate-pulse" />
              <p className="text-gray-600">Loading chat sessions...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        ) : chats.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No chat sessions found</p>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date/Time</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Session Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Messages</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sentiment</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Intent</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {chats.map((chat) => (
                    <tr 
                      key={chat.id} 
                      onClick={() => viewChat(chat)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {AnalyticsService.formatDate(chat.start_time, 'datetime')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {chat.session_name || chat.id.substring(0, 12) + '...'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {chat.agent_name || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {chat.total_messages || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={chat.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <SentimentBadge sentiment={chat.overall_sentiment} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {chat.primary_intent || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {AnalyticsService.formatCurrency(chat.total_cost)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button 
                          onClick={(e) => { e.stopPropagation(); viewChat(chat); }}
                          className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-semibold hover:bg-primary-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-center gap-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              
              {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPagination(prev => ({ ...prev, page: pageNum }))}
                    className={`px-4 py-2 border rounded-lg text-sm font-medium ${
                      pagination.page === pageNum
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: Math.min(prev.pages, prev.page + 1) }))}
                disabled={pagination.page === pagination.pages}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-2xl font-semibold text-gray-900">
                💬 Chat Session - {selectedChat?.session_name || selectedChat?.id?.substring(0, 12) + '...'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-6">
              {modalLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <>
                  {/* Session Info Grid */}
                  <div className="grid grid-cols-3 gap-5 mb-8">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">Start Time</div>
                      <div className="text-base font-semibold text-gray-900">
                        {AnalyticsService.formatDate(selectedChat?.start_time, 'datetime')}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">End Time</div>
                      <div className="text-base font-semibold text-gray-900">
                        {selectedChat?.end_time 
                          ? AnalyticsService.formatDate(selectedChat.end_time, 'datetime')
                          : 'Active'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">Agent</div>
                      <div className="text-base font-semibold text-gray-900">
                        {selectedChat?.agent_name || 'N/A'}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">Total Messages</div>
                      <div className="text-base font-semibold text-gray-900">
                        {selectedChat?.total_messages || 0}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">Status</div>
                      <div className="text-base font-semibold">
                        <StatusBadge status={selectedChat?.status} />
                      </div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="text-xs text-gray-500 uppercase mb-1">Total Cost</div>
                      <div className="text-base font-semibold text-gray-900">
                        {AnalyticsService.formatCurrency(selectedChat?.total_cost)}
                      </div>
                    </div>
                  </div>

                  {/* Chat Analytics */}
                  {modalData?.analytics && (
                    <div className="bg-gray-50 p-6 rounded-lg mb-8">
                      <h3 className="text-base font-semibold text-gray-900 mb-4">📊 Session Analytics</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Overall Sentiment</div>
                          <div className="text-xl font-bold text-green-600">
                            {modalData.analytics.overall_sentiment || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Sentiment Score</div>
                          <div className="text-xl font-bold text-gray-900">
                            {modalData.analytics.overall_sentiment_score 
                              ? parseFloat(modalData.analytics.overall_sentiment_score).toFixed(2) 
                              : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Primary Intent</div>
                          <div className="text-sm font-bold text-gray-900">
                            {modalData.analytics.primary_intents?.[0] || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Customer Satisfaction</div>
                          <div className="text-xl font-bold text-green-600">
                            {modalData.analytics.customer_satisfaction_indicator || 'N/A'}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Issue Resolved</div>
                          <div className="text-xl font-bold text-green-600">
                            {modalData.analytics.issue_resolved ? '✓ Yes' : '✗ No'}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Profanity</div>
                          <div className="text-xl font-bold text-gray-900">
                            {modalData.analytics.profanity_incidents || 0}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Total Exchanges</div>
                          <div className="text-xl font-bold text-gray-900">
                            {modalData.analytics.total_exchanges || messages.length}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Language</div>
                          <div className="text-xl font-bold text-gray-900">
                            {modalData.analytics.languages_detected?.[0]?.toUpperCase() || 'EN'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cost Breakdown */}
                  {modalData?.cost_breakdown && (
                    <div className="bg-gray-50 p-6 rounded-lg mb-8">
                      <h3 className="text-base font-semibold text-gray-900 mb-4">💰 Cost Breakdown</h3>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">LLM Completion</div>
                          <div className="text-xl font-bold text-gray-900">
                            ${modalData.cost_breakdown.llm_completion}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Analysis</div>
                          <div className="text-xl font-bold text-gray-900">
                            ${modalData.cost_breakdown.analysis}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Knowledge Search</div>
                          <div className="text-xl font-bold text-gray-900">
                            ${modalData.cost_breakdown.knowledge_search}
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg text-center">
                          <div className="text-xs text-gray-500 uppercase mb-1">Image Processing</div>
                          <div className="text-xl font-bold text-gray-900">
                            ${modalData.cost_breakdown.image_processing}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 mb-4">💬 Chat Messages</h3>
                    <div className="space-y-5">
                      {messages.length === 0 ? (
                        <div className="bg-gray-50 p-8 rounded-lg text-center">
                          <p className="text-gray-500">No messages available for this session</p>
                          <p className="text-sm text-gray-400 mt-2">Messages may not have been loaded yet</p>
                        </div>
                      ) : (
                        messages.map((msg, idx) => (
                          <div
                            key={idx}
                            className={`flex gap-4 p-4 bg-gray-50 rounded-lg border-l-4 ${
                              msg.role === 'assistant' ? 'border-green-500' : 'border-blue-500'
                            }`}
                          >
                            <div className="min-w-[120px]">
                              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                                {msg.role === 'assistant' ? 'Agent' : 'User'}
                              </div>
                              <div className="text-xs text-gray-400">
                                {AnalyticsService.formatDate(msg.created_at, 'time')}
                              </div>
                            </div>
                            <div className="flex-1">
                              <div 
                                className="text-sm text-gray-900 mb-3 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: msg.content_html || msg.content }}
                              />
                              <div className="flex flex-wrap gap-2">
                                {msg.sources && msg.sources.length > 0 && (
                                  <span className="px-2 py-1 text-xs font-semibold bg-white border border-blue-200 text-blue-700 rounded-full">
                                    📚 {msg.sources.length} sources
                                  </span>
                                )}
                                {msg.images && msg.images.length > 0 && (
                                  <span className="px-2 py-1 text-xs font-semibold bg-white border border-purple-200 text-purple-700 rounded-full">
                                    🖼️ {msg.images.length} images
                                  </span>
                                )}
                                {msg.products && msg.products.length > 0 && (
                                  <span className="px-2 py-1 text-xs font-semibold bg-white border border-orange-200 text-orange-700 rounded-full">
                                    🛍️ {msg.products.length} products
                                  </span>
                                )}
                                {msg.cost && parseFloat(msg.cost) > 0 && (
                                  <span className="px-2 py-1 text-xs font-semibold bg-white border border-gray-200 text-gray-700 rounded-full">
                                    💵 ${parseFloat(msg.cost).toFixed(4)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatReport;