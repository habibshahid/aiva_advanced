/**
 * Connect Store Component
 * Form to connect a new Shopify store
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Key, HelpCircle, CheckCircle, XCircle } from 'lucide-react';
import * as shopifyApi from '../../services/shopifyApi';
import * as knowledgeApi from '../../services/knowledgeApi';

const ConnectStore = () => {
  const navigate = useNavigate();
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [formData, setFormData] = useState({
    kb_id: '',
    shop_domain: '',
    access_token: '',
    sync_settings: {
      auto_sync_enabled: true,
      sync_frequency_minutes: 1440,
      sync_status_filter: 'active',
      sync_reviews: false
    }
  });

  useEffect(() => {
    loadKnowledgeBases();
  }, []);

  const loadKnowledgeBases = async () => {
    try {
      const response = await knowledgeApi.getKnowledgeBases();
      setKnowledgeBases(response.data.data.knowledge_bases || []);
    } catch (err) {
      console.error('Load KBs error:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('sync_')) {
      const settingName = name.replace('sync_', '');
      setFormData(prev => ({
        ...prev,
        sync_settings: {
          ...prev.sync_settings,
          [settingName]: type === 'checkbox' ? checked : 
                        type === 'number' ? parseInt(value) : value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Test connection via our backend API
      const response = await shopifyApi.testConnection({
        shop_domain: formData.shop_domain,
        access_token: formData.access_token
      });

      if (response.data.data.connected) {
        setTestResult({
          success: true,
          message: response.data.data.credits || 'Connection successful!',
          shop: response.data.data.shop
        });
      } else {
        setTestResult({
          success: false,
          message: 'Connection failed'
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || err.message || 'Connection failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await shopifyApi.connectStore(formData);
      alert('Store connected successfully!');
      navigate('/shopify');
    } catch (err) {
      alert(`Connection failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/shopify')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Stores
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Connect Shopify Store</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect your Shopify store to sync products and enable AI-powered search
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg">
        <div className="p-6 space-y-6">
          {/* Knowledge Base */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Knowledge Base *
            </label>
            <select
              name="kb_id"
              value={formData.kb_id}
              onChange={handleChange}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              required
            >
              <option value="">Select a knowledge base</option>
              {knowledgeBases.map(kb => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-gray-500">
              Products will be synced to this knowledge base
            </p>
          </div>

          {/* Store Domain */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store Domain *
            </label>
            <div className="flex rounded-md shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                <Store className="w-4 h-4 mr-1" />
                https://
              </span>
              <input
                type="text"
                name="shop_domain"
                value={formData.shop_domain}
                onChange={handleChange}
                className="flex-1 rounded-none rounded-r-md border-gray-300 focus:border-primary-500 focus:ring-primary-500"
                placeholder="your-store.myshopify.com"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Your Shopify store domain (e.g., your-store.myshopify.com)
            </p>
          </div>

          {/* Access Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Access Token *
            </label>
            <div className="flex rounded-md shadow-sm">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                name="access_token"
                value={formData.access_token}
                onChange={handleChange}
                className="flex-1 rounded-none rounded-r-md border-gray-300 focus:border-primary-500 focus:ring-primary-500"
                placeholder="shpat_xxxxxxxxxxxxx"
                required
              />
            </div>
            <p className="mt-1 text-sm text-gray-500 flex items-start">
              <HelpCircle className="w-4 h-4 mr-1 mt-0.5 flex-shrink-0" />
              <span>
                Create a private app in Shopify Admin → Apps → Develop apps.
                Required scopes: read_products, read_inventory
              </span>
            </p>
          </div>

          {/* Test Connection */}
          <div>
            <button
              type="button"
              onClick={testConnection}
              disabled={!formData.shop_domain || !formData.access_token || testing}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            {testResult && (
              <div className={`mt-3 p-4 rounded-md ${
                testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex">
                  {testResult.success ? (
                    <CheckCircle className="w-5 h-5 text-green-400 mr-2" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 mr-2" />
                  )}
                  <div>
                    <h4 className={`text-sm font-medium ${
                      testResult.success ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </h4>
                    <p className={`mt-1 text-sm ${
                      testResult.success ? 'text-green-700' : 'text-red-700'
                    }`}>
                      {testResult.message}
                    </p>
                    {testResult.shop && (
                      <div className="mt-2 text-sm text-green-700">
                        <p>Shop: {testResult.shop.name}</p>
                        <p>Email: {testResult.shop.email}</p>
                        <p>Currency: {testResult.shop.currency}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <hr />

          {/* Sync Settings */}
          <div>
            <h3 className="text-base font-medium text-gray-900 mb-4">Sync Settings</h3>

            <div className="space-y-4">
              {/* Auto Sync */}
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    name="sync_auto_sync_enabled"
                    checked={formData.sync_settings.auto_sync_enabled}
                    onChange={handleChange}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3">
                  <label className="text-sm font-medium text-gray-700">
                    Enable automatic sync
                  </label>
                  <p className="text-sm text-gray-500">
                    Automatically sync products on a schedule
                  </p>
                </div>
              </div>

              {/* Sync Frequency */}
              {formData.sync_settings.auto_sync_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sync Frequency
                  </label>
                  <select
                    name="sync_sync_frequency_minutes"
                    value={formData.sync_settings.sync_frequency_minutes}
                    onChange={handleChange}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="60">Every hour</option>
                    <option value="360">Every 6 hours</option>
                    <option value="720">Every 12 hours</option>
                    <option value="1440">Daily</option>
                    <option value="10080">Weekly</option>
                  </select>
                </div>
              )}

              {/* Product Status Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sync Products
                </label>
                <select
                  name="sync_sync_status_filter"
                  value={formData.sync_settings.sync_status_filter}
                  onChange={handleChange}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="active">Active products only</option>
                  <option value="all">All products</option>
                  <option value="draft">Draft products only</option>
                </select>
              </div>

              {/* Sync Reviews */}
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    name="sync_sync_reviews"
                    checked={formData.sync_settings.sync_reviews}
                    onChange={handleChange}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3">
                  <label className="text-sm font-medium text-gray-700">
                    Sync product reviews
                  </label>
                  <p className="text-sm text-gray-500">
                    Include product reviews in sync (if available)
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/shopify')}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !testResult?.success}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting...' : 'Connect Store'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConnectStore;