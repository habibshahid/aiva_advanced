import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import AgentEditor from './pages/AgentEditorV2';
//import AgentEditorV2 from './pages/AgentEditorV2';
import Credits from './pages/Credits';
import Calls from './pages/Calls';
import Monitor from './pages/Monitor';
import AgentTest from './pages/AgentTest';
import AgentTestChat from './pages/AgentTestChat';
import Layout from './components/Layout';

// Knowledge Base Pages
import KnowledgeList from './pages/Knowledge/KnowledgeList';
import KnowledgeEditor from './pages/Knowledge/KnowledgeEditor';
import KnowledgeDocuments from './pages/Knowledge/KnowledgeDocuments';
import KnowledgeSearch from './pages/Knowledge/KnowledgeSearch';
import KnowledgeStats from './pages/Knowledge/KnowledgeStats';
import KnowledgeChat from './pages/Knowledge/KnowledgeChat';

// Shopify Pages
import ShopifyIntegration from './pages/Shopify/ShopifyIntegration';
import ConnectStore from './pages/Shopify/ConnectStore';
import ShopifyProducts from './pages/Shopify/ShopifyProducts';
import StoreSettings from './pages/Shopify/StoreSettings';
import ProductDetail from './pages/Shopify/ProductDetail';

import ConversationStrategy from './pages/ConversationStrategy';
import UserManagement from './pages/Users/UserManagement';

import ChatIntegration from './pages/ChatIntegration';
import ChatPage from './pages/Public/ChatPage';

import HelpCenter from './pages/HelpCenter';
import HelpArticle from './pages/HelpArticle';

import SystemSettings from './pages/SystemSettings';
import NotificationSettings from './pages/NotificationSettings';

import AnalyticsDashboard from './pages/Analytics/Dashboard';
import CallsReport from './pages/Analytics/CallsReport';
import ChatsReport from './pages/Analytics/ChatsReport';
import AdvancedAnalytics from './pages/Analytics/AdvancedAnalytics';
import CostAnalytics from './pages/Analytics/CostAnalytics';
import SatisfactionReport from './pages/Analytics/SatisfactionReport';

import TenantManager from './pages/TenantManager';
import APISettings from './pages/APISettings';

import IntentIVRConfig from './pages/IntentIVRConfig';

import { FlowsList, FlowEditor, SessionsMonitor, FlowTemplates, FlowAnalytics } from './pages/FlowEngine';

import { ivrRoutes } from './routes/ivrRoutes';

// PrivateRoute must be inside Router to use useLocation
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router basename="/aiva">
        <Routes>
          <Route path="/login" element={<Login />} />
          
		  <Route path="/chat/:agentId" element={<ChatPage />} />
		  
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="monitor" element={<Monitor />} />
			
			<Route path="analytics/dashboard" element={<AnalyticsDashboard />} />
			<Route path="analytics/calls" element={<CallsReport />} />
			<Route path="analytics/chats" element={<ChatsReport />} />
			<Route path="analytics/advanced" element={<AdvancedAnalytics />} />
			<Route path="analytics/costs" element={<CostAnalytics />} />
			<Route path="analytics/satisfaction" element={<SatisfactionReport />} />
			
			<Route path="tenants" element={<TenantManager />} />
			<Route path="settings/api" element={<APISettings />} />
			
            <Route path="agents" element={<Agents />} />
            <Route path="agents/test" element={<AgentTest />} />
            <Route path="agents/new" element={<AgentEditor />} />
            <Route path="agents/:id" element={<AgentEditor />} />
            <Route path="agents/:id/edit-v2" element={<AgentEditor />} />
            <Route path="agents/new-v2" element={<AgentEditor />} />
			<Route path="agents/:id/chat-integration" element={<ChatIntegration />} />
			<Route path="/agents/:id/conversation-strategy" element={<ConversationStrategy />} />
            <Route path="credits" element={<Credits />} />
            <Route path="calls" element={<Calls />} />
            <Route path="/test" element={<AgentTest />} />
			<Route path="agent-test" element={<AgentTestChat />} />
			<Route path="/agents/:id/ivr" element={<IntentIVRConfig />} />
			{ivrRoutes}
			
				{/* Flow Engine Routes */}
				<Route path="agents/:agentId/flows" element={<FlowsList />} />
				<Route path="agents/:agentId/flows/sessions" element={<SessionsMonitor />} />
				<Route path="agents/:agentId/flows/templates" element={<FlowTemplates />} />
				<Route path="agents/:agentId/flows/analytics" element={<FlowAnalytics />} />
				<Route path="agents/:agentId/flows/:flowId" element={<FlowEditor />} />
			
            {/* Knowledge Base Routes */}
            <Route path="knowledge" element={<KnowledgeList />} />
            <Route path="knowledge/new" element={<KnowledgeEditor />} />
            <Route path="knowledge/:id/edit" element={<KnowledgeEditor />} />
            <Route path="knowledge/:id/documents" element={<KnowledgeDocuments />} />
            <Route path="knowledge/:id/search" element={<KnowledgeSearch />} />
            <Route path="knowledge/:id/stats" element={<KnowledgeStats />} />
            <Route path="knowledge/:id/chat" element={<KnowledgeChat />} />
            
			<Route path="settings/system" element={<SystemSettings />} />
			<Route path="settings/notifications" element={<NotificationSettings />} />
	
			<Route path="help" element={<HelpCenter />} />
			<Route path="help/:articleId" element={<HelpArticle />} />

            {/* Shopify Routes */}
            <Route path="shopify" element={<ShopifyIntegration />} />
            <Route path="shopify/connect" element={<ConnectStore />} />
			<Route path="shopify/stores/:storeId" element={<StoreSettings />} />
            <Route path="shopify/products" element={<ShopifyProducts />} />
			<Route path="/shopify/products/:id" element={<ProductDetail />} />
			
			<Route path="users" element={<UserManagement />} />
			
          </Route>
        </Routes>
        
        <Toaster position="top-right" />
      </Router>
    </AuthProvider>
  );
}

export default App;