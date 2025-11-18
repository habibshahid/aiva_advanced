/**
 * Help Center Page
 * Comprehensive user documentation and guides integrated into the frontend
 */

import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  ChevronRight, 
  Home,
  Users,
  Bot,
  Database,
  Store,
  MessageSquare,
  Phone,
  Settings,
  HelpCircle,
  PlayCircle,
  FileText,
  Zap
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HelpCenter = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Help categories with icons
  const categories = [
    { id: 'all', name: 'All Topics', icon: BookOpen, color: 'primary' },
    { id: 'getting-started', name: 'Getting Started', icon: Home, color: 'green' },
    { id: 'agents', name: 'AI Agents', icon: Bot, color: 'purple' },
    { id: 'knowledge', name: 'Knowledge Base', icon: Database, color: 'blue' },
    { id: 'shopify', name: 'Shopify', icon: Store, color: 'yellow' },
    { id: 'chat', name: 'Chat Integration', icon: MessageSquare, color: 'pink' },
    { id: 'voice', name: 'Voice Calls', icon: Phone, color: 'indigo' },
    { id: 'users', name: 'User Management', icon: Users, color: 'cyan' },
    { id: 'settings', name: 'Settings', icon: Settings, color: 'gray' },
  ];

  // Help articles organized by category
  const articles = [
    // Getting Started
    {
      id: 'intro',
      category: 'getting-started',
      title: 'Introduction to AIVA',
      description: 'Learn about AIVA platform capabilities and features',
      content: 'intro',
      icon: BookOpen,
      quickStart: true
    },
    {
      id: 'first-agent',
      category: 'getting-started',
      title: 'Create Your First AI Agent (5 min)',
      description: 'Step-by-step guide to creating your first voice or chat agent',
      content: 'first-agent',
      icon: Zap,
      quickStart: true
    },
    {
      id: 'dashboard-overview',
      category: 'getting-started',
      title: 'Dashboard Overview',
      description: 'Understanding the dashboard and navigation',
      content: 'dashboard',
      icon: Home
    },
    {
      id: 'user-roles',
      category: 'getting-started',
      title: 'User Roles & Permissions',
      description: 'Understanding different user roles and their capabilities',
      content: 'roles',
      icon: Users
    },

    // AI Agents
    {
      id: 'agent-basics',
      category: 'agents',
      title: 'Understanding AI Agents',
      description: 'What are AI agents and how do they work?',
      content: 'agent-basics',
      icon: Bot
    },
    {
      id: 'create-agent',
      category: 'agents',
      title: 'Creating & Configuring Agents',
      description: 'Complete guide to agent creation and settings',
      content: 'create-agent',
      icon: Bot,
      video: true
    },
    {
      id: 'agent-voice',
      category: 'agents',
      title: 'Voice Settings & Configuration',
      description: 'Configure voice, speed, and tone for voice agents',
      content: 'agent-voice',
      icon: Phone
    },
    {
      id: 'agent-testing',
      category: 'agents',
      title: 'Testing Your Agents',
      description: 'How to test voice and chat agents',
      content: 'agent-testing',
      icon: PlayCircle
    },
    {
      id: 'conversation-strategy',
      category: 'agents',
      title: 'Conversation Strategy',
      description: 'Turn detection, interruptions, and conversation flow',
      content: 'conversation-strategy',
      icon: MessageSquare
    },

    // Knowledge Base
    {
      id: 'kb-overview',
      category: 'knowledge',
      title: 'Knowledge Base Overview',
      description: 'What is a knowledge base and how to use it',
      content: 'kb-overview',
      icon: Database
    },
    {
      id: 'upload-documents',
      category: 'knowledge',
      title: 'Uploading Documents',
      description: 'Upload PDFs, Word docs, presentations, and more',
      content: 'upload-documents',
      icon: FileText,
      quickStart: true
    },
    {
      id: 'web-scraping',
      category: 'knowledge',
      title: 'Web Scraping Guide',
      description: 'Scrape websites and import content',
      content: 'web-scraping',
      icon: Database
    },
    {
      id: 'image-management',
      category: 'knowledge',
      title: 'Image Upload & Search',
      description: 'Managing images and visual search',
      content: 'image-management',
      icon: Database
    },
    {
      id: 'kb-search',
      category: 'knowledge',
      title: 'Testing Knowledge Search',
      description: 'How to test and optimize search results',
      content: 'kb-search',
      icon: Search
    },
    {
      id: 'semantic-cache',
      category: 'knowledge',
      title: 'Semantic Cache Management',
      description: 'Understanding and managing semantic cache',
      content: 'semantic-cache',
      icon: Zap
    },

    // Shopify
    {
      id: 'shopify-overview',
      category: 'shopify',
      title: 'Shopify Integration Overview',
      description: 'Connect your Shopify store to AIVA',
      content: 'shopify-overview',
      icon: Store
    },
    {
      id: 'connect-shopify',
      category: 'shopify',
      title: 'Connecting Your Shopify Store',
      description: 'Step-by-step guide to connect Shopify',
      content: 'connect-shopify',
      icon: Store,
      quickStart: true,
      video: true
    },
    {
      id: 'product-sync',
      category: 'shopify',
      title: 'Product Synchronization',
      description: 'Auto-sync and manual sync explained',
      content: 'product-sync',
      icon: Store
    },
    {
      id: 'product-recommendations',
      category: 'shopify',
      title: 'AI Product Recommendations',
      description: 'How AI recommends products to customers',
      content: 'product-recommendations',
      icon: Store
    },

    // Chat Integration
    {
      id: 'chat-overview',
      category: 'chat',
      title: 'Chat Integration Overview',
      description: 'Widget vs standalone chat page',
      content: 'chat-overview',
      icon: MessageSquare
    },
    {
      id: 'chat-widget',
      category: 'chat',
      title: 'Installing Chat Widget',
      description: 'Add chat widget to your website',
      content: 'chat-widget',
      icon: MessageSquare,
      quickStart: true,
      video: true
    },
    {
      id: 'chat-page',
      category: 'chat',
      title: 'Standalone Chat Page',
      description: 'Create a public chat page',
      content: 'chat-page',
      icon: MessageSquare
    },
    {
      id: 'chat-customization',
      category: 'chat',
      title: 'Customizing Chat Interface',
      description: 'Colors, branding, and styling',
      content: 'chat-customization',
      icon: Settings
    },

    // Voice
    {
      id: 'voice-overview',
      category: 'voice',
      title: 'Voice Calls Overview',
      description: 'How voice integration works',
      content: 'voice-overview',
      icon: Phone
    },
    {
      id: 'test-call',
      category: 'voice',
      title: 'Making Test Calls',
      description: 'Test your voice agents',
      content: 'test-call',
      icon: Phone
    },
    {
      id: 'call-monitoring',
      category: 'voice',
      title: 'Call Monitoring & Logs',
      description: 'Monitor active calls and view history',
      content: 'call-monitoring',
      icon: Phone
    },

    // User Management
    {
      id: 'create-users',
      category: 'users',
      title: 'Creating & Managing Users',
      description: 'Add team members and assign roles',
      content: 'create-users',
      icon: Users,
      roles: ['super_admin', 'admin']
    },
    {
      id: 'user-permissions',
      category: 'users',
      title: 'User Permissions',
      description: 'Understanding permission levels',
      content: 'user-permissions',
      icon: Users,
      roles: ['super_admin', 'admin']
    },

    // Settings
    {
      id: 'account-settings',
      category: 'settings',
      title: 'Account Settings',
      description: 'Manage your profile and preferences',
      content: 'account-settings',
      icon: Settings
    },
    {
      id: 'api-keys',
      category: 'settings',
      title: 'API Keys Management',
      description: 'Generate and manage API keys',
      content: 'api-keys',
      icon: Settings,
      roles: ['super_admin', 'admin']
    },
    {
      id: 'credits-billing',
      category: 'settings',
      title: 'Credits & Billing',
      description: 'Manage credits and track usage',
      content: 'credits-billing',
      icon: Settings,
      roles: ['super_admin', 'admin']
    },
  ];

  // Filter articles based on search and category
  const filteredArticles = useMemo(() => {
    let filtered = articles;

    // Filter by user role
    if (user) {
      filtered = filtered.filter(article => 
        !article.roles || article.roles.includes(user.role)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(article => article.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(term) ||
        article.description.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [articles, selectedCategory, searchTerm, user]);

  // Quick start articles
  const quickStartArticles = articles.filter(a => a.quickStart);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 rounded-lg shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Help Center</h1>
            <p className="text-primary-100">
              Everything you need to know about AIVA
            </p>
          </div>
          <BookOpen className="w-16 h-16 text-primary-200" />
        </div>

        {/* Search Bar */}
        <div className="mt-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for help articles..."
              className="w-full pl-12 pr-4 py-3 rounded-lg bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white"
            />
          </div>
        </div>
      </div>

      {/* Quick Start Section */}
      {!searchTerm && selectedCategory === 'all' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center mb-4">
            <Zap className="w-6 h-6 text-yellow-500 mr-2" />
            <h2 className="text-xl font-semibold text-gray-900">Quick Start Guides</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickStartArticles.map((article) => (
              <Link
                key={article.id}
                to={`/help/${article.id}`}
                className="p-4 border-2 border-primary-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-colors"
              >
                <div className="flex items-start">
                  <article.icon className="w-6 h-6 text-primary-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">{article.title}</h3>
                    <p className="text-sm text-gray-600">{article.description}</p>
                    {article.video && (
                      <span className="inline-flex items-center mt-2 text-xs text-primary-600">
                        <PlayCircle className="w-3 h-3 mr-1" />
                        Video available
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category.id)}
              className={`p-4 rounded-lg border-2 transition-all ${
                selectedCategory === category.id
                  ? `border-${category.color}-500 bg-${category.color}-50`
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <category.icon className={`w-6 h-6 mx-auto mb-2 ${
                selectedCategory === category.id
                  ? `text-${category.color}-600`
                  : 'text-gray-400'
              }`} />
              <div className="text-sm font-medium text-gray-900 text-center">
                {category.name}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Articles List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {selectedCategory === 'all' ? 'All Articles' : categories.find(c => c.id === selectedCategory)?.name}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredArticles.length} articles)
            </span>
          </h2>
        </div>
        
        {filteredArticles.length === 0 ? (
          <div className="p-12 text-center">
            <HelpCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No articles found</h3>
            <p className="text-gray-500">
              Try adjusting your search or browse different categories
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredArticles.map((article) => (
              <Link
                key={article.id}
                to={`/help/${article.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start flex-1">
                    <article.icon className="w-6 h-6 text-primary-600 mr-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900 mb-1">
                        {article.title}
                      </h3>
                      <p className="text-gray-600">{article.description}</p>
                      <div className="flex items-center mt-2 space-x-3">
                        {article.quickStart && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            <Zap className="w-3 h-3 mr-1" />
                            Quick Start
                          </span>
                        )}
                        {article.video && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            <PlayCircle className="w-3 h-3 mr-1" />
                            Video
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Support Section */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-start">
          <HelpCircle className="w-6 h-6 text-primary-600 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Still need help?
            </h3>
            <p className="text-gray-600 mb-3">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <a
              href="mailto:support@contegris.com"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;