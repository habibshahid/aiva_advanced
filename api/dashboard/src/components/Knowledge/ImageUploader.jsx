import React, { useState, useCallback } from 'react';
import { Upload, X, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { uploadDocument } from '../../services/knowledgeApi';

const ImageUploader = ({ kbId, onComplete }) => {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addImages(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    addImages(selectedFiles);
  };

  const addImages = (newFiles) => {
    const validImages = newFiles.filter(file => {
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (!validTypes.includes(file.type)) {
        toast.error(`${file.name}: Invalid image type`);
        return false;
      }

      if (file.size > maxSize) {
        toast.error(`${file.name}: Image too large (max 10MB)`);
        return false;
      }

      return true;
    });

    // Create image objects with preview URLs and metadata fields
    const imageObjects = validImages.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending',
      preview: URL.createObjectURL(file),
      metadata: {
        title: '',
        description: '',
        tags: '',
        category: ''
      }
    }));

    setImages(prev => [...prev, ...imageObjects]);
  };

  const removeImage = (id) => {
    setImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image?.preview) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter(img => img.id !== id);
    });
  };

  const updateImageMetadata = (id, field, value) => {
    setImages(prev => prev.map(img => 
      img.id === id 
        ? { ...img, metadata: { ...img.metadata, [field]: value } }
        : img
    ));
  };

  const uploadImages = async () => {
    if (images.length === 0) {
      toast.error('Please select images to upload');
      return;
    }

    setUploading(true);

    for (const imageObj of images) {
      try {
        setImages(prev => prev.map(img => 
          img.id === imageObj.id ? { ...img, status: 'uploading' } : img
        ));

        const formData = new FormData();
        formData.append('file', imageObj.file);
        
        // Add metadata
        const metadata = {
          source: 'image_upload',
          content_type: 'image',
          uploaded_at: new Date().toISOString(),
          ...imageObj.metadata,
          tags: imageObj.metadata.tags ? imageObj.metadata.tags.split(',').map(t => t.trim()) : []
        };
        
        formData.append('metadata', JSON.stringify(metadata));

        await uploadDocument(kbId, formData, (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(prev => ({
            ...prev,
            [imageObj.id]: percentCompleted
          }));
        });

        setImages(prev => prev.map(img => 
          img.id === imageObj.id ? { ...img, status: 'completed' } : img
        ));

        toast.success(`${imageObj.file.name} uploaded successfully`);
      } catch (error) {
        console.error(`Error uploading ${imageObj.file.name}:`, error);
        setImages(prev => prev.map(img => 
          img.id === imageObj.id ? { ...img, status: 'failed' } : img
        ));
        toast.error(`Failed to upload ${imageObj.file.name}`);
      }
    }

    setUploading(false);

    // Check if all completed
    const allCompleted = images.every(img => img.status === 'completed' || img.status === 'failed');
    if (allCompleted && onComplete) {
      setTimeout(onComplete, 1000);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-12 text-center ${
          dragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <label htmlFor="image-upload" className="cursor-pointer">
            <span className="text-primary-600 hover:text-primary-500 font-medium">
              Choose images
            </span>
            <input
              id="image-upload"
              type="file"
              multiple
              className="sr-only"
              onChange={handleFileSelect}
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
            />
          </label>
          <span className="text-gray-600"> or drag and drop</span>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          JPG, PNG, GIF, WEBP up to 10MB
        </p>
      </div>

      {/* Image List with Metadata */}
      {images.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Images ({images.length})
            </h3>
            {!uploading && (
              <button
                onClick={() => {
                  images.forEach(img => URL.revokeObjectURL(img.preview));
                  setImages([]);
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="space-y-4">
            {images.map((imageObj) => (
              <div
                key={imageObj.id}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex gap-4">
                  {/* Image Preview */}
                  <div className="flex-shrink-0">
                    <img
                      src={imageObj.preview}
                      alt="Preview"
                      className="w-24 h-24 object-cover rounded"
                    />
                  </div>

                  {/* Metadata Form */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {imageObj.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(imageObj.file.size)}
                        </p>
                      </div>
                      
                      <div className="flex items-center ml-4">
                        {imageObj.status === 'pending' && !uploading && (
                          <button
                            onClick={() => removeImage(imageObj.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                        
                        {imageObj.status === 'uploading' && (
                          <div className="flex items-center">
                            <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                              <div
                                className="bg-primary-600 h-2 rounded-full transition-all"
                                style={{ width: `${uploadProgress[imageObj.id] || 0}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {uploadProgress[imageObj.id] || 0}%
                            </span>
                          </div>
                        )}
                        
                        {imageObj.status === 'completed' && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                        
                        {imageObj.status === 'failed' && (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    </div>

                    {/* Metadata Fields */}
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Title"
                        value={imageObj.metadata.title}
                        onChange={(e) => updateImageMetadata(imageObj.id, 'title', e.target.value)}
                        disabled={uploading}
                        className="text-sm rounded border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
                      />
                      <input
                        type="text"
                        placeholder="Category"
                        value={imageObj.metadata.category}
                        onChange={(e) => updateImageMetadata(imageObj.id, 'category', e.target.value)}
                        disabled={uploading}
                        className="text-sm rounded border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
                      />
                    </div>
                    
                    <input
                      type="text"
                      placeholder="Tags (comma-separated)"
                      value={imageObj.metadata.tags}
                      onChange={(e) => updateImageMetadata(imageObj.id, 'tags', e.target.value)}
                      disabled={uploading}
                      className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
                    />
                    
                    <textarea
                      placeholder="Description"
                      value={imageObj.metadata.description}
                      onChange={(e) => updateImageMetadata(imageObj.id, 'description', e.target.value)}
                      disabled={uploading}
                      rows={2}
                      className="w-full text-sm rounded border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      {images.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={uploadImages}
            disabled={uploading}
            className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : `Upload ${images.length} image${images.length > 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUploader;