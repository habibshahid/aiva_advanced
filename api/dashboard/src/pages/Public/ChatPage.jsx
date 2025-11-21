/**
 * Standalone Chat Page
 * OpenAI-style full-page chat interface with rich content support
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader, ExternalLink, ShoppingBag, Image as ImageIcon } from 'lucide-react';
import axios from 'axios';

/**
 * Collapsible Source Component
 */
const CollapsibleSource = ({ source, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="bg-gray-50 rounded-lg overflow-hidden text-xs">
      <div className="p-3">
        {/* Title - More prominent */}
        <div className="font-semibold text-gray-900 mb-2 flex items-start gap-2">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-[10px] font-bold">
            {index + 1}
          </span>
          <span className="flex-1">{source.source?.metadata?.title || source.metadata?.title || 'Document'}</span>
        </div>
        {console.log(source)}
        {/* Content Preview */}
        <div 
          className="text-gray-600 mb-2"
          style={{
            display: isExpanded ? 'block' : '-webkit-box',
            WebkitLineClamp: isExpanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {source.content}
        </div>

        {/* Metadata Info */}
        {(source.page || source.relevance_score) && (
          <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
            {source.page && (
              <span>📄 Page {source.source?.metadata?.page || source.metadata?.page || ''}</span>
            )}
            {source.source?.metadata?.relevance_score || source.relevance_score && (
              <span>🎯 {((source.source?.relevance_score || source.relevance_score || source.score) * 100).toFixed(0)}% match</span>
            )}
          </div>
        )}

        {/* Expand/Collapse Button */}
        {source.content && source.content.length > 150 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1"
          >
            {isExpanded ? (
              <>
                Show less
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </>
            ) : (
              <>
                Show more
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </>
            )}
          </button>
        )}

        {/* Source Link - Fixed path */}
        {(source.url || source.source?.metadata?.source_url || source?.metadata?.source_url) && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <a 
              href={source.url || source.source?.metadata?.source_url || source.metadata?.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              View source
            </a>
          </div>
        )}
      </div>
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
			formatted_html: msg.formatted_html,
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

        // Build rich message
        const assistantMessage = {
          id: data.message_id,
          role: 'assistant',
          content: data.response.text || data.response,
          html: data.response.html,
		  formatted_html: data.formatted_html,
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
        // Optional: Show a subtle toast notification
        // You could add a state for this if you want visual confirmation
      }
    } catch (error) {
      console.error('Submit message feedback error:', error);
    }
  };
  
  // Render message content with rich elements
  const renderMessageContent = (message) => {
    return (
      <>
        {/* Main text content */}
        <div 
          className="text-sm whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ 
            __html: message.formatted_html || message.html || message.content 
          }}
        />

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
		
        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
		  <div className="mt-4 pt-4 border-t border-gray-200">
			<div className="text-xs font-semibold text-gray-600 mb-2">
			  📚 Sources ({message.sources.length})
			</div>
			<div className="space-y-2">
			  {message.sources.map((source, idx) => (
				<CollapsibleSource key={idx} source={source} index={idx} />
			  ))}
			</div>
		  </div>
		)}

        {/* Products */}
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

        {/* Images */}
        {message.images && message.images.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-xs font-semibold text-gray-600 mb-3 flex items-center gap-1">
              <ImageIcon className="w-4 h-4" />
              Related Images ({message.images.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {message.images.map((img, idx) => (
                <div
                  key={img.image_id || idx}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                  onClick={() => window.open(img.url, '_blank')}
                >
                  <div className="aspect-square bg-gray-100 overflow-hidden">
                    <img
                      src={img.thumbnail_url || img.url}
                      alt={img.title || 'Image'}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22200%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-size=%2220%22%3EImage%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  </div>
                  <div className="p-2 bg-white">
                    <p className="text-xs font-medium text-gray-900 truncate" title={img.title || 'Image'}>
                      {img.title || 'Image'}
                    </p>
                    {img.page_number && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Page {img.page_number}
                      </p>
                    )}
                    {img.similarity_score && (
                      <p className="text-xs text-green-600 font-medium mt-0.5">
                        {Math.round(img.similarity_score * 100)}% match
                      </p>
                    )}
                  </div>
                </div>
              ))}
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