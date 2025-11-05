/**
 * Shopify Integration Page
 * Main page for Shopify store management with sync progress
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Store, 
  Plus, 
  RefreshCw, 
  Settings, 
  TrendingUp,
  Package,
  Image,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Clock,
  Loader
} from 'lucide-react';
import * as shopifyApi from '../../services/shopifyApi';

const ShopifyIntegration = () => {
  const [stores, setStores] = useState([]);
  const [stats, setStats] = useState(null);
  const [syncStatuses, setSyncStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    loadData();
    
    // Start polling for sync statuses
    startPolling();
    
    return () => {
      // Cleanup polling on unmount
      stopPolling();
    };
  }, []);

  useEffect(() => {
    // Update polling when stores change
    if (stores.length > 0) {
      loadSyncStatuses();
    }
  }, [stores]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [storesRes, statsRes] = await Promise.all([
        shopifyApi.getStores(),
        shopifyApi.getStats()
      ]);

      setStores(storesRes.data.data.stores || []);
      setStats(statsRes.data.data);
    } catch (err) {
      console.error('Load data error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncStatuses = async () => {
    try {
      const statusPromises = stores.map(store => 
        shopifyApi.getStoreSyncStatus(store.id)
          .then(res => ({ storeId: store.id, status: res.data.data }))
          .catch(err => {
            console.error(`Error loading sync status for ${store.id}:`, err);
            return { storeId: store.id, status: null };
          })
      );

      const results = await Promise.all(statusPromises);
      const statusMap = {};
      results.forEach(({ storeId, status }) => {
        statusMap[storeId] = status;
      });

      setSyncStatuses(statusMap);
    } catch (err) {
      console.error('Load sync statuses error:', err);
    }
  };

  const startPolling = () => {
    // Poll every 3 seconds
    intervalRef.current = setInterval(() => {
      loadSyncStatuses();
    }, 3000);
  };

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleSync = async (storeId) => {
    try {
      const response = await shopifyApi.triggerSync(storeId);
      alert(`Sync started! Job ID: ${response.data.data.job_id}`);
      
      // Immediately refresh sync statuses
      await loadSyncStatuses();
    } catch (err) {
      alert(`Sync failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  const formatTimeAgo = (date) => {
    if (!date) return 'Never';
    
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const renderSyncStatus = (store) => {
    const syncStatus = syncStatuses[store.id];
    
    if (!syncStatus) {
      return (
        <div className="text-sm text-gray-500">
          Loading status...
        </div>
      );
    }

    if (syncStatus.is_syncing) {
      const { progress, timing } = syncStatus;
      
      return (
        <div className="space-y-2">
          {/* Progress Bar */}
          <div className="relative">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-blue-600 font-medium flex items-center">
                <Loader className="w-4 h-4 mr-1 animate-spin" />
                Syncing...
              </span>
              <span className="text-gray-600">
                {progress.percentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>

          {/* Progress Details */}
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>
              {progress.products.processed} / {progress.products.total} products
            </span>
            <span>
              {timing.estimated_remaining_seconds > 0 
                ? `~${formatDuration(timing.estimated_remaining_seconds)} remaining`
                : 'Calculating...'
              }
            </span>
          </div>

          {/* Images Progress */}
          {progress.images.total > 0 && (
            <div className="text-xs text-gray-500">
              {progress.images.processed} / {progress.images.total} images processed
            </div>
          )}
        </div>
      );
    }

    // Not syncing - show last sync info
    return (
      <div className="space-y-1">
        {syncStatus.last_sync ? (
          <>
            <div className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
              <span>
                Last synced: {formatTimeAgo(syncStatus.last_sync.completed_at)}
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {syncStatus.last_sync.products_processed} products, {syncStatus.last_sync.images_processed} images
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-500">
            Never synced
          </div>
        )}

        {/* Next Sync Info */}
        {syncStatus.next_sync?.enabled && syncStatus.next_sync.next_sync_at && (
          <div className="flex items-center text-xs text-gray-500 mt-1">
            <Clock className="w-3 h-3 mr-1" />
            <span>
              Next sync: {formatTimeAgo(syncStatus.next_sync.next_sync_at)}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shopify Integration</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your Shopify stores and sync products
          </p>
        </div>
        <Link
          to="/shopify/connect"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Connect Store
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <XCircle className="w-5 h-5 text-red-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Store className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Connected Stores
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.stores.active}
                      </div>
                      <div className="ml-2 text-sm text-gray-500">
                        / {stats.stores.total}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Package className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Products
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.products.active}
                      </div>
                      <div className="ml-2 text-sm text-gray-500">
                        / {stats.products.total}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Image className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Images
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.images.total}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Sync Jobs
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.sync_jobs.completed}
                      </div>
                      <div className="ml-2 text-sm text-gray-500">
                        / {stats.sync_jobs.total}
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stores List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Connected Stores
          </h3>

          {stores.length === 0 ? (
            <div className="text-center py-12">
              <Store className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No stores connected</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by connecting your first Shopify store
              </p>
              <div className="mt-6">
                <Link
                  to="/shopify/connect"
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Connect Store
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {stores.map((store) => (
                <div
                  key={store.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      {getStatusIcon(store.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-gray-900">
                            {store.shop_domain}
                          </h4>
                          <a
                            href={`https://${store.shop_domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>

                        {/* Sync Status Component */}
                        <div className="mt-3">
                          {renderSyncStatus(store)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => handleSync(store.id)}
                        disabled={syncStatuses[store.id]?.is_syncing}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3 h-3 mr-1 ${syncStatuses[store.id]?.is_syncing ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                      <Link
                        to={`/shopify/stores/${store.id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Settings className="w-3 h-3 mr-1" />
                        Settings
                      </Link>
                      <Link
                        to={`/shopify/products?kb_id=${store.kb_id}`}
                        className="inline-flex items-center px-3 py-1.5 border border-primary-300 shadow-sm text-xs font-medium rounded text-primary-700 bg-primary-50 hover:bg-primary-100"
                      >
                        <Package className="w-3 h-3 mr-1" />
                        Products
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShopifyIntegration;