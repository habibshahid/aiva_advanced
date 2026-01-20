import React, { useState, useEffect } from 'react';
import { Globe, RefreshCw, Clock, AlertCircle, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { getScrapeSources, syncScrapeSource } from '../../services/knowledgeApi';

const ScrapeSources = ({ kbId }) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSources();
  }, [kbId]);

  const loadSources = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getScrapeSources(kbId);
      // Handle various response structures
      const sourcesData = response?.data?.data?.sources || response?.data?.sources || [];
      setSources(sourcesData);
    } catch (err) {
      console.error('Failed to load scrape sources:', err);
      // Don't show error toast - just set empty sources
      // This prevents breaking the UI when the feature isn't fully deployed
      setSources([]);
      setError(err.response?.status === 404 ? 'feature_not_ready' : 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (sourceId) => {
    try {
      setSyncing(prev => ({ ...prev, [sourceId]: true }));
      const response = await syncScrapeSource(sourceId);
      const result = response?.data?.data || response?.data || {};
      
      if (result.status === 'no_changes') {
        toast.success('No changes detected');
      } else {
        const processed = result.processed || {};
        toast.success(
          `Sync completed: ${processed.added || 0} added, ${processed.updated || 0} updated, ${processed.removed || 0} removed`
        );
      }
      loadSources();
    } catch (err) {
      toast.error('Sync failed');
      console.error(err);
    } finally {
      setSyncing(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadge = (status) => {
    const badges = {
      idle: 'bg-gray-100 text-gray-800',
      syncing: 'bg-blue-100 text-blue-800',
      error: 'bg-red-100 text-red-800'
    };
    return badges[status] || badges.idle;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Loading scrape sources...</span>
      </div>
    );
  }

  // Feature not ready or no sources - show helpful message
  if (error === 'feature_not_ready' || sources.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
        <Globe className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="font-medium">No synced sources yet</p>
        <p className="text-sm mt-1">
          After scraping a website, it will appear here for tracking and re-syncing.
        </p>
      </div>
    );
  }

  // Error state
  if (error === 'error') {
    return (
      <div className="text-center p-8 text-red-500 border border-dashed border-red-200 rounded-lg">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-300" />
        <p className="font-medium">Failed to load scrape sources</p>
        <button 
          onClick={loadSources}
          className="mt-2 text-sm text-primary-600 hover:text-primary-700"
        >
          Try again
        </button>
      </div>
    );
  }

  // Sources list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-md font-medium text-gray-900">
          Synced Sources ({sources.length})
        </h4>
        <button
          onClick={loadSources}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.id}
            className="border border-gray-200 rounded-lg p-4 bg-gray-50 hover:bg-white transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* URL */}
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 truncate"
                    title={source.url}
                  >
                    {source.url}
                  </a>
                </div>

                {/* Status badges */}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full ${getStatusBadge(source.sync_status)}`}>
                    {source.sync_status || 'idle'}
                  </span>
                  <span className="text-gray-500">
                    {source.documents_count || 0} documents
                  </span>
                  {source.auto_sync_enabled ? (
                    <span className="flex items-center text-green-600">
                      <Clock className="w-3 h-3 mr-1" />
                      Every {source.sync_interval_hours}h
                    </span>
                  ) : (
                    <span className="text-gray-400">Manual sync</span>
                  )}
                </div>

                {/* Sync times */}
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>Last sync: {formatDate(source.last_sync_at)}</span>
                </div>

                {/* Error message */}
                {source.last_error && (
                  <div className="mt-2 text-xs text-red-600 flex items-start">
                    <AlertCircle className="w-3 h-3 mr-1 mt-0.5 flex-shrink-0" />
                    <span className="truncate">{source.last_error}</span>
                  </div>
                )}
              </div>

              {/* Sync button */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleSync(source.id)}
                  disabled={syncing[source.id] || source.sync_status === 'syncing'}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Sync now"
                >
                  {syncing[source.id] ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-1" />
                      Sync
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScrapeSources;