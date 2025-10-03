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
import Layout from './components/Layout';

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
            <Route path="agents" element={<Agents />} />
            <Route path="agents/new" element={<AgentEditor />} />
            <Route path="agents/:id" element={<AgentEditor />} />
            <Route path="credits" element={<Credits />} />
            <Route path="calls" element={<Calls />} />
          </Route>
        </Routes>
        
        <Toaster position="top-right" />
      </Router>
    </AuthProvider>
  );
}

export default App;