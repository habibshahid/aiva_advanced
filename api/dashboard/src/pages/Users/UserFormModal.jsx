/**
 * User Form Modal
 * Create/Edit user form
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const UserFormModal = ({ user, onSave, onClose }) => {
  const { user: currentUser } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'client',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name,
        email: user.email,
        password: '', // Never pre-fill password
        role: user.role,
        is_active: user.is_active
      });
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validation
      if (!formData.name || !formData.email) {
        throw new Error('Name and email are required');
      }

      if (!user && !formData.password) {
        throw new Error('Password is required for new users');
      }

      if (formData.password && formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Prepare data
      const submitData = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        is_active: formData.is_active
      };

      // Only include password if it's being set/changed
      if (formData.password) {
        submitData.password = formData.password;
      }

      await onSave(submitData);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Determine which roles the current user can assign
  const availableRoles = () => {
    if (currentUser?.role === 'super_admin') {
      return [
        { value: 'super_admin', label: 'Super Admin' },
        { value: 'admin', label: 'Admin' },
        { value: 'agent_manager', label: 'Agent Manager' },
        { value: 'client', label: 'Client' }
      ];
    } else if (currentUser?.role === 'admin') {
      return [
        { value: 'admin', label: 'Admin' },
        { value: 'agent_manager', label: 'Agent Manager' },
        { value: 'client', label: 'Client' }
      ];
    } else {
      return [
        { value: 'agent_manager', label: 'Agent Manager' },
        { value: 'client', label: 'Client' }
      ];
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {user ? 'Edit User' : 'Create User'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Alert */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder="John Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder="john@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {!user && '*'}
            </label>
            <input
              type="password"
              required={!user}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder={user ? 'Leave blank to keep current' : 'Min 6 characters'}
              minLength={6}
            />
            {user && (
              <p className="mt-1 text-xs text-gray-500">
                Leave blank to keep current password
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role *
            </label>
            <select
              required
              value={formData.role}
              onChange={(e) => handleChange('role', e.target.value)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {availableRoles().map(role => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          {/* Role Descriptions */}
          <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600">
            <p className="font-medium mb-1">Role Permissions:</p>
            <ul className="space-y-1">
              <li><strong>Super Admin:</strong> Full system access</li>
              <li><strong>Admin:</strong> Manage users, credits, agents</li>
              <li><strong>Agent Manager:</strong> Create and manage agents</li>
              <li><strong>Client:</strong> View-only access</li>
            </ul>
          </div>

          {/* Active Status */}
          {user && (
            <div className="flex items-center">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700">
                Account is active
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : user ? 'Update User' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserFormModal;