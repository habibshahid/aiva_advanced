import React, { useState, useEffect } from 'react';
import { 
  Globe, RefreshCw, Trash2, Clock, AlertCircle, 
  CheckCircle, ExternalLink, Loader 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getScrapeSources, 
  updateScrapeSource, 
  deleteScrapeSource, 
  syncScrapeSource 
} from '../../services/knowledgeApi';

const ScrapeSources = ({ kbId, onRefresh }) => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState({});
  const [updating, setUpdating] = useState({});

  useEffect(() => {
    loadSources();
  }, [kbId]);

  const loadSources = async () => {
    try {
      setLoading(true);
      const response = await getScrapeSources(kbId);
      setSources(response.data.data?.sources || []);
    } catch (error) {
      console.error('Failed to load scrape sources:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save when toggle changes
  const handleAutoSyncToggle = async (sourceId, enabled) => {
    setUpdating(prev => ({ ...prev, [sourceId]: true }));
    try {
      await updateScrapeSource(sourceId, { auto_sync_enabled: enabled });
      toast.success(enabled ? 'Auto-sync enabled' : 'Auto-sync disabled');
      loadSources();
    } catch (error) {
      toast.error('Failed to update');
    } finally {
      setUpdating(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  // Auto-save when interval changes
  const handleIntervalChange = async (sourceId, hours) => {
    setUpdating(prev => ({ ...prev, [sourceId]: true }));
    try {
      await updateScrapeSource(sourceId, { sync_interval_hours: parseInt(hours) });
      toast.success('Sync interval updated');
      loadSources();
    } catch (error) {
      toast.error('Failed to update');
    } finally {
      setUpdating(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const handleSync = async (sourceId) => {
    setSyncing(prev => ({ ...prev, [sourceId]: true }));
    try {
      await syncScrapeSource(sourceId);
      toast.success('Sync completed');
      loadSources();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error('Sync failed');
    } finally {
      setSyncing(prev => ({ ...prev, [sourceId]: false }));
    }
  };

  const handleDelete = async (sourceId) => {
    if (!window.confirm('Delete this scrape source? Documents will remain but won\'t be tracked for sync.')) {
      return;
    }

    try {
      await deleteScrapeSource(sourceId);
      toast.success('Source deleted');
      loadSources();
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  const formatDate = (date) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleString();
  };

  const formatInterval = (hours) => {
    if (hours < 24) return `Every ${hours} hours`;
    if (hours === 24) return 'Daily';
    if (hours < 168) return `Every ${Math.round(hours / 24)} days`;
    return 'Weekly';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        <Globe className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="font-medium">No scrape sources yet</p>
        <p className="text-sm mt-1">
          Scrape a website above to track it here
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Synced Sources</h3>
        <button
          onClick={loadSources}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          <RefreshCw className="w-4 h-4 inline mr-1" />
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {sources.map((source) => (
          <div 
            key={source.id} 
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <Globe className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 truncate"
                  >
                    {source.url}
                    <ExternalLink className="w-3 h-3 inline ml-1" />
                  </a>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>{source.documents_count || 0} documents</span>
                  <span>•</span>
                  <span>Last sync: {formatDate(source.last_sync_at)}</span>
                  {source.sync_status === 'error' && (
                    <>
                      <span>•</span>
                      <span className="text-red-600 flex items-center">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Error
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleSync(source.id)}
                  disabled={syncing[source.id] || source.sync_status === 'syncing'}
                  className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded disabled:opacity-50"
                  title="Sync now"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing[source.id] ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => handleDelete(source.id)}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded"
                  title="Delete source"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Auto-sync settings */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <div className="flex items-center gap-4">
                {/* Toggle */}
                <label className="flex items-center cursor-pointer">
                  <span className="text-sm text-gray-600 mr-2">Auto-sync</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={source.auto_sync_enabled}
                      onChange={(e) => handleAutoSyncToggle(source.id, e.target.checked)}
                      disabled={updating[source.id]}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
                  </div>
                </label>

                {/* Interval dropdown - only show when auto-sync enabled */}
                {source.auto_sync_enabled && (
                  <select
                    value={source.sync_interval_hours}
                    onChange={(e) => handleIntervalChange(source.id, e.target.value)}
                    disabled={updating[source.id]}
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Daily</option>
                    <option value={72}>Every 3 days</option>
                    <option value={168}>Weekly</option>
                  </select>
                )}
              </div>

              {/* Next sync time */}
              {source.auto_sync_enabled && source.next_sync_at && (
                <div className="flex items-center text-xs text-gray-500">
                  <Clock className="w-3 h-3 mr-1" />
                  Next: {formatDate(source.next_sync_at)}
                </div>
              )}
            </div>

            {/* Error message */}
            {source.last_error && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {source.last_error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScrapeSources;