import React, { useState } from 'react';
import { Search, Loader2, Image as ImageIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { searchImages } from '../../services/knowledgeApi';

const ImageSearch = ({ kbId }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState('text');

  const handleSearch = async (e) => {
    e.preventDefault();
    
    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    try {
      setLoading(true);
      const result = await searchImages(kbId, {
        query: query,
        search_type: searchType,
        top_k: 10
      });
      
      setResults(result.results || []);
      
      if (result.results?.length === 0) {
        toast('No images found matching your query');
      } else {
        toast.success(`Found ${result.results.length} images`);
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Failed to search images');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <form onSubmit={handleSearch} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search for images
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., red shoes, product images, etc."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Results */}
      {results.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Search Results ({results.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((result, idx) => (
              <div
                key={result.result_id || idx}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Placeholder for image */}
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-gray-400" />
                </div>

                {/* Result Info */}
                <div className="p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {result.filename || 'Image'}
                    </p>
                    <span className="text-xs font-semibold text-primary-600">
                      {(result.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  {result.metadata?.description && (
                    <p className="text-xs text-gray-600 truncate">
                      {result.metadata.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageSearch;