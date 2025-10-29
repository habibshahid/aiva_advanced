import api from './api';

// Chat Sessions
export const createChatSession = (data) => 
  api.post('/chat/sessions', data);

export const getChatSessions = (params) => 
  api.get('/chat/sessions', { params });

export const getChatSession = (sessionId) => 
  api.get(`/chat/sessions/${sessionId}`);

export const endChatSession = (sessionId) => 
  api.post(`/chat/sessions/${sessionId}/end`);

export const deleteChatSession = (sessionId) => 
  api.delete(`/chat/sessions/${sessionId}`);

// Chat Messages
export const sendChatMessage = (data) => 
  api.post('/chat/message', data);

export const getChatHistory = (sessionId, params) => 
  api.get(`/chat/sessions/${sessionId}/history`, { params });

export const getChatMessage = (messageId) => 
  api.get(`/chat/messages/${messageId}`);

export const getChatSessionStats = (sessionId) => 
  api.get(`/chat/sessions/${sessionId}/stats`);