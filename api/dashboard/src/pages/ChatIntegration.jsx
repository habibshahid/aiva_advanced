/**
 * Chat Integration Page
 * Generate embed codes and configure widget
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Code, 
  Copy, 
  Check, 
  Globe,
  MessageSquare,
  Settings,
  Eye,
  ExternalLink,
  ArrowLeft
} from 'lucide-react';
import * as agentApi from '../services/api';
import toast from 'react-hot-toast';

const ChatIntegration = () => {
  const { id: agentId } = useParams();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    enable_chat_integration: false,
    chat_page_enabled: false,
    chat_page_slug: '',
    widget_config: {
      primary_color: '#6366f1',
      position: 'bottom-right',
      button_text: 'Chat with us',
      greeting_message: 'Hello! How can I help you today?'
    }
  });

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  const loadAgent = async () => {
    try {
      setLoading(true);
      const response = await agentApi.getAgent(agentId);
      const agentData = response.data.agent;
      
      setAgent(agentData);
      setConfig({
        enable_chat_integration: agentData.enable_chat_integration || false,
        chat_page_enabled: agentData.chat_page_enabled || false,
        chat_page_slug: agentData.chat_page_slug || '',
        widget_config: agentData.widget_config || config.widget_config
      });
    } catch (err) {
      console.error('Load agent error:', err);
      toast.error('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await agentApi.updateChatIntegration(agentId, config);
      toast.success('Integration settings saved');
      loadAgent();
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const widgetCode = `<!-- AIVA Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['AIVAWidget']=o;w[o] = w[o] || function () { (w[o].q = w[o].q || []).push(arguments) };
    js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
    js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', 'aiva', '${window.location.origin}/aiva/widget.js'));
  aiva('init', {
    agentId: '${agentId}',
    // API URL will auto-detect from widget source
    // Or explicitly set: apiUrl: 'https://your-domain.com/aiva/api/public/chat',
    primaryColor: '${config.widget_config.primary_color}',
    position: '${config.widget_config.position}'
  });
</script>`;

  const chatPageUrl = config.chat_page_slug 
    ? `${window.location.origin}/aiva/chat/${config.chat_page_slug}`
    : `${window.location.origin}/aiva/chat/${agentId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link
            to={`/agents/${agentId}`}
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Agent
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            Chat Integration - {agent?.name}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Embed your AI agent on websites or share a standalone chat page
          </p>
        </div>
      </div>

      {/* Integration Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Widget Integration */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <MessageSquare className="h-8 w-8 text-primary-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Chat Widget
                  </h3>
                  <p className="text-sm text-gray-500">
                    Embeddable chat bubble for your website
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enable_chat_integration}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    enable_chat_integration: e.target.checked
                  }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>

          {config.enable_chat_integration && (
            <div className="p-6 space-y-6">
              {/* Widget Configuration */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-gray-900">
                  Widget Appearance
                </h4>

                {/* Primary Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="color"
                      value={config.widget_config.primary_color}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        widget_config: {
                          ...prev.widget_config,
                          primary_color: e.target.value
                        }
                      }))}
                      className="h-10 w-20 rounded border border-gray-300"
                    />
                    <input
                      type="text"
                      value={config.widget_config.primary_color}
                      onChange={(e) => setConfig(prev => ({
                        ...prev,
                        widget_config: {
                          ...prev.widget_config,
                          primary_color: e.target.value
                        }
                      }))}
                      className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Position
                  </label>
                  <select
                    value={config.widget_config.position}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      widget_config: {
                        ...prev.widget_config,
                        position: e.target.value
                      }
                    }))}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>

                {/* Button Text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Button Text
                  </label>
                  <input
                    type="text"
                    value={config.widget_config.button_text}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      widget_config: {
                        ...prev.widget_config,
                        button_text: e.target.value
                      }
                    }))}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Embed Code */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Embed Code
                  </label>
                  <button
                    onClick={() => copyToClipboard(widgetCode)}
                    className="inline-flex items-center text-sm text-primary-600 hover:text-primary-700"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                    <code>{widgetCode}</code>
                  </pre>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Paste this code before the closing &lt;/body&gt; tag of your website
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Standalone Chat Page */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Globe className="h-8 w-8 text-primary-600" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Standalone Chat Page
                  </h3>
                  <p className="text-sm text-gray-500">
                    Full-page OpenAI-style chat interface
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.chat_page_enabled}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    chat_page_enabled: e.target.checked
                  }))}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>
            </div>
          </div>

          {config.chat_page_enabled && (
            <div className="p-6 space-y-6">
              {/* URL Slug */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Custom URL Slug (optional)
                </label>
                <div className="flex rounded-md shadow-sm">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
                    {window.location.origin}/aiva/chat/
                  </span>
                  <input
                    type="text"
                    value={config.chat_page_slug}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      chat_page_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                    }))}
                    placeholder={agentId}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border-gray-300 focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Leave empty to use agent ID
                </p>
              </div>

              {/* Chat Page URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Chat Page URL
                </label>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 font-mono">
                    {chatPageUrl}
                  </div>
                  <button
                    onClick={() => copyToClipboard(chatPageUrl)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={chatPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preview
                </label>
                <div className="border border-gray-300 rounded-lg overflow-hidden">
                  <iframe
                    src={chatPageUrl}
                    className="w-full h-96"
                    title="Chat Preview"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default ChatIntegration;