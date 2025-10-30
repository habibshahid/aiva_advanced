/**
 * Store Settings Component
 * Edit Shopify store configuration
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Trash2, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Store
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as shopifyApi from '../../services/shopifyApi';

const StoreSettings = () => {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [store, setStore] = useState(null);
  const [formData, setFormData] = useState({
    auto_sync_enabled: true,
    sync_frequency_minutes: 1440,
    sync_status_filter: 'active',
    sync_reviews: false
  });

  useEffect(() => {
    loadStore();
  }, [storeId]);

  const loadStore = async () => {
    try {
      setLoading(true);
      const response = await shopifyApi.getStore(storeId);
      setStore(response.data);
      
      // Load sync settings
      if (response.data.sync_settings) {
        setFormData(response.data.sync_settings);
      }
    } catch (err) {
      console.error('Load store error:', err);
      toast.error('Failed to load store settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? parseInt(value) : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await shopifyApi.updateStore(storeId, {
        sync_settings: formData
      });
      
      toast.success('Settings saved successfully!');
      navigate('/shopify');
    } catch (err) {
      console.error('Save error:', err);
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to disconnect this store? All synced data will remain but new syncs will stop.')) {
      return;
    }

    setDeleting(true);

    try {
      await shopifyApi.disconnectStore(storeId);
      toast.success('Store disconnected successfully');
      navigate('/shopify');
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to disconnect store');
    } finally {
      setDeleting(false);
    }
  };

  const handleTestSync = async () => {
    try {
      const response = await shopifyApi.triggerSync(storeId, {
        job_type: 'full_sync'
      });
      toast.success(`Sync started! Job ID: ${response.data.job_id}`);
    } catch (err) {
      toast.error('Failed to start sync');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Store not found</h3>
        <p className="mt-1 text-sm text-gray-500">
          The store you're looking for doesn't exist or has been removed.
        </p>
        <div className="mt-6">
          <button
            onClick={() => navigate('/shopify')}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Stores
          </button>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Store className="w-8 h-8 text-gray-400 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{store.shop_domain}</h1>
              <p className="mt-1 text-sm text-gray-500">
                Store Settings
              </p>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            store.status === 'active' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-yellow-100 text-yellow-800'
          }`}>
            {store.status}
          </div>
        </div>
      </div>

      {/* Store Info */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Store Information</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Shop Domain</dt>
            <dd className="mt-1 text-sm text-gray-900">{store.shop_domain}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1 text-sm text-gray-900">{store.status}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Products Synced</dt>
            <dd className="mt-1 text-sm text-gray-900">{store.total_products_synced || 0}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Sync</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {store.last_sync_at ? new Date(store.last_sync_at).toLocaleString() : 'Never'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Last Sync Status</dt>
            <dd className="mt-1">
              {store.last_sync_status ? (
                <span className={`inline-flex items-center text-sm ${
                  store.last_sync_status === 'success' 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {store.last_sync_status === 'success' ? (
                    <CheckCircle className="w-4 h-4 mr-1" />
                  ) : (
                    <AlertCircle className="w-4 h-4 mr-1" />
                  )}
                  {store.last_sync_status}
                </span>
              ) : (
                <span className="text-sm text-gray-500">N/A</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Created</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {new Date(store.created_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>

      {/* Sync Settings Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg">
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-medium text-gray-900">Sync Settings</h3>

          {/* Auto Sync */}
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                name="auto_sync_enabled"
                checked={formData.auto_sync_enabled}
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
          {formData.auto_sync_enabled && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sync Frequency
              </label>
              <select
                name="sync_frequency_minutes"
                value={formData.sync_frequency_minutes}
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
              name="sync_status_filter"
              value={formData.sync_status_filter}
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
                name="sync_reviews"
                checked={formData.sync_reviews}
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

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestSync}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Test Sync Now
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => navigate('/shopify')}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>

      {/* Danger Zone */}
      <div className="mt-6 bg-white shadow rounded-lg border-2 border-red-200">
        <div className="p-6">
          <h3 className="text-lg font-medium text-red-900">Danger Zone</h3>
          <p className="mt-1 text-sm text-gray-500">
            Once you disconnect this store, you won't be able to sync new products. 
            Existing synced data will remain in your knowledge base.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleting ? 'Disconnecting...' : 'Disconnect Store'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoreSettings;