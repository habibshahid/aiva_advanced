import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Search, Zap, FileText, Image as ImageIcon,
  Database, Clock, DollarSign, BarChart3
} from 'lucide-react';
import toast from 'react-hot-toast';
import { searchKnowledge, getKnowledgeBase } from '../../services/knowledgeApi';

const KnowledgeSearch = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [kb, setKb] = useState(null);
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(5);
  const [searchType, setSearchType] = useState('text');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);

  useEffect(() => {
    loadKB();
  }, [id]);

  const loadKB = async () => {
    try {
      const response = await getKnowledgeBase(id);
      setKb(response.data.data);
    } catch (error) {
      toast.error('Failed to load knowledge base');
      console.error(error);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    try {
      setSearching(true);
      const startTime = Date.now();

      const response = await searchKnowledge({
        kb_id: id,
        query: query,
        top_k: topK,
        search_type: searchType
      });

      const endTime = Date.now();
      const searchTime = endTime - startTime;

      const searchResult = {
        ...response.data.data,
        query: query,
        timestamp: new Date().toISOString(),
        searchTime: searchTime
      };

      setResults(searchResult);
      setSearchHistory(prev => [searchResult, ...prev.slice(0, 9)]);
      
      toast.success(`Found ${searchResult.results.total_found} results`);
    } catch (error) {
      toast.error('Search failed');
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  const loadHistoryQuery = (historyItem) => {
    setQuery(historyItem.query);
    setResults(historyItem);
  };

  const highlightText = (text, query) => {
    if (!query) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200">{part}</mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(`/knowledge/${id}/documents`)}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Documents
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Search Knowledge Base</h1>
          <p className="mt-1 text-sm text-gray-500">{kb?.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Search Panel */}
        <div className="lg:col-span-2 space-y-6">
          {/* Search Form */}
          <div className="bg-white shadow rounded-lg p-6">
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Query
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask a question or enter search terms..."
                    className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Results to Return
                  </label>
                  <select
                    value={topK}
                    onChange={(e) => setTopK(parseInt(e.target.value))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value={3}>Top 3</option>
                    <option value={5}>Top 5</option>
                    <option value={10}>Top 10</option>
                    <option value={20}>Top 20</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Type
                  </label>
                  <select
                    value={searchType}
                    onChange={(e) => setSearchType(e.target.value)}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="text">Text Only</option>
                    <option value="hybrid">Hybrid (Text + Image)</option>
                    <option value="image">Image Only</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={searching}
                className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {searching ? (
                  <>
                    <Zap className="w-5 h-5 mr-2 animate-pulse" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5 mr-2" />
                    Search
                  </>
                )}
              </button>
            </form>

            {/* Quick Examples */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs font-medium text-gray-700 mb-2">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'What is AIVA?',
                  'How to create an agent?',
                  'Pricing information',
                  'Supported languages',
                  'Integration options'
                ].map((example, i) => (
                  <button
                    key={i}
                    onClick={() => setQuery(example)}
                    className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="space-y-4">
              {/* Metrics */}
              <div className="bg-white shadow rounded-lg p-6">
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary-600">
                      {results.results.total_found}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Results Found</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {results.searchTime}ms
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Search Time</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {results.metrics.chunks_searched}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Chunks Searched</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      ${results.cost.toFixed(6)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Cost</div>
                  </div>
                </div>
              </div>

              {/* Text Results */}
              {results.results.text_results.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Text Results ({results.results.text_results.length})
                  </h3>
                  
                  <div className="space-y-4">
                    {results.results.text_results.map((result, index) => (
                      <div
                        key={result.result_id}
                        className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-primary-600">
                                #{index + 1}
                              </span>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {result.source.document_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                Chunk {result.source.chunk_index} • {result.type}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <div className="text-right">
                              <div className="text-xs text-gray-500">Relevance</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {(result.score * 100).toFixed(1)}%
                              </div>
                            </div>
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full"
                                style={{ width: `${result.score * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="text-sm text-gray-700 leading-relaxed">
                          {highlightText(result.content, query)}
                        </div>

                        {/* Metadata */}
                        {result.source.metadata && Object.keys(result.source.metadata).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(result.source.metadata).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-100 text-gray-600"
                                >
                                  {key}: {String(value)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results */}
              {results.results.total_found === 0 && (
                <div className="bg-white shadow rounded-lg p-12 text-center">
                  <Search className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Try adjusting your search query or adding more documents
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Initial State */}
          {!results && (
            <div className="bg-white shadow rounded-lg p-12 text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Ready to search</h3>
              <p className="mt-1 text-sm text-gray-500">
                Enter a query above to search the knowledge base
              </p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Search History */}
          {searchHistory.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
                <Clock className="w-4 h-4 mr-2" />
                Recent Searches
              </h3>
              
              <div className="space-y-2">
                {searchHistory.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => loadHistoryQuery(item)}
                    className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-gray-200 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.query}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        {item.results.total_found} results
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Search Tips</h3>
            <ul className="text-xs text-blue-700 space-y-2">
              <li>• Use natural language questions</li>
              <li>• Be specific for better results</li>
              <li>• Try different phrasings</li>
              <li>• Check relevance scores</li>
              <li>• Adjust top_k for more results</li>
            </ul>
          </div>

          {/* Stats */}
          {results && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Search Metrics</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Query Tokens</span>
                  <span className="font-medium text-gray-900">
                    {results.metrics.query_tokens || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Embedding Model</span>
                  <span className="font-medium text-gray-900 text-xs">
                    {results.metrics.embedding_model}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Processing Time</span>
                  <span className="font-medium text-gray-900">
                    {results.metrics.processing_time_ms}ms
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Search Cost</span>
                  <span className="font-medium text-green-600">
                    ${results.cost.toFixed(6)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeSearch;