/**
 * Notification Settings Component
 * Admin/Tenant - Configure low balance alerts and other notifications
 */

import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Mail, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Trash2, 
  Send,
  RefreshCw,
  Clock,
  Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const NotificationSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  
  const [lowBalanceSettings, setLowBalanceSettings] = useState({
    is_enabled: false,
    threshold_value: 10.00,
    recipient_emails: [],
    notification_frequency: 'immediate'
  });
  
  const [newEmail, setNewEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load low balance notification settings
      const response = await api.get('/settings/notifications/low_balance');
      if (response.data.data) {
        setLowBalanceSettings(response.data.data);
      }
    } catch (error) {
      if (error.response?.status !== 404) {
        console.error('Load settings error:', error);
        toast.error('Failed to load notification settings');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const response = await api.get('/settings/notifications-logs?notification_type=low_balance&limit=20');
      setLogs(response.data.data.logs || []);
    } catch (error) {
      console.error('Load logs error:', error);
      toast.error('Failed to load notification logs');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings/notifications/low_balance', lowBalanceSettings);
      toast.success('Notification settings saved successfully!');
    } catch (error) {
      console.error('Save settings error:', error);
      toast.error(error.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleAddEmail = () => {
    if (!newEmail) {
      toast.error('Please enter an email address');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (lowBalanceSettings.recipient_emails.includes(newEmail)) {
      toast.error('This email is already in the list');
      return;
    }

    setLowBalanceSettings(prev => ({
      ...prev,
      recipient_emails: [...prev.recipient_emails, newEmail]
    }));
    setNewEmail('');
    toast.success('Email added');
  };

  const handleRemoveEmail = (email) => {
    setLowBalanceSettings(prev => ({
      ...prev,
      recipient_emails: prev.recipient_emails.filter(e => e !== email)
    }));
    toast.success('Email removed');
  };

  const handleTestNotification = async () => {
    if (!testEmail) {
      toast.error('Please enter a test email address');
      return;
    }

    setTesting(true);
    try {
      await api.post('/settings/notifications/test', {
        notification_type: 'low_balance',
        recipient_email: testEmail
      });
      toast.success('Test notification sent successfully!');
    } catch (error) {
      console.error('Test notification error:', error);
      toast.error(error.response?.data?.message || 'Failed to send test notification');
    } finally {
      setTesting(false);
    }
  };

  const toggleLogs = async () => {
    if (!showLogs) {
      await loadLogs();
    }
    setShowLogs(!showLogs);
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
        <h1 className="text-2xl font-bold text-gray-900">Notification Settings</h1>
        <p className="text-gray-600 mt-1">Configure email alerts and notifications for your account</p>
      </div>

      {/* Low Balance Notification Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <AlertTriangle className="w-6 h-6 text-amber-600 mr-3" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Low Balance Alert</h2>
              <p className="text-sm text-gray-600 mt-0.5">
                Get notified when your credit balance falls below a threshold
              </p>
            </div>
          </div>
          
          {/* Enable/Disable Toggle */}
          <label className="flex items-center cursor-pointer">
            <span className="mr-3 text-sm font-medium text-gray-700">Enabled</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={lowBalanceSettings.is_enabled}
                onChange={(e) => setLowBalanceSettings(prev => ({ 
                  ...prev, 
                  is_enabled: e.target.checked 
                }))}
                className="sr-only"
              />
              <div className={`block w-14 h-8 rounded-full transition ${
                lowBalanceSettings.is_enabled ? 'bg-primary-600' : 'bg-gray-300'
              }`}></div>
              <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                lowBalanceSettings.is_enabled ? 'transform translate-x-6' : ''
              }`}></div>
            </div>
          </label>
        </div>

        <div className="space-y-6">
          {/* Threshold Setting */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <DollarSign className="w-4 h-4 inline mr-1" />
              Alert Threshold
            </label>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={lowBalanceSettings.threshold_value}
                onChange={(e) => setLowBalanceSettings(prev => ({
                  ...prev,
                  threshold_value: parseFloat(e.target.value) || 0
                }))}
                className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <span className="text-sm text-gray-600 ml-3">
                Alert when balance falls below this amount
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 Tip: Set this to at least 2-3 days worth of your average daily usage
            </p>
          </div>

          {/* Notification Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Clock className="w-4 h-4 inline mr-1" />
              Notification Frequency
            </label>
            <select
              value={lowBalanceSettings.notification_frequency}
              onChange={(e) => setLowBalanceSettings(prev => ({
                ...prev,
                notification_frequency: e.target.value
              }))}
              className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="immediate">Immediate (once per day max)</option>
              <option value="daily">Daily Digest</option>
              <option value="weekly">Weekly Summary</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">
              Prevents spam by limiting notification frequency
            </p>
          </div>

          {/* Recipient Emails */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Mail className="w-4 h-4 inline mr-1" />
              Recipient Email Addresses
            </label>
            
            {/* Add Email Form */}
            <div className="flex gap-2 mb-3">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
                placeholder="email@example.com"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <button
                onClick={handleAddEmail}
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                <Plus className="w-5 h-5 mr-1" />
                Add
              </button>
            </div>

            {/* Email List */}
            {lowBalanceSettings.recipient_emails.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <Mail className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No recipients added yet</p>
                <p className="text-sm text-gray-500">Add email addresses to receive notifications</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lowBalanceSettings.recipient_emails.map((email, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-center">
                      <Mail className="w-4 h-4 text-gray-500 mr-2" />
                      <span className="text-gray-900">{email}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="text-red-600 hover:text-red-700 p-1 hover:bg-red-50 rounded transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving || lowBalanceSettings.recipient_emails.length === 0}
            className="flex items-center px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5 mr-2" />
                Save Settings
              </>
            )}
          </button>

          <button
            onClick={toggleLogs}
            className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
          >
            <Eye className="w-5 h-5 mr-2" />
            {showLogs ? 'Hide' : 'View'} Notification History
          </button>
        </div>

        {lowBalanceSettings.recipient_emails.length === 0 && (
          <p className="text-sm text-amber-600 mt-4 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Please add at least one recipient email address before saving
          </p>
        )}
      </div>

      {/* Test Notification Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center mb-4">
          <Send className="w-6 h-6 text-primary-600 mr-3" />
          <h2 className="text-xl font-semibold text-gray-900">Send Test Notification</h2>
        </div>

        <p className="text-gray-600 mb-4">
          Send a test low balance notification to verify your settings.
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
            onClick={handleTestNotification}
            disabled={testing || !testEmail}
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
      </div>

      {/* Notification History */}
      {showLogs && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Clock className="w-6 h-6 text-primary-600 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Notification History</h2>
            </div>
            <button
              onClick={loadLogs}
              className="text-primary-600 hover:text-primary-700 p-2 hover:bg-primary-50 rounded transition"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <Bell className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">No notifications sent yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start justify-between p-4 rounded-lg border ${
                    log.status === 'sent'
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start flex-1">
                    {log.status === 'sent' ? (
                      <CheckCircle className="w-5 h-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${
                        log.status === 'sent' ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {log.recipient_email}
                      </p>
                      <p className="text-sm text-gray-600 mt-0.5">{log.subject}</p>
                      {log.error_message && (
                        <p className="text-sm text-red-700 mt-1">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 ml-4 whitespace-nowrap">
                    {new Date(log.sent_at || log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <h3 className="font-semibold text-blue-900 mb-2">💡 How Low Balance Alerts Work</h3>
        <ul className="list-disc list-inside space-y-1 text-sm text-blue-800">
          <li>Alerts are sent when your balance drops below the threshold</li>
          <li>Maximum one alert per 24 hours to prevent spam</li>
          <li>All recipients will receive the notification</li>
          <li>Notifications include current balance and threshold</li>
          <li>You'll receive a link to add more credits</li>
        </ul>
      </div>
    </div>
  );
};

export default NotificationSettings;