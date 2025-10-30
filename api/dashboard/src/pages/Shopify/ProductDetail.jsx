import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ExternalLink, RefreshCw, Trash2, Package, 
  DollarSign, Tag, ShoppingCart, Image as ImageIcon,
  Info, Calendar, Loader2, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getProduct, refreshProduct, deleteProduct } from '../../services/shopifyApi';

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);

  useEffect(() => {
    loadProduct();
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const data = await getProduct(id);
      setProduct(data);
      setSelectedImage(0);
    } catch (error) {
      console.error('Error loading product:', error);
      toast.error('Failed to load product details');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refreshProduct(id);
      toast.success('Product refreshed successfully');
      loadProduct();
    } catch (error) {
      console.error('Error refreshing product:', error);
      toast.error('Failed to refresh product');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product from the knowledge base? This will not affect your Shopify store.')) {
      return;
    }

    try {
      await deleteProduct(id);
      toast.success('Product deleted successfully');
      navigate(-1);
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  const openInShopify = () => {
    if (product?.shopify_metadata?.admin_url) {
      window.open(product.shopify_metadata.admin_url, '_blank');
    } else if (product?.shop_domain && product?.shopify_product_id) {
      window.open(`https://${product.shop_domain}/admin/products/${product.shopify_product_id}`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="w-16 h-16 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Product Not Found</h2>
        <p className="text-gray-600 mb-4">The product you're looking for doesn't exist.</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Go Back
        </button>
      </div>
    );
  }

  const images = product.images || [];
  const variants = product.variants || [];
  const tags = product.tags ? product.tags.map(t => t.trim()).filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Products
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
              <p className="mt-1 text-sm text-gray-500">
                Product ID: {product.shopify_product_id}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              
              <button
                onClick={openInShopify}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Edit in Shopify
              </button>

              <button
                onClick={handleDelete}
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Images */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              {images.length > 0 ? (
                <>
                  {/* Main Image */}
                  <div className="aspect-square bg-gray-100 flex items-center justify-center">
                    <img
                      src={images[selectedImage]?.url}
                      alt={product.title}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.target.src = '/placeholder-image.png';
                      }}
                    />
                  </div>

                  {/* Thumbnail Gallery */}
                  {images.length > 1 && (
                    <div className="p-4 grid grid-cols-4 gap-2">
                      {images.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSelectedImage(idx)}
                          className={`aspect-square rounded-lg overflow-hidden border-2 ${
                            selectedImage === idx
                              ? 'border-primary-500'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <img
                            src={img.url}
                            alt={`${product.title} ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="aspect-square bg-gray-100 flex items-center justify-center">
                  <ImageIcon className="w-24 h-24 text-gray-400" />
                </div>
              )}
            </div>

            {/* Image Stats */}
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Image Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Images:</span>
                  <span className="ml-2 font-medium">{images.length}</span>
                </div>
                <div>
                  <span className="text-gray-600">Primary Image:</span>
                  <span className="ml-2 font-medium">
                    {product.primary_image_id ? 'Set' : 'Not set'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Price & Status */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="text-3xl font-bold text-gray-900">
                    ${parseFloat(product.price || 0).toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    product.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {product.status || 'Unknown'}
                  </span>
                </div>
              </div>

              {product.compare_at_price && parseFloat(product.compare_at_price) > parseFloat(product.price) && (
                <div className="mt-2">
                  <p className="text-sm text-gray-600">
                    Compare at:{' '}
                    <span className="line-through">${parseFloat(product.compare_at_price).toFixed(2)}</span>
                    <span className="ml-2 text-red-600 font-medium">
                      Save ${(parseFloat(product.compare_at_price) - parseFloat(product.price)).toFixed(2)}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {product.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                  <Info className="w-5 h-5 mr-2" />
                  Description
                </h3>
                <div 
                  className="text-gray-700 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              </div>
            )}

            {/* Variants */}
            {variants.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Variants ({variants.length})
                </h3>
                <div className="space-y-3">
                  {variants.map((variant, idx) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900">{variant.title}</p>
                          {variant.sku && (
                            <p className="text-sm text-gray-600">SKU: {variant.sku}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            ${parseFloat(variant.price || 0).toFixed(2)}
                          </p>
                          {variant.compare_at_price && (
                            <p className="text-sm text-gray-500 line-through">
                              ${parseFloat(variant.compare_at_price).toFixed(2)}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                        <div>
                          <span className="text-gray-600">Inventory:</span>
                          <span className={`ml-2 font-medium ${
                            variant.inventory_quantity > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {variant.inventory_quantity || 0} units
                          </span>
                        </div>
                        {variant.weight && (
                          <div>
                            <span className="text-gray-600">Weight:</span>
                            <span className="ml-2 font-medium">
                              {variant.weight} {variant.weight_unit}
                            </span>
                          </div>
                        )}
                      </div>

                      {variant.barcode && (
                        <div className="mt-2 text-sm">
                          <span className="text-gray-600">Barcode:</span>
                          <span className="ml-2 font-mono text-gray-900">{variant.barcode}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Product Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Information</h3>
              <dl className="grid grid-cols-1 gap-4">
                {product.vendor && (
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Vendor</dt>
                    <dd className="mt-1 text-sm text-gray-900">{product.vendor}</dd>
                  </div>
                )}
                
                {product.product_type && (
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Product Type</dt>
                    <dd className="mt-1 text-sm text-gray-900">{product.product_type}</dd>
                  </div>
                )}

                {tags.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-gray-600 mb-2">Tags</dt>
                    <dd className="flex flex-wrap gap-2">
                      {tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                        >
                          <Tag className="w-3 h-3 mr-1" />
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}

                <div>
                  <dt className="text-sm font-medium text-gray-600">Created</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {new Date(product.created_at).toLocaleString()}
                  </dd>
                </div>

                <div>
                  <dt className="text-sm font-medium text-gray-600">Last Updated</dt>
                  <dd className="mt-1 text-sm text-gray-900 flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {new Date(product.updated_at).toLocaleString()}
                  </dd>
                </div>

                {product.shopify_metadata?.handle && (
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Product Handle</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">
                      {product.shopify_metadata.handle}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Shopify Metadata */}
            {product.shopify_metadata && Object.keys(product.shopify_metadata).length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Shopify Metadata</h3>
                <div className="space-y-2 text-sm">
                  {product.shopify_metadata.published_at && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Published:</span>
                      <span className="text-gray-900">
                        {new Date(product.shopify_metadata.published_at).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {product.shopify_metadata.template_suffix && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Template:</span>
                      <span className="text-gray-900">{product.shopify_metadata.template_suffix}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;