/**
 * System Settings Component
 * Super Admin only - Configure SMTP email settings
 */

import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Server, 
  Lock, 
  User, 
  Send, 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  EyeOff,
  Save,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const SystemSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [config, setConfig] = useState({
    host: '',
    port: '587',
    secure: 'false',
    user: '',
    password: '',
    from_name: 'AIVA Platform',
    from_email: '',
    enabled: 'false'
  });
  
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await api.get('/settings/system/smtp');
      setConfig(response.data.data);
      setLoading(false);
    } catch (error) {
      console.error('Load config error:', error);
      toast.error('Failed to load SMTP configuration');
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settingsToUpdate = {
        smtp_host: config.host,
        smtp_port: config.port,
        smtp_secure: config.secure,
        smtp_user: config.user,
        smtp_password: config.password,
        smtp_from_name: config.from_name,
        smtp_from_email: config.from_email,
        smtp_enabled: config.enabled
      };

      await api.put('/settings/system', settingsToUpdate);
      toast.success('SMTP configuration saved successfully!');
      setTestResult(null); // Clear previous test results
    } catch (error) {
      console.error('Save config error:', error);
      toast.error(error.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await api.post('/settings/system/smtp/test', {
        test_email: testEmail
      });

      const result = response.data.data;
      setTestResult(result);

      if (result.success) {
        toast.success('Test email sent successfully!');
      } else {
        toast.error(`Test failed: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error('Test email error:', error);
      const errorMsg = error.response?.data?.message || 'Failed to send test email';
      setTestResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await api.post('/settings/system/smtp/test', {
        config: {
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.user,
          password: config.password
        }
      });

      const result = response.data.data;
      setTestResult(result);

      if (result.success) {
        toast.success('SMTP connection successful!');
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Test connection error:', error);
      const errorMsg = error.response?.data?.message || 'Failed to test connection';
      setTestResult({ success: false, message: errorMsg });
      toast.error(errorMsg);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="text-gray-600 mt-1">Configure SMTP email settings for the platform</p>
      </div>

      {/* SMTP Configuration Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Mail className="w-6 h-6 text-primary-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">SMTP Configuration</h2>
          </div>
          
          {/* Enable/Disable Toggle */}
          <label className="flex items-center cursor-pointer">
            <span className="mr-3 text-sm font-medium text-gray-700">Email Sending</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={config.enabled === 'true'}
                onChange={(e) => setConfig(prev => ({ 
                  ...prev, 
                  enabled: e.target.checked ? 'true' : 'false' 
                }))}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full transition ${
                config.enabled === 'true' ? 'bg-primary-600' : 'bg-gray-300'
              }`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                config.enabled === 'true' ? 'transform translate-x-6' : ''
              }`}></div>
            </div>
          </label>
        </div>

        <div className="space-y-4">
          {/* SMTP Server */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Server className="w-4 h-4 inline mr-1" />
                SMTP Host
              </label>
              <input
                type="text"
                name="host"
                value={config.host}
                onChange={handleChange}
                placeholder="smtp.gmail.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port
              </label>
              <input
                type="text"
                name="port"
                value={config.port}
                onChange={handleChange}
                placeholder="587"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Secure Connection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Lock className="w-4 h-4 inline mr-1" />
              Connection Security
            </label>
            <select
              name="secure"
              value={config.secure}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="false">TLS/STARTTLS (Port 587)</option>
              <option value="true">SSL (Port 465)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Use TLS/STARTTLS for port 587, SSL for port 465
            </p>
          </div>

          {/* Authentication */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                SMTP Username / Email
              </label>
              <input
                type="text"
                name="user"
                value={config.user}
                onChange={handleChange}
                placeholder="your-email@gmail.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Lock className="w-4 h-4 inline mr-1" />
                SMTP Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={config.password}
                  onChange={handleChange}
                  placeholder="••••••••••••••••"
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                For Gmail: Use App Password, not regular password
              </p>
            </div>
          </div>

          {/* Sender Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                From Name
              </label>
              <input
                type="text"
                name="from_name"
                value={config.from_name}
                onChange={handleChange}
                placeholder="AIVA Platform"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Mail className="w-4 h-4 inline mr-1" />
                From Email
              </label>
              <input
                type="email"
                name="from_email"
                value={config.from_email}
                onChange={handleChange}
                placeholder="noreply@yourdomain.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Save Configuration
              </>
            )}
          </button>

          <button
            onClick={handleTestConnection}
            disabled={testing || !config.host || !config.user || !config.password}
            className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testing ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Server className="w-5 h-5 mr-2" />
                Test Connection
              </>
            )}
          </button>
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`mt-4 p-4 rounded-lg flex items-start ${
            testResult.success 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`font-medium ${
                testResult.success ? 'text-green-900' : 'text-red-900'
              }`}>
                {testResult.success ? 'Success!' : 'Failed'}
              </p>
              <p className={`text-sm mt-1 ${
                testResult.success ? 'text-green-700' : 'text-red-700'
              }`}>
                {testResult.message}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Send Test Email Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Send className="w-6 h-6 text-primary-600 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Send Test Email</h2>
        </div>

        <p className="text-gray-600 mb-4">
          Send a test email to verify that your SMTP configuration is working correctly.
        </p>

        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="recipient@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleTestEmail}
            disabled={testing || !testEmail || config.enabled !== 'true'}
            className="flex items-center px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {testing ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-5 h-5 mr-2" />
                Send Test
              </>
            )}
          </button>
        </div>

        {config.enabled !== 'true' && (
          <p className="text-sm text-amber-600 mt-2 flex items-center">
            <AlertCircle className="w-4 h-4 mr-1" />
            Email sending is currently disabled. Enable it above to send test emails.
          </p>
        )}
      </div>

      {/* Gmail Configuration Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="font-semibold text-blue-900 mb-2">📱 Gmail Configuration Tips</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Enable 2-Factor Authentication in your Google Account</li>
          <li>Go to Security → App passwords</li>
          <li>Generate a new app password for "Mail"</li>
          <li>Use the 16-character app password (not your regular password)</li>
          <li>Host: smtp.gmail.com, Port: 587, Security: TLS</li>
        </ol>
      </div>
    </div>
  );
};

export default SystemSettings;