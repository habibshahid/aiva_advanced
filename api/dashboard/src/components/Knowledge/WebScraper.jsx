import React, { useState, useEffect, useRef } from 'react';
import { Globe, Link as LinkIcon, FileText, AlertCircle, CheckCircle, Loader, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { scrapeUrl, scrapeUrlAsync, getScrapeJobStatus, scrapeSitemap, testUrl } from '../../services/knowledgeApi';

const WebScraper = ({ kbId, onComplete }) => {
  const [mode, setMode] = useState('url');
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(20);
  const [testing, setTesting] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [scrapeResult, setScrapeResult] = useState(null);
  
  // Auto-sync settings
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(24);

  // Async job tracking
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const pollingRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Poll for job status when jobId is set
  useEffect(() => {
    if (!jobId) return;

    const pollStatus = async () => {
      try {
        const response = await getScrapeJobStatus(jobId);
        const status = response.data?.data || response.data;
        setJobStatus(status);

        if (status.status === 'completed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setScraping(false);
          setScrapeResult({
            total_pages_scraped: status.total_pages,
            documents_processed: status.pages_processed
          });
          toast.success('Scraping completed!');
          
          if (onComplete) {
            setTimeout(onComplete, 10000);
          }
        } else if (status.status === 'failed') {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setScraping(false);
          toast.error(status.error_message || 'Scraping failed');
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    };

    // Start polling every 2 seconds
    pollingRef.current = setInterval(pollStatus, 10000);
    pollStatus(); // Initial check

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [jobId, onComplete]);

  const handleTestUrl = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const response = await testUrl(url);
      setTestResult(response.data.data || response.data);
      
      if (response.data.data?.accessible || response.data.accessible) {
        toast.success('URL is accessible!');
      } else {
        toast.error('URL is not accessible');
      }
    } catch (error) {
      toast.error('Failed to test URL');
      console.error(error);
    } finally {
      setTesting(false);
    }
  };

  const handleScrape = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      setScraping(true);
      setScrapeResult(null);
      setJobStatus(null);
      setJobId(null);

      let response;
      if (mode === 'url') {
        // Use async endpoint for URL scraping
        response = await scrapeUrlAsync(kbId, {
          url,
          max_depth: maxDepth,
          max_pages: maxPages,
          metadata: {
            auto_sync_enabled: autoSyncEnabled,
            sync_interval_hours: syncIntervalHours
          }
        });

        const data = response.data?.data || response.data;
        
        if (data?.job_id) {
          setJobId(data.job_id);
          toast.success('Scraping started! Tracking progress...');
        } else {
          throw new Error('No job ID returned');
        }
      } else {
        // Sitemap mode - keep synchronous for now (usually faster)
        response = await scrapeSitemap(kbId, {
          sitemap_url: url,
          max_pages: maxPages,
          auto_sync_enabled: autoSyncEnabled,
          sync_interval_hours: syncIntervalHours
        });

        setScrapeResult(response.data.data || response.data);
        toast.success('Scraping completed!');
        setScraping(false);
        
        if (onComplete) {
          setTimeout(onComplete, 2000);
        }
      }
    } catch (error) {
      toast.error(error.response?.data?.error?.message || error.response?.data?.error || 'Failed to scrape website');
      console.error(error);
      setScraping(false);
    }
  };

  const resetForm = () => {
    setJobId(null);
    setJobStatus(null);
    setScrapeResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <div className="flex gap-4">
        <button
          onClick={() => setMode('url')}
          disabled={scraping}
          className={`flex-1 p-4 border-2 rounded-lg text-left transition-colors ${
            mode === 'url'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${scraping ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center">
            <Globe className="w-5 h-5 text-primary-600 mr-3" />
            <div>
              <div className="font-medium text-gray-900">Single URL</div>
              <div className="text-sm text-gray-500">Scrape a URL and follow links</div>
            </div>
          </div>
        </button>

        <button
          onClick={() => setMode('sitemap')}
          disabled={scraping}
          className={`flex-1 p-4 border-2 rounded-lg text-left transition-colors ${
            mode === 'sitemap'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          } ${scraping ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-primary-600 mr-3" />
            <div>
              <div className="font-medium text-gray-900">Sitemap</div>
              <div className="text-sm text-gray-500">Import from sitemap.xml</div>
            </div>
          </div>
        </button>
      </div>

      {/* URL Input */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {mode === 'url' ? 'Website URL' : 'Sitemap URL'}
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <LinkIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={mode === 'url' ? 'https://example.com' : 'https://example.com/sitemap.xml'}
              disabled={scraping}
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleTestUrl}
            disabled={testing || scraping || !url.trim()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Test URL'}
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-4 rounded-lg ${testResult.accessible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
          <div className="flex items-start">
            {testResult.accessible ? (
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            )}
            <div className="text-sm">
              <p className={`font-medium ${testResult.accessible ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.accessible ? 'URL is accessible' : 'URL is not accessible'}
              </p>
              {testResult.error && (
                <p className="text-red-600 mt-1">{testResult.error}</p>
              )}
              {testResult.needs_playwright && (
                <p className="text-yellow-600 mt-1">⚠️ Bot protection detected - will use browser automation</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scraping Options */}
      {mode === 'url' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Depth
            </label>
            <input
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value) || 2)}
              min={1}
              max={5}
              disabled={scraping}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              How deep to follow links (1-5)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Pages
            </label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 20)}
              min={1}
              max={100}
              disabled={scraping}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">
              Maximum pages to scrape (1-100)
            </p>
          </div>
        </div>
      )}

      {mode === 'sitemap' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Pages
          </label>
          <input
            type="number"
            value={maxPages}
            onChange={(e) => setMaxPages(parseInt(e.target.value) || 20)}
            min={1}
            max={100}
            disabled={scraping}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum pages to import from sitemap (1-100)
          </p>
        </div>
      )}

      {/* Auto-Sync Settings */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <RefreshCw className="w-5 h-5 text-primary-600 mr-2" />
            <div>
              <div className="font-medium text-gray-900">Auto-Sync</div>
              <div className="text-sm text-gray-500">Automatically re-scrape to detect content changes</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              disabled={scraping}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>

        {autoSyncEnabled && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sync Interval
            </label>
            <select
              value={syncIntervalHours}
              onChange={(e) => setSyncIntervalHours(parseInt(e.target.value))}
              disabled={scraping}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
            >
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Daily</option>
              <option value={72}>Every 3 days</option>
              <option value={168}>Weekly</option>
            </select>
          </div>
        )}
      </div>

      {/* Progress Status - NEW */}
      {jobStatus && scraping && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              <Loader className="w-5 h-5 text-blue-600 mr-2 animate-spin" />
              <span className="font-medium text-blue-700 capitalize">{jobStatus.status}</span>
            </div>
            <span className="text-sm text-blue-600 font-medium">{jobStatus.progress}%</span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-blue-200 rounded-full h-2 mb-3">
            <div 
              className="h-2 rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${jobStatus.progress}%` }}
            />
          </div>

          {/* Status Details */}
          <p className="text-sm text-blue-600">{jobStatus.current_step}</p>
          
          {jobStatus.pages_scraped > 0 && (
            <div className="mt-2 text-sm text-blue-600">
              Pages: {jobStatus.pages_processed}/{jobStatus.total_pages} processed
            </div>
          )}
        </div>
      )}

      {/* Info Box - Hide during scraping */}
      {!scraping && !scrapeResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">How web scraping works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Content is extracted from HTML pages</li>
                <li>Text is cleaned and processed automatically</li>
                <li>Documents are chunked and embedded for search</li>
                <li>Process may take several minutes depending on size</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Scrape Button */}
      <div className="flex justify-end">
        <button
          onClick={handleScrape}
          disabled={scraping || !url.trim()}
          className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scraping ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              {jobStatus ? `${jobStatus.status}...` : 'Starting...'}
            </>
          ) : (
            <>
              <Globe className="w-4 h-4 mr-2" />
              Start Scraping
            </>
          )}
        </button>
      </div>

      {/* Results */}
      {scrapeResult && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-700 flex-1">
              <p className="font-medium mb-2">Scraping completed successfully!</p>
              <div className="space-y-1">
                <p>• Pages scraped: {scrapeResult.total_pages_scraped || scrapeResult.documents_processed || 0}</p>
                <p>• Documents processed: {scrapeResult.documents_processed || scrapeResult.documents?.length || 0}</p>
                {autoSyncEnabled && (
                  <p className="text-primary-700 font-medium">
                    • Auto-sync enabled: Every {syncIntervalHours} hours
                  </p>
                )}
              </div>
              
              {/* Scrape Another Button */}
              <button
                onClick={resetForm}
                className="mt-4 inline-flex items-center px-4 py-2 border border-green-300 rounded-md text-sm font-medium text-green-700 bg-white hover:bg-green-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Scrape Another URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebScraper;