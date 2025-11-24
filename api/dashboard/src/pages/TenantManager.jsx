/**
 * Tenant Manager Page
 * For service providers (super_admin) to manage tenants
 * File: api/dashboard/src/pages/TenantManager.jsx
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plus, 
  Search, 
  Users, 
  Bot, 
  Phone, 
  DollarSign,
  Key,
  LogIn,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  Copy,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const TenantManager = () => {
  const { user, login } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalTenants, setTotalTenants] = useState(0);
  const limit = 20;

  useEffect(() => {
    fetchTenants();
    fetchStats();
  }, [currentPage, search]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await api.get('/tenants', {
        params: {
          search,
          limit,
          offset: (currentPage - 1) * limit
        }
      });
      setTenants(response.data.data.tenants || []);
      setTotalTenants(response.data.data.total || 0);
    } catch (error) {
      console.error('Failed to fetch tenants:', error);
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/tenants/stats');
      setStats(response.data.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleViewTenant = async (tenantId) => {
    try {
      const response = await api.get(`/tenants/${tenantId}`);
      setSelectedTenant(response.data.data);
      setShowDetailModal(true);
      setActiveDropdown(null);
    } catch (error) {
      toast.error('Failed to load tenant details');
    }
  };

  const handleEmulate = async (tenant) => {
    if (!window.confirm(`Are you sure you want to login as ${tenant.name}? You will have admin access to their account.`)) {
      return;
    }

    try {
      const response = await api.post(`/tenants/${tenant.id}/emulate`);
      const { token, user: emulatedUser, tenant: emulatedTenant } = response.data.data;

      // Store original token for return
      localStorage.setItem('original_token', localStorage.getItem('token'));
      localStorage.setItem('emulation_active', 'true');
      localStorage.setItem('emulated_tenant_name', emulatedTenant.name);

      // Set new token and reload
      localStorage.setItem('token', token);
      
      toast.success(`Now viewing as ${emulatedTenant.name}`);
      
      // Reload the page to apply new auth context
      window.location.href = '/aiva';
      
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to emulate tenant');
    }
  };

  const handleGenerateApiKey = async (tenantId) => {
    if (!window.confirm('Generate new API key? This will invalidate any existing key.')) {
      return;
    }

    try {
      const response = await api.post(`/tenants/${tenantId}/api-key`);
      const apiKey = response.data.data.api_key;
      
      // Copy to clipboard
      navigator.clipboard.writeText(apiKey);
      toast.success('New API key generated and copied to clipboard!');
      
      fetchTenants();
      setActiveDropdown(null);
    } catch (error) {
      toast.error('Failed to generate API key');
    }
  };

  const handleDeactivate = async (tenant) => {
    if (!window.confirm(`Deactivate ${tenant.name}? All users will be unable to login.`)) {
      return;
    }

    try {
      await api.post(`/tenants/${tenant.id}/deactivate`);
      toast.success('Tenant deactivated');
      fetchTenants();
      setActiveDropdown(null);
    } catch (error) {
      toast.error('Failed to deactivate tenant');
    }
  };

  const handleReactivate = async (tenant) => {
    try {
      await api.post(`/tenants/${tenant.id}/reactivate`);
      toast.success('Tenant reactivated');
      fetchTenants();
      setActiveDropdown(null);
    } catch (error) {
      toast.error('Failed to reactivate tenant');
    }
  };

  const totalPages = Math.ceil(totalTenants / limit);

  return (
    <div className="space-y-6">
      {/* Emulation Banner */}
      {localStorage.getItem('emulation_active') === 'true' && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 flex items-center justify-between">
          <div className="flex items-center">
            <Eye className="h-5 w-5 text-yellow-600 mr-2" />
            <span className="text-yellow-800">
              You are viewing as: <strong>{localStorage.getItem('emulated_tenant_name')}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              const originalToken = localStorage.getItem('original_token');
              if (originalToken) {
                localStorage.setItem('token', originalToken);
                localStorage.removeItem('original_token');
                localStorage.removeItem('emulation_active');
                localStorage.removeItem('emulated_tenant_name');
                window.location.href = '/aiva/tenants';
              }
            }}
            className="bg-yellow-600 text-white px-4 py-1 rounded hover:bg-yellow-700"
          >
            Exit Emulation
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenant Manager</h1>
          <p className="text-gray-600">Manage your customer tenants</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create Tenant
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-primary-600" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total Tenants</p>
                <p className="text-2xl font-bold">{stats.total_tenants}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total Users</p>
                <p className="text-2xl font-bold">{stats.total_users}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Bot className="h-8 w-8 text-purple-600" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total Agents</p>
                <p className="text-2xl font-bold">{stats.total_agents}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-yellow-600" />
              <div className="ml-3">
                <p className="text-sm text-gray-500">Total Credits</p>
                <p className="text-2xl font-bold">${parseFloat(stats.total_credits || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            type="text"
            placeholder="Search tenants by name, company, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tenant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admin
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stats
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Credits
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                API Key
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">Loading tenants...</p>
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center">
                  <Building2 className="h-12 w-12 mx-auto text-gray-400" />
                  <p className="mt-2 text-gray-500">No tenants found</p>
                </td>
              </tr>
            ) : (
              tenants.map((tenant) => (
                <tr key={tenant.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary-600" />
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{tenant.name}</div>
                        <div className="text-sm text-gray-500">{tenant.company_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{tenant.admin_name || '-'}</div>
                    <div className="text-sm text-gray-500">{tenant.admin_email || '-'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex space-x-4 text-sm text-gray-500">
                      <span className="flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {tenant.user_count}
                      </span>
                      <span className="flex items-center">
                        <Bot className="h-4 w-4 mr-1" />
                        {tenant.agent_count}
                      </span>
                      <span className="flex items-center">
                        <Phone className="h-4 w-4 mr-1" />
                        {tenant.total_calls}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">
                      ${parseFloat(tenant.credit_balance || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {tenant.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {tenant.api_key_masked ? (
                      <div className="flex items-center">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {tenant.api_key_masked}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(tenant.api_key);
                            toast.success('API key copied');
                          }}
                          className="ml-2 text-gray-400 hover:text-gray-600"
                          title="Copy full key"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No key</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleViewTenant(tenant.id)}
                        className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEmulate(tenant)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Login As"
                      >
                        <LogIn className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTenant(tenant);
                          setShowCreditsModal(true);
                        }}
                        className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                        title="Add Credits"
                      >
                        <DollarSign className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleGenerateApiKey(tenant.id)}
                        className="p-1.5 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                        title="Generate API Key"
                      >
                        <Key className="h-4 w-4" />
                      </button>
                      {tenant.is_active ? (
                        <button
                          onClick={() => handleDeactivate(tenant)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Deactivate"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(tenant)}
                          className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Reactivate"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50 px-6 py-3 flex items-center justify-between border-t">
            <div className="text-sm text-gray-500">
              Showing {(currentPage - 1) * limit + 1} to {Math.min(currentPage * limit, totalTenants)} of {totalTenants}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border rounded disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <CreateTenantModal 
          onClose={() => setShowCreateModal(false)} 
          onCreated={() => {
            fetchTenants();
            fetchStats();
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Tenant Detail Modal */}
      {showDetailModal && selectedTenant && (
        <TenantDetailModal 
          tenant={selectedTenant}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedTenant(null);
          }}
        />
      )}

      {/* Add Credits Modal */}
      {showCreditsModal && selectedTenant && (
        <AddCreditsModal
          tenant={selectedTenant}
          onClose={() => {
            setShowCreditsModal(false);
            setSelectedTenant(null);
          }}
          onAdded={() => {
            fetchTenants();
            fetchStats();
            setShowCreditsModal(false);
            setSelectedTenant(null);
          }}
        />
      )}

    </div>
  );
};

// Create Tenant Modal Component
const CreateTenantModal = ({ onClose, onCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    initial_credits: 0
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/tenants', formData);
      toast.success('Tenant created successfully');
      onCreated();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create tenant');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Create New Tenant</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tenant Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., Acme Corp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={formData.company_name}
              onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., Acme Corporation Inc."
            />
          </div>

          <hr />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Name *
            </label>
            <input
              type="text"
              required
              value={formData.admin_name}
              onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., John Smith"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Email *
            </label>
            <input
              type="email"
              required
              value={formData.admin_email}
              onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., john@acme.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Admin Password *
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={formData.admin_password}
              onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Credits
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.initial_credits}
              onChange={(e) => setFormData({ ...formData, initial_credits: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="0.00"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Tenant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Tenant Detail Modal Component
const TenantDetailModal = ({ tenant, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">{tenant.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Basic Information</h3>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-gray-500">Company Name</dt>
                <dd className="text-sm font-medium">{tenant.company_name || '-'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Status</dt>
                <dd>
                  {tenant.is_active ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Inactive
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Credit Balance</dt>
                <dd className="text-sm font-medium">${parseFloat(tenant.credit_balance || 0).toFixed(4)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Created</dt>
                <dd className="text-sm">{new Date(tenant.created_at).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          {/* Stats */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Usage Statistics</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary-600">{tenant.user_count}</div>
                <div className="text-xs text-gray-500">Users</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">{tenant.agent_count}</div>
                <div className="text-xs text-gray-500">Agents</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{tenant.total_calls}</div>
                <div className="text-xs text-gray-500">Calls</div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{tenant.total_chat_sessions}</div>
                <div className="text-xs text-gray-500">Chat Sessions</div>
              </div>
            </div>
          </div>

          {/* API Key */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">API Key</h3>
            {tenant.api_key ? (
              <div className="flex items-center space-x-2">
                <code className="bg-gray-100 px-3 py-2 rounded text-sm flex-1">
                  {tenant.api_key}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(tenant.api_key);
                    toast.success('Copied to clipboard');
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <Copy className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No API key generated</p>
            )}
          </div>

          {/* Users */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Users ({tenant.users?.length || 0})</h3>
            {tenant.users && tenant.users.length > 0 ? (
              <div className="space-y-2">
                {tenant.users.map(user => (
                  <div key={user.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{user.name}</div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 
                        user.role === 'agent_manager' ? 'bg-blue-100 text-blue-800' : 
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role}
                      </span>
                      {user.is_active ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No users</p>
            )}
          </div>

          {/* Recent Agents */}
          {tenant.agents && tenant.agents.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Recent Agents</h3>
              <div className="space-y-2">
                {tenant.agents.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                    <div className="flex items-center">
                      <Bot className="h-5 w-5 text-gray-400 mr-2" />
                      <div>
                        <div className="font-medium text-sm">{agent.name}</div>
                        <div className="text-xs text-gray-500">{agent.type} • {agent.provider}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      agent.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Add Credits Modal Component
const AddCreditsModal = ({ tenant, onClose, onAdded }) => {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      await api.post(`/tenants/${tenant.id}/credits`, {
        amount: parseFloat(amount),
        note
      });
      toast.success('Credits added successfully');
      onAdded();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add credits');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Add Credits to {tenant.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="bg-gray-50 p-3 rounded-lg">
            <div className="text-sm text-gray-500">Current Balance</div>
            <div className="text-2xl font-bold">${parseFloat(tenant.credit_balance || 0).toFixed(4)}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount to Add *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-8 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., Initial credit allocation"
            />
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-sm text-green-700">
                New Balance: <strong>${(parseFloat(tenant.credit_balance || 0) + parseFloat(amount)).toFixed(4)}</strong>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Credits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TenantManager;