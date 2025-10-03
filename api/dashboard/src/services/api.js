import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    
    //console.log('=== API REQUEST DEBUG ===');
    //console.log('URL:', config.url);
    //console.log('Token from localStorage:', token);
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      //console.log('Authorization header set:', config.headers.Authorization);
    } else {
      console.log('NO TOKEN FOUND');
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.log('=== API ERROR DEBUG ===');
    console.log('Status:', error.response?.status);
    console.log('Error data:', error.response?.data);
    
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Let React Router handle redirect
    }
    return Promise.reject(error);
  }
);

// Auth
export const login = (email, password) => 
  api.post('/auth/login', { email, password });

export const getCurrentUser = () => 
  api.get('/auth/me');

export const generateApiKey = () => 
  api.post('/auth/api-key/generate');

// Agents
export const getAgents = (params) => 
  api.get('/agents', { params });

export const getAgent = (id) => 
  api.get(`/agents/${id}`);

export const createAgent = (data) => 
  api.post('/agents', data);

export const updateAgent = (id, data) => 
  api.put(`/agents/${id}`, data);

export const deleteAgent = (id) => 
  api.delete(`/agents/${id}`);

// Functions
export const getFunctions = (agentId) => 
  api.get(`/functions/agent/${agentId}`);

export const createFunction = (agentId, data) => 
  api.post(`/functions/agent/${agentId}`, data);

export const updateFunction = (id, data) => 
  api.put(`/functions/${id}`, data);

export const deleteFunction = (id) => 
  api.delete(`/functions/${id}`);

// Credits
export const getBalance = () => 
  api.get('/credits/balance');

export const addCredits = (tenantId, amount, note) => 
  api.post('/credits/add', { tenant_id: tenantId, amount, note });

export const getTransactions = (params) => 
  api.get('/credits/transactions', { params });

export const getUsageStats = (days) => 
  api.get('/credits/usage', { params: { days } });

// Calls
export const getCalls = (params) => 
  api.get('/calls', { params });

export const getCall = (sessionId) => 
  api.get(`/calls/${sessionId}`);

export const getCallStats = (days) => 
  api.get('/calls/stats/summary', { params: { days } });

export default api;