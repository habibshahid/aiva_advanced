/**
 * Standalone Chat Page
 * OpenAI-style full-page chat interface with rich content support
 * 
 * FIXED: Shows response.html (synthesized answer) instead of formatted_html (raw chunks)
 * FIXED: Sources and images are in collapsible section
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader, ShoppingBag, ChevronDown, ChevronRight, FileText, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';

/**
 * Collapsible Sources Component
 * Shows sources and images in an expandable panel
 */
const CollapsibleSources = ({ sources = [], images = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Don't render if no sources or images
  if ((!sources || sources.length === 0) && (!images || images.length === 0)) {
    return null;
  }
  
  const sourceCount = sources?.length || 0;
  const imageCount = images?.length || 0;
  
  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 transition-colors w-full"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
        <span className="flex items-center gap-2">
          {sourceCount > 0 && (
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {sourceCount} source{sourceCount > 1 ? 's' : ''}
            </span>
          )}
          {sourceCount > 0 && imageCount > 0 && <span>·</span>}
          {imageCount > 0 && (
            <span className="flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              {imageCount} image{imageCount > 1 ? 's' : ''}
            </span>
          )}
        </span>
      </button>
      
      {/* Collapsible Content */}
      {isExpanded && (
        <div className="mt-2 space-y-3 max-h-80 overflow-y-auto">
          {/* Text Sources */}
          {sources && sources.length > 0 && (
            <div className="space-y-2">
              {sources.map((source, idx) => {
                const docName = source.source?.document_name || source.document || 'Unknown';
                const page = source.source?.page || source.source?.metadata?.page_number || source.page || '';
                const relevance = Math.round((source.score || source.relevance || 0) * 100);
                const content = source.content || '';
                const preview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
                
                return (
                  <div 
                    key={source.result_id || idx}
                    className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[200px]">
                        {docName}
                      </span>
                      {page && (
                        <span className="text-xs text-gray-500">
                          Page {page}
                        </span>
                      )}
                      <span className="text-xs text-green-600 font-medium ml-auto">
                        {relevance}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {preview}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Images */}
          {images && images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {images.slice(0, 9).map((img, idx) => (
                <a
                  key={img.image_id || idx}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
                >
                  <img
                    src={img.thumbnail_url || img.url}
                    alt={img.title || `Image ${idx + 1}`}
                    className="w-full h-16 object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2264%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%2264%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-size=%2212%22%3EImage%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </a>
              ))}
              {images.length > 9 && (
                <div className="flex items-center justify-center bg-gray-100 rounded-lg text-xs text-gray-500">
                  +{images.length - 9} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ChatPage = () => {
  const { agentId } = useParams();
  const [sessionId, setSessionId] = useState(null);
  const [agent, setAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const messagesEndRef = useRef(null);

  const API_URL = window.location.origin + '/aiva/api/public/chat';

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
        // Map messages to include all rich content
        const loadedMessages = response.data.data.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          html: msg.content_html,
          response: msg.response,  // Store full response object
          sources: msg.sources || [],
          images: msg.images || [],
          products: msg.products || [],
          agent_transfer: msg.agent_transfer_requested,
          created_at: msg.created_at
        }));
        setMessages(loadedMessages);
      }
    } catch (error) {
      console.error('Load history error:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || sending) return;

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
        agent_id: agentId,
        message: userMessage
      });

      if (response.data.success) {
        const data = response.data.data;
        
        // Update sessionId if new session was created
        if (data.new_session_created) {
          const newSessionId = data.session_id;
          setSessionId(newSessionId);
          localStorage.setItem(`aiva_chat_${agentId}`, newSessionId);
        }

        // ✅ FIX: Build message with response object for proper display priority
        const assistantMessage = {
          id: data.message_id?.messageId || data.message_id,
          role: 'assistant',
          // Store the full response object
          response: data.response,
          // Also store individual fields for backward compatibility
          content: data.response?.text || data.response || '',
          html: data.response?.html || '',
          // Sources and images for collapsible section
          sources: data.sources || [],
          images: data.images || [],
          products: data.products || [],
          agent_transfer: data.agent_transfer,
          created_at: data.created_at
        };
        
        setMessages(prev => [...prev, assistantMessage]);

        // Handle agent transfer
        if (data.agent_transfer) {
          setTimeout(() => {
            setMessages(prev => [...prev, {
              id: 'transfer-' + Date.now(),
              role: 'system',
              content: '🤝 Connecting you to a human agent...',
              created_at: new Date().toISOString()
            }]);
          }, 1000);
        }
        
        // Handle conversation end - show feedback prompt
        if (data.show_feedback_prompt && !feedbackSubmitted) {
          setShowFeedbackPrompt(true);
        }
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
  
  const submitFeedback = async (rating, comment = '') => {
    try {
      const response = await axios.post(`${API_URL.replace('/message', '')}/feedback/session`, {
        session_id: sessionId,
        rating: rating,
        comment: comment
      });

      if (response.data.success) {
        setFeedbackSubmitted(true);
        setShowFeedbackPrompt(false);
        
        // Show thank you message
        setMessages(prev => [...prev, {
          id: 'feedback-thanks-' + Date.now(),
          role: 'system',
          content: '✅ Thank you for your feedback!',
          created_at: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('Submit feedback error:', error);
    }
  };
  
  const submitMessageFeedback = async (messageId, rating) => {
    try {
      const response = await axios.post(`${API_URL.replace('/message', '')}/feedback/message`, {
        message_id: messageId,
        rating: rating
      });

      if (response.data.success) {
        console.log('✅ Message feedback submitted');
      }
    } catch (error) {
      console.error('Submit message feedback error:', error);
    }
  };
  
  /**
   * ✅ FIXED: Render message content
   * - Shows response.html (synthesized answer) FIRST
   * - Sources and images are in CollapsibleSources component
   */
  const renderMessageContent = (message) => {
    // ✅ FIX: Priority order for main content:
    // 1. response.html (synthesized LLM answer)
    // 2. response.text (synthesized LLM answer, plain text)
    // 3. html (fallback)
    // 4. content (raw text fallback)
    // ❌ NOT formatted_html (that's raw chunks, not the answer!)
    const mainContent = message.response?.html 
      || message.response?.text 
      || message.html 
      || message.content 
      || '';
    
    return (
      <>
        {/* Main Answer - Synthesized LLM Response */}
        <div 
          className="text-sm whitespace-pre-wrap prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: mainContent }}
        />

        {/* ✅ Collapsible Sources & Images */}
        <CollapsibleSources 
          sources={message.sources} 
          images={message.images} 
        />

        {/* Products - Show inline (not collapsible) */}
        {message.products && message.products.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1">
              <ShoppingBag className="w-4 h-4" />
              Products ({message.products.length})
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {message.products.map((product, idx) => (
                <div key={idx} className="bg-gray-50 rounded-lg p-3 text-center hover:shadow-md transition-shadow">
                  {product.image && (
                    <img 
                      src={product.image}
                      alt={product.name}
                      className="w-full h-32 object-cover rounded-md mb-2"
                    />
                  )}
                  <div className="text-sm font-medium text-gray-900 mb-1 line-clamp-2">
                    {product.name}
                  </div>
                  <div className="text-sm font-semibold text-primary-600 mb-2">
                    {product.price}
                  </div>
                  {product.purchase_url && (
                    <a 
                      href={product.purchase_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block bg-primary-600 text-white text-xs px-3 py-1 rounded-md hover:bg-primary-700 transition-colors"
                    >
                      View Product
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Message Feedback */}
        {message.role === 'assistant' && message.id && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>Was this helpful?</span>
              <button
                onClick={() => submitMessageFeedback(message.id, 'useful')}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Helpful"
              >
                👍
              </button>
              <button
                onClick={() => submitMessageFeedback(message.id, 'not_useful')}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Not helpful"
              >
                👎
              </button>
            </div>
          </div>
        )}
      </>
    );
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
          <p className="text-sm text-gray-500">Powered by Intellicon AiVA</p>
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
                className={`flex ${
                  message.role === 'user' 
                    ? 'justify-end' 
                    : message.role === 'system'
                    ? 'justify-center'
                    : 'justify-start'
                }`}
              >
                <div
                  className={`rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'max-w-3xl bg-primary-600 text-white'
                      : message.role === 'system'
                      ? 'bg-yellow-50 text-yellow-800 border border-yellow-200 px-6'
                      : 'max-w-3xl bg-white text-gray-900 shadow-sm border border-gray-200'
                  }`}
                >
                  {message.role === 'system' ? (
                    <p className="text-sm text-center">{message.content}</p>
                  ) : (
                    renderMessageContent(message)
                  )}
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
      
      {/* Feedback Prompt */}
      {showFeedbackPrompt && !feedbackSubmitted && (
        <div className="bg-blue-50 border-t border-blue-200 px-4 py-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-3">
              <p className="text-sm font-medium text-gray-900 mb-1">
                How was your experience?
              </p>
              <p className="text-xs text-gray-600">
                Your feedback helps us improve
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => submitFeedback('good')}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                <span className="text-lg">👍</span>
                <span className="text-sm font-medium">Good</span>
              </button>
              <button
                onClick={() => submitFeedback('bad')}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                <span className="text-lg">👎</span>
                <span className="text-sm font-medium">Bad</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
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