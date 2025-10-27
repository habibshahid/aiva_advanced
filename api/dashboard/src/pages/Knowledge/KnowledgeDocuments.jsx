import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Upload, Globe, Search, Trash2, FileText, 
  Download, Eye, RefreshCw, AlertCircle, CheckCircle,
  Clock, Database, MessageSquare 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  getKnowledgeBase, 
  getDocuments, 
  deleteDocument,
  getKBStats
} from '../../services/knowledgeApi';
import DocumentUploader from '../../components/Knowledge/DocumentUploader';
import WebScraper from '../../components/Knowledge/WebScraper';
import ImageUploader from '../../components/Knowledge/ImageUploader';

const KnowledgeDocuments = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [kb, setKb] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('documents');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [kbResponse, docsResponse, statsResponse] = await Promise.all([
        getKnowledgeBase(id),
        getDocuments(id),
        getKBStats(id)
      ]);
      
      setKb(kbResponse.data.data);
      setDocuments(docsResponse.data.data.items || []);
      setStats(statsResponse.data.data);
    } catch (error) {
      toast.error('Failed to load documents');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure? This will delete all chunks and embeddings.')) {
      return;
    }

    try {
      await deleteDocument(id, docId);
      toast.success('Document deleted');
      loadData();
    } catch (error) {
      toast.error('Failed to delete document');
      console.error(error);
    }
  };

  const handleUploadComplete = () => {
    toast.success('Upload completed!');
    loadData();
    setActiveTab('documents');
  };

  const handleScrapeComplete = () => {
    toast.success('Scraping completed!');
    loadData();
    setActiveTab('documents');
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.original_filename.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Clock className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      completed: 'bg-green-100 text-green-800',
      processing: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      uploaded: 'bg-blue-100 text-blue-800'
    };
    return badges[status] || 'bg-gray-100 text-gray-800';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

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
          <button
            onClick={() => navigate('/knowledge')}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Knowledge Bases
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{kb?.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{kb?.description}</p>
        </div>
		<Link
			to={`/knowledge/${id}/chat`}
			className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
		  >
			<MessageSquare className="w-4 h-4 mr-2" />
			Test Chat
	    </Link>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Documents
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.total_documents || 0}
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
                  <Database className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Chunks
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.total_chunks || 0}
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
                  <Database className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Vectors
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.total_vectors || 0}
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
                  <Search className="h-6 w-6 text-gray-400" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Embedding Model
                    </dt>
                    <dd className="text-sm font-semibold text-gray-900">
                      {stats.embedding_model || 'N/A'}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('documents')}
              className={`${
                activeTab === 'documents'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <FileText className="w-5 h-5 mr-2" />
              Documents ({documents.length})
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`${
                activeTab === 'upload'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <Upload className="w-5 h-5 mr-2" />
              Upload Files
            </button>
            <button
              onClick={() => setActiveTab('scrape')}
              className={`${
                activeTab === 'scrape'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
            >
              <Globe className="w-5 h-5 mr-2" />
              Web Scraping
            </button>
			<button
			  onClick={() => setActiveTab('images')}
			  className={`${
				activeTab === 'images'
				  ? 'border-primary-500 text-primary-600'
				  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
			  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
			>
			  <ImageIcon className="w-5 h-5 mr-2" />
			  Upload Images
			</button>
          </nav>
        </div>

        <div className="p-6">
          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              {/* Search & Filters */}
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="processing">Processing</option>
                  <option value="failed">Failed</option>
                </select>
                <button
                  onClick={loadData}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh
                </button>
              </div>

              {/* Documents List */}
              {filteredDocuments.length === 0 ? (
				  <div className="text-center py-12">
					<FileText className="mx-auto h-12 w-12 text-gray-400" />
					<h3 className="mt-2 text-sm font-medium text-gray-900">No documents</h3>
					<p className="mt-1 text-sm text-gray-500">
					  Upload files or scrape websites to get started
					</p>
				  </div>
				) : (
				  <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg">
					<table className="min-w-full divide-y divide-gray-300">
					  <thead className="bg-gray-50">
						<tr>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/5">
							Document
						  </th>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
							Type
						  </th>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
							Size
						  </th>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
							Status
						  </th>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
							Stats
						  </th>
						  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
							Date
						  </th>
						  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
							Actions
						  </th>
						</tr>
					  </thead>
					  <tbody className="bg-white divide-y divide-gray-200">
						{filteredDocuments.map((doc) => (
						  <tr key={doc.id} className="hover:bg-gray-50">
							<td className="px-6 py-4">
							  <div className="flex items-center min-w-0">
								{getStatusIcon(doc.status)}
								<div className="ml-3 min-w-0 flex-1">
								  <div className="text-sm font-medium text-gray-900 truncate max-w-md" title={doc.original_filename}>
									{doc.original_filename}
								  </div>
								  {doc.metadata?.source_url && (
									<div className="text-xs text-gray-500 truncate max-w-md" title={doc.metadata.source_url}>
									  {doc.metadata.source_url}
									</div>
								  )}
								</div>
							  </div>
							</td>
							<td className="px-6 py-4 whitespace-nowrap">
							  <span className="text-xs text-gray-900 truncate block max-w-24" title={doc.file_type}>
								{doc.file_type.split('/')[1] || doc.file_type}
							  </span>
							</td>
							<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
							  {formatFileSize(doc.file_size_bytes)}
							</td>
							<td className="px-6 py-4 whitespace-nowrap">
							  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(doc.status)}`}>
								{doc.status}
							  </span>
							</td>
							<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
							  {doc.processing_stats ? (
								<div className="flex gap-3">
								  <span title="Chunks">
									📦 {doc.processing_stats.total_chunks || 0}
								  </span>
								  {doc.processing_stats.total_pages > 0 && (
									<span title="Pages">
									  📄 {doc.processing_stats.total_pages}
									</span>
								  )}
								</div>
							  ) : '-'}
							</td>
							<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
							  {new Date(doc.created_at).toLocaleDateString()}
							</td>
							<td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
							  <button
								onClick={() => handleDelete(doc.id)}
								className="text-red-600 hover:text-red-900"
								title="Delete document"
							  >
								<Trash2 className="w-4 h-4" />
							  </button>
							</td>
						  </tr>
						))}
					  </tbody>
					</table>
				  </div>
				)}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <DocumentUploader 
              kbId={id} 
              onComplete={handleUploadComplete}
            />
          )}

          {/* Scrape Tab */}
          {activeTab === 'scrape' && (
            <WebScraper 
              kbId={id} 
              onComplete={handleScrapeComplete}
            />
          )}
		  {activeTab === 'images' && (
			  <ImageUploader 
				kbId={id} 
				onComplete={handleUploadComplete}
			  />
		  )}
        </div>
      </div>
    </div>
  );
};

export default KnowledgeDocuments;