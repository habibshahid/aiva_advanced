import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BookOpen, Plus, Search, Trash2, Edit, Database, 
  FileText, Clock, AlertCircle 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getKnowledgeBases, deleteKnowledgeBase } from '../../services/knowledgeApi';

const KnowledgeList = () => {
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadKnowledgeBases();
  }, [filter]);

  const loadKnowledgeBases = async () => {
    try {
      setLoading(true);
      const response = await getKnowledgeBases({ 
        status: filter !== 'all' ? filter : undefined 
      });
      
      // FIXED: Access nested knowledge_bases array
      const kbs = response.data?.data?.knowledge_bases || [];
      setKnowledgeBases(kbs);
    } catch (error) {
      toast.error('Failed to load knowledge bases');
      console.error(error);
      setKnowledgeBases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This will delete all documents and data.')) {
      return;
    }

    try {
      await deleteKnowledgeBase(id);
      toast.success('Knowledge base deleted');
      loadKnowledgeBases();
    } catch (error) {
      toast.error('Failed to delete knowledge base');
      console.error(error);
    }
  };

  const filteredKBs = knowledgeBases.filter(kb =>
    kb.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    kb.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Knowledge Bases</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage documents and knowledge for your AI agents
          </p>
        </div>
        <Link
          to="/knowledge/new"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Knowledge Base
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search knowledge bases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Knowledge Base Grid */}
      {filteredKBs.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No knowledge bases</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new knowledge base
          </p>
          <div className="mt-6">
            <Link
              to="/knowledge/new"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Knowledge Base
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredKBs.map((kb) => (
            <div
              key={kb.id}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <Database className="h-8 w-8 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {kb.name}
                      </h3>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        kb.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {kb.status}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {kb.description || 'No description'}
                </p>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center text-sm text-gray-500">
                    <FileText className="w-4 h-4 mr-2" />
                    <span>{kb.stats?.document_count || 0} docs</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Database className="w-4 h-4 mr-2" />
                    <span>{kb.stats?.chunk_count || 0} chunks</span>
                  </div>
                </div>

                <div className="flex items-center text-xs text-gray-400 mb-4">
                  <Clock className="w-3 h-3 mr-1" />
                  Updated {new Date(kb.updated_at).toLocaleDateString()}
                </div>

                {/* Actions */}
                <div className="flex space-x-2">
                  <Link
                    to={`/knowledge/${kb.id}/documents`}
                    className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Documents
                  </Link>
                  <Link
                    to={`/knowledge/${kb.id}/edit`}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Edit className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(kb.id)}
                    className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default KnowledgeList;