import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import AgentEditor from './pages/AgentEditor';
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
          
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="monitor" element={<Monitor />} />
            <Route path="agents" element={<Agents />} />
            <Route path="agents/test" element={<AgentTest />} />
            <Route path="agents/new" element={<AgentEditor />} />
            <Route path="agents/:id" element={<AgentEditor />} />
			<Route path="/agents/:id/conversation-strategy" element={<ConversationStrategy />} />
            <Route path="credits" element={<Credits />} />
            <Route path="calls" element={<Calls />} />
            <Route path="/test" element={<AgentTest />} />
			<Route path="agent-test" element={<AgentTestChat />} />
			
            {/* Knowledge Base Routes */}
            <Route path="knowledge" element={<KnowledgeList />} />
            <Route path="knowledge/new" element={<KnowledgeEditor />} />
            <Route path="knowledge/:id/edit" element={<KnowledgeEditor />} />
            <Route path="knowledge/:id/documents" element={<KnowledgeDocuments />} />
            <Route path="knowledge/:id/search" element={<KnowledgeSearch />} />
            <Route path="knowledge/:id/stats" element={<KnowledgeStats />} />
            <Route path="knowledge/:id/chat" element={<KnowledgeChat />} />
            
            {/* Shopify Routes */}
            <Route path="shopify" element={<ShopifyIntegration />} />
            <Route path="shopify/connect" element={<ConnectStore />} />
			<Route path="shopify/stores/:storeId" element={<StoreSettings />} />
            <Route path="shopify/products" element={<ShopifyProducts />} />
			<Route path="/shopify/products/:id" element={<ProductDetail />} />
			
          </Route>
        </Routes>
        
        <Toaster position="top-right" />
      </Router>
    </AuthProvider>
  );
}

export default App;