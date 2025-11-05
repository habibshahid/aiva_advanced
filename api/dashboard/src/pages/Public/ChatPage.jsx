/**
 * Standalone Chat Page
 * OpenAI-style full-page chat interface
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader } from 'lucide-react';
import axios from 'axios';

const ChatPage = () => {
  const { agentId } = useParams();
  const [sessionId, setSessionId] = useState(null);
  const [agent, setAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const API_URL = window.location.origin + '/api/public/chat';

  useEffect(() => {
    initChat();
  }, [agentId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initChat = async () => {
    try {
      setLoading(true);

      // Check for existing session
      const savedSession = localStorage.getItem(`aiva_chat_${agentId}`);
      
      if (savedSession) {
        setSessionId(savedSession);
        await loadHistory(savedSession);
      }

      // Get agent config
      const configResponse = await axios.get(`${API_URL}/agent/${agentId}/config`);
      if (configResponse.data.success) {
        setAgent(configResponse.data.data);
      }

      // Initialize new session if needed
      if (!savedSession) {
        const initResponse = await axios.post(`${API_URL}/init`, {
          agent_id: agentId,
          visitor_info: {
            url: window.location.href,
            referrer: document.referrer
          }
        });

        if (initResponse.data.success) {
          const newSessionId = initResponse.data.data.session_id;
          setSessionId(newSessionId);
          localStorage.setItem(`aiva_chat_${agentId}`, newSessionId);
          
          // Add greeting message
          if (initResponse.data.data.agent.greeting) {
            setMessages([{
              id: 'greeting',
              role: 'assistant',
              content: initResponse.data.data.agent.greeting,
              created_at: new Date().toISOString()
            }]);
          }
        }
      }
    } catch (error) {
      console.error('Init error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (sid) => {
    try {
      const response = await axios.get(`${API_URL}/history/${sid}`);
      if (response.data.success) {
        setMessages(response.data.data.messages);
      }
    } catch (error) {
      console.error('Load history error:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || !sessionId || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    // Add user message to UI
    const newMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMessage]);

    try {
      const response = await axios.post(`${API_URL}/message`, {
        session_id: sessionId,
        message: userMessage
      });

      if (response.data.success) {
        const assistantMessage = {
          id: response.data.data.message_id,
          role: 'assistant',
          content: response.data.data.response,
          created_at: response.data.data.created_at
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error('Failed to send message');
      }
    } catch (error) {
      console.error('Send message error:', error);
      const errorMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setSending(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900">
            {agent?.name || 'AI Assistant'}
          </h1>
          <p className="text-sm text-gray-500">Powered by AIVA</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">👋</div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Hello! How can I help you today?
              </h2>
              <p className="text-gray-500">
                Ask me anything and I'll do my best to assist you.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
                <div className="flex space-x-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={sendMessage} className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                placeholder="Type your message..."
                rows="1"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                style={{ minHeight: '52px', maxHeight: '200px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="flex-shrink-0 bg-primary-600 text-white rounded-xl px-4 py-3 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-xs text-gray-500 text-center mt-2">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;