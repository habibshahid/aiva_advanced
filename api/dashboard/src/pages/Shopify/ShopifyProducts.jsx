/**
 * Shopify Products Page
 * List and search synced products with pagination and advanced filters
 */

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  Package, 
  Search, 
  RefreshCw,
  ExternalLink,
  Eye,
  ShoppingBag,
  Tag,
  Box,
  ArrowUpDown
} from 'lucide-react';
import * as shopifyApi from '../../services/shopifyApi';
import ProductFilters from './ProductFilters';
import Pagination from '../../components/Pagination';

const ShopifyProducts = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const kbId = searchParams.get('kb_id');

  // State
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ vendors: [], product_types: [] });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
    has_next: false,
    has_prev: false
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    vendor: 'all',
    product_type: 'all',
    min_price: '',
    max_price: '',
    sort_by: 'created_at',
    sort_order: 'DESC'
  });

  // Load data on mount and when filters change
  useEffect(() => {
    if (kbId) {
      loadData();
    }
  }, [kbId, pagination.page, pagination.limit, filters]);

  // Load filter options on mount
  useEffect(() => {
    if (kbId) {
      loadFilterOptions();
    }
  }, [kbId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Build query params
      const params = {
        kb_id: kbId,
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === 'all') {
          delete params[key];
        }
      });

      const [productsRes, statsRes] = await Promise.all([
        shopifyApi.getProducts(params),
        shopifyApi.getProductStats({ kb_id: kbId })
      ]);

      setProducts(productsRes.data.data.products || []);
      setPagination({
		page: productsRes.data.data.pagination?.page || 1,
		limit: productsRes.data.data.pagination?.limit || 20,
		total: productsRes.data.data.pagination?.total || 0,
		total_pages: productsRes.data.data.pagination?.total_pages || 0,
		has_next: productsRes.data.data.pagination?.has_next || false,
		has_prev: productsRes.data.data.pagination?.has_prev || false
	  });
      setStats(statsRes.data.data);
    } catch (err) {
      console.error('Load data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFilterOptions = async () => {
    try {
      const response = await shopifyApi.getProductFilters(kbId);
      setFilterOptions(response.data.data);
    } catch (err) {
      console.error('Load filter options error:', err);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePageSizeChange = (newLimit) => {
    setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }));
  };

  const handleSort = (sortBy) => {
    setFilters(prev => ({
      ...prev,
      sort_by: sortBy,
      sort_order: prev.sort_by === sortBy && prev.sort_order === 'DESC' ? 'ASC' : 'DESC'
    }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      vendor: 'all',
      product_type: 'all',
      min_price: '',
      max_price: '',
      sort_by: 'created_at',
      sort_order: 'DESC'
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const formatPrice = (price) => {
    return `PKR ${parseFloat(price).toLocaleString()}`;
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      draft: 'bg-yellow-100 text-yellow-800',
      archived: 'bg-gray-100 text-gray-800'
    };
    return styles[status] || styles.active;
  };

  const getSortIcon = (field) => {
    if (filters.sort_by !== field) {
      return <ArrowUpDown className="w-4 h-4 text-gray-400" />;
    }
    return filters.sort_order === 'DESC' 
      ? <ArrowUpDown className="w-4 h-4 text-primary-600" />
      : <ArrowUpDown className="w-4 h-4 text-primary-600 transform rotate-180" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="mt-1 text-sm text-gray-500">
            Browse and manage synced products
          </p>
        </div>
        <Link
          to="/shopify"
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Back to Stores
        </Link>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Products */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Products
                    </dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-gray-900">
                        {stats.summary.total_products}
                      </div>
                      <div className="ml-2 flex items-baseline text-sm text-gray-600">
                        <span className="text-green-600">
                          {stats.by_status.active} active
                        </span>
                      </div>
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Vendors */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ShoppingBag className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Vendors
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.summary.total_vendors}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Product Types */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Tag className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Product Types
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.summary.total_product_types}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Inventory */}
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Box className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">
                      Total Inventory
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stats.summary.total_inventory.toLocaleString()}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white shadow rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col space-y-4">
            {/* Search & Basic Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Search */}
              <form onSubmit={handleSearch} className="flex-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="Search products, vendors, types..."
                  />
                </div>
              </form>

              {/* Status Filter */}
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange({ ...filters, status: e.target.value })}
                className="block rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>

              {/* Refresh */}
              <button
                onClick={loadData}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>

            {/* Advanced Filters */}
            <ProductFilters
              filters={filters}
              onChange={handleFilterChange}
              onReset={resetFilters}
              vendors={filterOptions.vendors}
              productTypes={filterOptions.product_types}
            />
          </div>
        </div>

        {/* Products Table */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No products found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Try adjusting your search or filters
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('title')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Product</span>
                        {getSortIcon('title')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('vendor')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Vendor</span>
                        {getSortIcon('vendor')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Price</span>
                        {getSortIcon('price')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <button
                        onClick={() => handleSort('total_inventory')}
                        className="flex items-center space-x-1 hover:text-gray-700"
                      >
                        <span>Stock</span>
                        {getSortIcon('total_inventory')}
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-12 w-12">
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt={product.title}
                                className="h-12 w-12 rounded object-cover"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded bg-gray-200 flex items-center justify-center">
                                <Package className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {product.title}
                            </div>
                            {product.product_type && (
                              <div className="text-sm text-gray-500">
                                {product.product_type}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {product.vendor || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatPrice(product.price)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {product.total_inventory || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(product.status)}`}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <Link
                          to={`/shopify/products/${product.id}`}
                          className="text-primary-600 hover:text-primary-900 mr-3"
                        >
                          <Eye className="w-4 h-4 inline" />
                        </Link>
                        {product.shopify_metadata?.handle && (
                          <a
                            href={`https://${product.shop_domain}/products/${product.shopify_metadata.handle}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <ExternalLink className="w-4 h-4 inline" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.total_pages}
              onPageChange={handlePageChange}
              pageSize={pagination.limit}
              onPageSizeChange={handlePageSizeChange}
              totalItems={pagination.total}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default ShopifyProducts;