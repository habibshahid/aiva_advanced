import React, { useState } from 'react';
import { Globe, Link as LinkIcon, FileText, AlertCircle, CheckCircle, Loader, RefreshCw, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { scrapeUrl, scrapeSitemap, testUrl } from '../../services/knowledgeApi';

const WebScraper = ({ kbId, onComplete }) => {
  const [mode, setMode] = useState('url'); // 'url' or 'sitemap'
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(20);
  const [testing, setTesting] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [scrapeResult, setScrapeResult] = useState(null);
  
  // Auto-sync settings (NEW)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(24);

  const handleTestUrl = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const response = await testUrl(url);
      setTestResult(response.data.data);
      
      if (response.data.data.accessible) {
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

      let response;
      if (mode === 'url') {
        response = await scrapeUrl(kbId, {
          url,
          max_depth: maxDepth,
          max_pages: maxPages,
          metadata: {
            source: 'web_scrape',
            scraped_at: new Date().toISOString(),
            // NEW: Include auto-sync settings
            auto_sync_enabled: autoSyncEnabled,
            sync_interval_hours: syncIntervalHours
          }
        });
      } else {
        response = await scrapeSitemap(kbId, {
          sitemap_url: url,
          max_pages: maxPages,
          metadata: {
            source: 'sitemap_scrape',
            scraped_at: new Date().toISOString(),
            // NEW: Include auto-sync settings
            auto_sync_enabled: autoSyncEnabled,
            sync_interval_hours: syncIntervalHours
          }
        });
      }

      setScrapeResult(response.data.data);
      toast.success('Scraping completed!');
      
      if (onComplete) {
        setTimeout(onComplete, 2000);
      }
    } catch (error) {
      toast.error('Failed to scrape website');
      console.error(error);
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Selection */}
      <div className="flex gap-4">
        <button
          onClick={() => setMode('url')}
          className={`flex-1 p-4 border-2 rounded-lg text-left transition-colors ${
            mode === 'url'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
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
          className={`flex-1 p-4 border-2 rounded-lg text-left transition-colors ${
            mode === 'sitemap'
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
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
              className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={handleTestUrl}
            disabled={testing || !url.trim()}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin inline" />
                Testing...
              </>
            ) : (
              'Test URL'
            )}
          </button>
        </div>
        
        {testResult && (
          <div className={`mt-2 p-3 rounded-md ${
            testResult.accessible ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            <div className="flex items-center">
              {testResult.accessible ? (
                <CheckCircle className="w-5 h-5 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 mr-2" />
              )}
              <div className="text-sm">
                {testResult.accessible ? (
                  <>
                    Accessible • Status: {testResult.status_code} • Type: {testResult.content_type}
                  </>
                ) : (
                  <>
                    Not accessible • {testResult.error || `Status: ${testResult.status_code}`}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Settings */}
      {mode === 'url' && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Depth
            </label>
            <input
              type="number"
              value={maxDepth}
              onChange={(e) => setMaxDepth(parseInt(e.target.value))}
              min={1}
              max={5}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              How many levels of links to follow (1-5)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Pages
            </label>
            <input
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value))}
              min={1}
              max={100}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
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
            onChange={(e) => setMaxPages(parseInt(e.target.value))}
            min={1}
            max={100}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Maximum pages to import from sitemap (1-100)
          </p>
        </div>
      )}

      {/* NEW: Auto-Sync Settings */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <RefreshCw className="w-5 h-5 text-gray-600 mr-2" />
            <div>
              <div className="font-medium text-gray-900">Auto-Sync</div>
              <div className="text-sm text-gray-500">Automatically detect and update changed content</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
          </label>
        </div>

        {autoSyncEnabled && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Sync Interval
            </label>
            <select
              value={syncIntervalHours}
              onChange={(e) => setSyncIntervalHours(parseInt(e.target.value))}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Every 24 hours (Daily)</option>
              <option value={48}>Every 48 hours</option>
              <option value={72}>Every 72 hours</option>
              <option value={168}>Every week</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Content will be checked for changes at this interval. Only changed pages will be re-processed.
            </p>
          </div>
        )}
      </div>

      {/* Info Box */}
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
              Scraping...
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
            <div className="text-sm text-green-700">
              <p className="font-medium mb-2">Scraping completed successfully!</p>
              <div className="space-y-1">
                <p>
                  • {mode === 'url' ? 'Pages scraped' : 'URLs found'}: {scrapeResult.total_pages_scraped || scrapeResult.total_urls_found}
                </p>
                <p>• Documents processed: {scrapeResult.documents_processed || scrapeResult.documents?.length}</p>
                <p>• Base URL: {scrapeResult.base_url || url}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebScraper;