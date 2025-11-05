/**
 * Product Filters Component
 * Advanced filtering for products
 */

import React from 'react';
import { Filter, X } from 'lucide-react';

const ProductFilters = ({ 
  filters, 
  onChange, 
  onReset,
  vendors = [],
  productTypes = []
}) => {
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  const hasActiveFilters = 
    filters.vendor !== 'all' || 
    filters.product_type !== 'all' ||
    filters.min_price ||
    filters.max_price;

  return (
    <div className="space-y-4">
      {/* Basic Filters Row */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          <Filter className="w-4 h-4 mr-2" />
          Advanced Filters
        </button>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="inline-flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <X className="w-4 h-4 mr-1" />
            Clear Filters
          </button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Vendor Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vendor
              </label>
              <select
                value={filters.vendor || 'all'}
                onChange={(e) => handleChange('vendor', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Vendors</option>
                {vendors.map((vendor) => (
                  <option key={vendor} value={vendor}>
                    {vendor}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Type
              </label>
              <select
                value={filters.product_type || 'all'}
                onChange={(e) => handleChange('product_type', e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              >
                <option value="all">All Types</option>
                {productTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Min Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Price (PKR)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={filters.min_price || ''}
                onChange={(e) => handleChange('min_price', e.target.value)}
                placeholder="0"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>

            {/* Max Price */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Price (PKR)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                value={filters.max_price || ''}
                onChange={(e) => handleChange('max_price', e.target.value)}
                placeholder="No limit"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductFilters;