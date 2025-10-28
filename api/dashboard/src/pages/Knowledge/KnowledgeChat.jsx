import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Send, Loader, Bot, User, Trash2, 
  RotateCcw, Copy, Check 
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getKnowledgeBase, searchKnowledge } from '../../services/knowledgeApi';

const KnowledgeChat = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  
  const [kb, setKb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId] = useState(`test-${Date.now()}`);
  const [copiedIndex, setCopiedIndex] = useState(null);

  useEffect(() => {
    loadKB();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadKB = async () => {
    try {
      setLoading(true);
      const response = await getKnowledgeBase(id);
      setKb(response.data.data);
      
      // Add welcome message
      setMessages([{
        role: 'assistant',
        content: `Hi! I'm ready to answer questions about **${response.data.data.name}**. Ask me anything!`,
        timestamp: new Date().toISOString()
      }]);
    } catch (error) {
      toast.error('Failed to load knowledge base');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || sending) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      // Search knowledge base
      const searchResponse = await searchKnowledge({
        kb_id: id,
        query: input.trim(),
        top_k: 3,
        search_type: 'text'
      });

      const results = searchResponse.data.data.text_results || [];
      
      let assistantContent = '';
      
      if (results.length === 0) {
        assistantContent = "I couldn't find any relevant information in the knowledge base for that question. Could you try rephrasing or asking something else?";
      } else {
        // Build context from search results
        const context = results.map((r, i) => 
          `[${i + 1}] ${r.content}`
        ).join('\n\n');
        
        // Simple response generation (you can enhance this with GPT later)
        assistantContent = `Based on the knowledge base:\n\n${results[0].content}\n\n`;
        
        if (results.length > 1) {
          assistantContent += `\n**Additional relevant information:**\n`;
          results.slice(1, 3).forEach((r, i) => {
            assistantContent += `\n${i + 2}. ${r.content.substring(0, 200)}...`;
          });
        }
        
        // Add sources
        assistantContent += `\n\n**Sources:**\n`;
        results.forEach((r, i) => {
          assistantContent += `- ${r.source.document_name} (relevance: ${(r.score * 100).toFixed(0)}%)\n`;
        });
      }

      const assistantMessage = {
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date().toISOString(),
        sources: results.map(r => ({
          document: r.source.document_name,
          score: r.score,
          chunk_index: r.source.chunk_index
        }))
      };

      setMessages(prev => [...prev, assistantMessage]);
      
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error while searching the knowledge base. Please try again.',
        timestamp: new Date().toISOString(),
        error: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      toast.error('Failed to get response');
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `Chat cleared! Ask me anything about **${kb?.name}**.`,
      timestamp: new Date().toISOString()
    }]);
  };

  const copyMessage = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copied to clipboard');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/knowledge/${id}/documents`)}
              className="text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Test Chat</h1>
              <p className="text-sm text-gray-500">{kb?.name}</p>
            </div>
          </div>
          
          <button
            onClick={clearChat}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Clear Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex max-w-3xl ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} gap-3`}>
                {/* Avatar */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user' 
                    ? 'bg-primary-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>

                {/* Message Content */}
                <div className={`flex-1 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block px-4 py-3 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : message.error
                      ? 'bg-red-50 text-red-900 border border-red-200'
                      : 'bg-white text-gray-900 border border-gray-200'
                  }`}>
                    <div className="prose prose-sm max-w-none">
                      {message.content.split('\n').map((line, i) => {
                        // Handle markdown bold
                        const parts = line.split(/(\*\*.*?\*\*)/g);
                        return (
                          <p key={i} className="mb-2 last:mb-0">
                            {parts.map((part, j) => {
                              if (part.startsWith('**') && part.endsWith('**')) {
                                return <strong key={j}>{part.slice(2, -2)}</strong>;
                              }
                              return <span key={j}>{part}</span>;
                            })}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                  
                  {/* Metadata */}
                  <div className={`flex items-center gap-2 mt-1 text-xs text-gray-500 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}>
                    <span>
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                    {message.role === 'assistant' && (
                      <button
                        onClick={() => copyMessage(message.content, index)}
                        className="hover:text-gray-700"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-2 text-xs">
                      <details className="cursor-pointer">
                        <summary className="text-gray-500 hover:text-gray-700">
                          View sources ({message.sources.length})
                        </summary>
                        <div className="mt-2 space-y-1 text-gray-600">
                          {message.sources.map((source, i) => (
                            <div key={i} className="flex items-center justify-between">
                              <span>{source.document}</span>
                              <span className="text-gray-400">
                                {(source.score * 100).toFixed(0)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {sending && (
            <div className="flex justify-start">
              <div className="flex gap-3 max-w-3xl">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-gray-600" />
                </div>
                <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the knowledge base..."
              disabled={sending}
              className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex items-center px-6 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KnowledgeChat;