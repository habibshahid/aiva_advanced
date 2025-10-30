import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Trash2, Download, Search, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { listImages, deleteImage } from '../../services/knowledgeApi';

const ImageGallery = ({ kbId, refreshTrigger }) => {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    loadImages();
  }, [kbId, page, refreshTrigger]);

  const loadImages = async () => {
    try {
      setLoading(true);
      const result = await listImages(kbId, page, 20);
      setImages(result.images);
      setTotalPages(result.total_pages);
    } catch (error) {
      console.error('Error loading images:', error);
      toast.error('Failed to load images');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (imageId) => {
    if (!confirm('Are you sure you want to delete this image?')) {
      return;
    }

    try {
      await deleteImage(kbId, imageId);
      toast.success('Image deleted successfully');
      loadImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error('Failed to delete image');
    }
  };

  const filteredImages = images.filter(img => 
    img.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    img.metadata?.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="text-center py-12">
        <ImageIcon className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-600">No images uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search images..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredImages.map((image) => (
          <div
            key={image.id}
            className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setSelectedImage(image)}
          >
            {/* ✅ FIXED: Show actual image instead of placeholder */}
            <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
              {image.url || image.thumbnail_url ? (
                <img
                  src={image.url || image.thumbnail_url}
                  alt={image.filename}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to icon if image fails to load
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="hidden w-full h-full items-center justify-center">
                <ImageIcon className="w-12 h-12 text-gray-400" />
              </div>
            </div>

            {/* Image Info */}
            <div className="p-3">
              <p className="text-sm font-medium text-gray-900 truncate">
                {image.filename}
              </p>
              <p className="text-xs text-gray-500">
                {(image.file_size_bytes / 1024).toFixed(1)} KB
              </p>
              {image.metadata?.description && (
                <p className="text-xs text-gray-600 mt-1 truncate">
                  {image.metadata.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(image.id);
                }}
                className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {/* Image Detail Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">{selectedImage.filename}</h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* ✅ FIXED: Show actual full-size image */}
              <div className="w-full bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                {selectedImage.url ? (
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.filename}
                    className="max-w-full max-h-[60vh] object-contain"
                    onError={(e) => {
                      // Fallback to icon if image fails to load
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div className="hidden w-full h-64 items-center justify-center">
                  <ImageIcon className="w-16 h-16 text-gray-400" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">File Size:</span>
                  <span className="ml-2 font-medium">
                    {(selectedImage.file_size_bytes / 1024).toFixed(1)} KB
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Type:</span>
                  <span className="ml-2 font-medium">{selectedImage.content_type}</span>
                </div>
                {selectedImage.width && selectedImage.height && (
                  <div>
                    <span className="text-gray-600">Dimensions:</span>
                    <span className="ml-2 font-medium">
                      {selectedImage.width} × {selectedImage.height}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-gray-600">Uploaded:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedImage.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {selectedImage.metadata?.description && (
                <div>
                  <p className="text-sm text-gray-600">Description:</p>
                  <p className="text-sm mt-1">{selectedImage.metadata.description}</p>
                </div>
              )}

              {selectedImage.metadata?.tags && (
                <div>
                  <p className="text-sm text-gray-600">Tags:</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedImage.metadata.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Button */}
              <div className="flex justify-end">
                <a
                  href={selectedImage.url}
                  download={selectedImage.filename}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;