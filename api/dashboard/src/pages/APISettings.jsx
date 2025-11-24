/**
 * API Settings Page
 * For tenants to view and manage their API key
 * File: api/dashboard/src/pages/APISettings.jsx
 */

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Copy, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  Shield,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Code,
  Terminal
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const APISettings = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState(null);
  const [maskedKey, setMaskedKey] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetchApiKey();
  }, []);

  const fetchApiKey = async () => {
    try {
      setLoading(true);
      const response = await api.get('/auth/api-key');
      setApiKey(response.data.api_key);
      setMaskedKey(response.data.masked_key);
      setHasKey(response.data.has_key);
    } catch (error) {
      console.error('Failed to fetch API key:', error);
      toast.error('Failed to load API key');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    const action = hasKey ? 'regenerate' : 'generate';
    
    if (hasKey && !window.confirm(
      'Are you sure you want to regenerate your API key? The current key will be invalidated immediately and any integrations using it will stop working.'
    )) {
      return;
    }

    try {
      setRegenerating(true);
      const response = await api.post('/auth/api-key/generate');
      setApiKey(response.data.api_key);
      setMaskedKey(`${response.data.api_key.substring(0, 7)}...${response.data.api_key.substring(response.data.api_key.length - 4)}`);
      setHasKey(true);
      setShowKey(true);
      
      // Copy to clipboard
      navigator.clipboard.writeText(response.data.api_key);
      toast.success(`API key ${action}d and copied to clipboard!`);
    } catch (error) {
      toast.error(`Failed to ${action} API key`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm(
      'Are you sure you want to revoke your API key? Any integrations using it will stop working immediately.'
    )) {
      return;
    }

    try {
      await api.delete('/auth/api-key');
      setApiKey(null);
      setMaskedKey(null);
      setHasKey(false);
      setShowKey(false);
      toast.success('API key revoked successfully');
    } catch (error) {
      toast.error('Failed to revoke API key');
    }
  };

  const handleCopy = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast.success('API key copied to clipboard');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Settings</h1>
        <p className="text-gray-600">Manage your API key for programmatic access</p>
      </div>

      {/* API Key Card */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0 h-12 w-12 rounded-lg bg-primary-100 flex items-center justify-center">
                <Key className="h-6 w-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <h2 className="text-lg font-semibold text-gray-900">API Key</h2>
                <p className="text-sm text-gray-500">
                  Use this key to authenticate API requests
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {hasKey ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  No Key
                </span>
              )}
            </div>
          </div>

          {hasKey ? (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your API Key
              </label>
              <div className="flex items-center space-x-2">
                <div className="flex-1 relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    readOnly
                    value={showKey ? apiKey : maskedKey || '••••••••••••••••'}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg font-mono text-sm"
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <button
                  onClick={handleCopy}
                  className="p-3 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="h-5 w-5 text-gray-600" />
                </button>
              </div>

              <div className="mt-4 flex space-x-3">
                <button
                  onClick={handleGenerate}
                  disabled={regenerating}
                  className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                  {regenerating ? 'Regenerating...' : 'Regenerate Key'}
                </button>
                <button
                  onClick={handleRevoke}
                  className="flex items-center px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Revoke Key
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No API Key Generated</h3>
                <p className="text-gray-500 mb-4">
                  Generate an API key to start using the AIVA API for your integrations.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={regenerating}
                  className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  <Key className="h-4 w-4 mr-2" />
                  {regenerating ? 'Generating...' : 'Generate API Key'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Keep your API key secure</h3>
            <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside space-y-1">
              <li>Never share your API key in public repositories or client-side code</li>
              <li>Store it securely in environment variables on your server</li>
              <li>Regenerate immediately if you suspect it has been compromised</li>
              <li>Each tenant can only have one active API key at a time</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Usage Examples */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Code className="h-5 w-5 mr-2" />
            Usage Examples
          </h2>

          <div className="space-y-6">
            {/* cURL Example */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                <Terminal className="h-4 w-4 mr-1" />
                cURL
              </h3>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-green-400 text-sm font-mono">
{`curl -X GET "${window.location.origin}/aiva/api/agents" \\
  -H "X-API-Key: ${apiKey || 'your_api_key'}" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
            </div>

            {/* JavaScript Example */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">JavaScript / Node.js</h3>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-green-400 text-sm font-mono">
{`const response = await fetch('${window.location.origin}/aiva/api/agents', {
  method: 'GET',
  headers: {
    'X-API-Key': '${apiKey || 'your_api_key'}',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);`}
                </pre>
              </div>
            </div>

            {/* Python Example */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Python</h3>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-green-400 text-sm font-mono">
{`import requests

response = requests.get(
    '${window.location.origin}/aiva/api/agents',
    headers={
        'X-API-Key': '${apiKey || 'your_api_key'}',
        'Content-Type': 'application/json'
    }
)

print(response.json())`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* API Documentation Link */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Documentation</h2>
            <p className="text-gray-500">
              View the complete API reference with all available endpoints
            </p>
          </div>
          <a
            href="/aiva/swagger/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View Swagger Docs
          </a>
        </div>
      </div>

      {/* Permissions Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Shield className="h-5 w-5 mr-2" />
          API Key Permissions
        </h2>
        <p className="text-gray-600 mb-4">
          Your API key has <strong>admin-level</strong> access to your tenant's resources. This includes:
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            'List and manage agents',
            'Access knowledge bases',
            'Start chat sessions',
            'View call logs',
            'Manage functions',
            'Access credit information'
          ].map((permission, index) => (
            <li key={index} className="flex items-center text-sm text-gray-600">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              {permission}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default APISettings;