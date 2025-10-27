import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  createKnowledgeBase, 
  updateKnowledgeBase, 
  getKnowledgeBase 
} from '../../services/knowledgeApi';

const KnowledgeEditor = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'general',
    status: 'active',
    settings: {
      chunk_size: 500,
      chunk_overlap: 50,
      embedding_model: 'text-embedding-3-small'
    }
  });

  useEffect(() => {
    if (isEdit) {
      loadKnowledgeBase();
    }
  }, [id]);

  const loadKnowledgeBase = async () => {
    try {
      setLoading(true);
      const response = await getKnowledgeBase(id);
      const kb = response.data.data;
      setFormData({
        name: kb.name,
        description: kb.description || '',
        type: kb.type,
        status: kb.status,
        settings: kb.settings || formData.settings
      });
    } catch (error) {
      toast.error('Failed to load knowledge base');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    try {
      setLoading(true);

      if (isEdit) {
        await updateKnowledgeBase(id, formData);
        toast.success('Knowledge base updated');
      } else {
        const response = await createKnowledgeBase(formData);
        toast.success('Knowledge base created');
        navigate(`/knowledge/${response.data.data.id}/documents`);
        return;
      }

      navigate('/knowledge');
    } catch (error) {
      toast.error(isEdit ? 'Failed to update' : 'Failed to create');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/knowledge')}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Knowledge Bases
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Knowledge Base' : 'New Knowledge Base'}
          </h1>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg">
        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="e.g., Product Documentation"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="Describe what this knowledge base contains..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="general">General</option>
                    <option value="documentation">Documentation</option>
                    <option value="faq">FAQ</option>
                    <option value="support">Support</option>
                    <option value="product_catalog">Product Catalog</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-4">Processing Settings</h3>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex">
                <AlertCircle className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  These settings control how documents are processed and indexed. Default values work well for most cases.
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chunk Size (tokens)
                </label>
                <input
                  type="number"
                  value={formData.settings.chunk_size}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, chunk_size: parseInt(e.target.value) }
                  })}
                  min={100}
                  max={2000}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">Recommended: 500</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chunk Overlap (tokens)
                </label>
                <input
                  type="number"
                  value={formData.settings.chunk_overlap}
                  onChange={(e) => setFormData({
                    ...formData,
                    settings: { ...formData.settings, chunk_overlap: parseInt(e.target.value) }
                  })}
                  min={0}
                  max={200}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500">Recommended: 50</p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Embedding Model
              </label>
              <select
                value={formData.settings.embedding_model}
                onChange={(e) => setFormData({
                  ...formData,
                  settings: { ...formData.settings, embedding_model: e.target.value }
                })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="text-embedding-3-small">text-embedding-3-small (Fast, Affordable)</option>
                <option value="text-embedding-3-large">text-embedding-3-large (High Quality)</option>
                <option value="text-embedding-ada-002">text-embedding-ada-002 (Legacy)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between rounded-b-lg">
          <button
            type="button"
            onClick={() => navigate('/knowledge')}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default KnowledgeEditor;