import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Send, Bot, User, Loader, RotateCcw, Copy, Check,
  BookOpen, DollarSign, Clock, Zap, AlertCircle, 
  ChevronDown, ChevronUp, FileText, Image as ImageIcon,
  X, MessageSquare
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getAgents, getAgent } from '../services/api';
import { sendChatMessage, getChatHistory, endChatSession } from '../services/chatApi';

const AgentTestChat = () => {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .knowledge-formatted-content img {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        margin: 8px 0;
      }
      .knowledge-formatted-content .inline-page-images {
        margin-top: 15px;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  
  // Agent selection
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [agentDetails, setAgentDetails] = useState(null);
  const [loadingAgent, setLoadingAgent] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  // UI state
  const [showAgentInfo, setShowAgentInfo] = useState(true);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [totalCost, setTotalCost] = useState(0);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadAgents = async () => {
    try {
      const response = await getAgents({ status: 'active' });
      setAgents(response.data.agents || []);
    } catch (error) {
      toast.error('Failed to load agents');
      console.error(error);
    }
  };

  const handleAgentSelect = async (agentId) => {
    if (!agentId) {
      setSelectedAgent(null);
      setAgentDetails(null);
      setMessages([]);
      setSessionId(null);
      setTotalCost(0);
      return;
    }

    try {
      setLoadingAgent(true);
      const response = await getAgent(agentId);
      const agent = response.data.agent;
      
      setSelectedAgent(agentId);
      setAgentDetails(agent);
      setMessages([{
        role: 'assistant',
        content: agent.greeting || `Hello! I'm ${agent.name}. How can I help you today?`,
        timestamp: new Date().toISOString()
      }]);
      setSessionId(null);
      setTotalCost(0);
      
      toast.success(`Agent loaded: ${agent.name}`);
    } catch (error) {
      toast.error('Failed to load agent details');
      console.error(error);
    } finally {
      setLoadingAgent(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    
    if (!input.trim() || sending || !selectedAgent) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await sendChatMessage({
        session_id: sessionId,
        agent_id: selectedAgent,
        message: input.trim()
      });

      const result = response.data.data;
      
      // Update session ID if new session created
      if (result.session_id && (!sessionId || result.new_session_created)) {
		setSessionId(result.session_id);
	  }

      // Add assistant message
      const assistantMessage = {
        role: 'assistant',
        content: result.response.text,
        html: result.response.html,
        markdown: result.response.markdown,
		formatted_html: result.formatted_html,  
        timestamp: new Date().toISOString(),
        sources: result.sources || [],
        images: result.images || [],
        function_calls: result.function_calls || [],
        cost: result.cost,
        cost_breakdown: result.cost_breakdown,
        context_used: result.context_used,
        agent_metadata: result.agent_metadata
      };

      setMessages(prev => [...prev, assistantMessage]);
      
      // Update total cost
      setTotalCost(prev => prev + (result.cost || 0));

    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        error: true
      };
      
      setMessages(prev => [...prev, errorMessage]);
      toast.error(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleClearChat = async () => {
    if (sessionId) {
      try {
        await endChatSession(sessionId);
      } catch (error) {
        console.error('Failed to end session:', error);
      }
    }
    
    setMessages([{
      role: 'assistant',
      content: agentDetails?.greeting || `Hello! I'm ${agentDetails?.name}. How can I help you today?`,
      timestamp: new Date().toISOString()
    }]);
    setSessionId(null);
    setTotalCost(0);
    toast.success('Chat cleared');
  };

  const copyMessage = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success('Copied to clipboard');
  };

  const formatCost = (cost) => {
    return `$${(cost || 0).toFixed(6)}`;
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-6 h-6 text-primary-600" />
              <h1 className="text-xl font-bold text-gray-900">Agent Test Chat</h1>
            </div>
            
            {/* Agent Selector */}
            <div className="ml-6">
              <select
                value={selectedAgent || ''}
                onChange={(e) => handleAgentSelect(e.target.value)}
                disabled={loadingAgent}
                className="block w-64 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select an agent...</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} {agent.kb_id ? '📚' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="text-right">
              <div className="text-xs text-gray-500">Total Cost</div>
              <div className="text-lg font-bold text-gray-900">{formatCost(totalCost)}</div>
            </div>
            
            {messages.length > 1 && (
              <button
                onClick={handleClearChat}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Agent Info Panel (Collapsible) */}
          {agentDetails && (
            <div className="bg-blue-50 border-b border-blue-200">
              <button
                onClick={() => setShowAgentInfo(!showAgentInfo)}
                className="w-full px-6 py-3 flex items-center justify-between hover:bg-blue-100 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Bot className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Agent: {agentDetails.name}</span>
                  {agentDetails.kb_id && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-200 text-blue-800">
                      <BookOpen className="w-3 h-3 mr-1" />
                      KB Enabled
                    </span>
                  )}
                </div>
                {showAgentInfo ? (
                  <ChevronUp className="w-5 h-5 text-blue-600" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-blue-600" />
                )}
              </button>
              
              {showAgentInfo && (
                <div className="px-6 pb-4 space-y-3">
                  <div>
                    <div className="text-xs font-medium text-blue-900 mb-1">Instructions (Persona)</div>
                    <div className="text-sm text-blue-800 bg-white rounded p-3 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                      {agentDetails.instructions}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-500">Model</div>
                      <div className="text-sm font-medium text-gray-900">{agentDetails.model || 'gpt-4o-mini'}</div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-500">Temperature</div>
                      <div className="text-sm font-medium text-gray-900">{agentDetails.temperature || 0.7}</div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-500">Max Tokens</div>
                      <div className="text-sm font-medium text-gray-900">{agentDetails.max_tokens || 4096}</div>
                    </div>
                    <div className="bg-white rounded p-2">
                      <div className="text-xs text-gray-500">Provider</div>
                      <div className="text-sm font-medium text-gray-900">{agentDetails.provider || 'openai'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {!selectedAgent ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Bot className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Agent</h3>
                  <p className="text-sm text-gray-500">Choose an agent from the dropdown to start testing</p>
                </div>
              </div>
            ) : (
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
                      <div className={`flex-1 ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`rounded-lg px-4 py-3 ${
                          message.role === 'user'
                            ? 'bg-primary-600 text-white'
                            : message.error
                            ? 'bg-red-50 border border-red-200'
                            : 'bg-white border border-gray-200'
                        }`}>
                          <div className="prose prose-sm max-w-none">
							  {message.formatted_html ? (
								<div 
								  className="knowledge-formatted-content"
								  dangerouslySetInnerHTML={{ __html: message.formatted_html }}
								/>
							  ) : (
								<p className={`whitespace-pre-wrap ${message.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
								  {message.content}
								</p>
							  )}
							</div>

                          {/* Sources */}
                          {message.sources && message.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center text-xs font-medium text-gray-700 mb-2">
                                <BookOpen className="w-3 h-3 mr-1" />
                                Knowledge Sources ({message.sources.length})
                              </div>
                              <div className="space-y-1">
                                {message.sources.slice(0, 3).map((source, idx) => (
                                  <div key={idx} className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium truncate">{source.title}</span>
                                      <span className="text-gray-500 ml-2">
                                        {(source.relevance_score * 100).toFixed(0)}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Images */}
                          {message.images && message.images.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center text-xs font-medium text-gray-700 mb-2">
                                <ImageIcon className="w-3 h-3 mr-1" />
                                Images ({message.images.length})
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {message.images.slice(0, 4).map((img, idx) => (
                                  <div
                                    key={img.image_id || idx}
                                    className="border border-gray-200 rounded overflow-hidden hover:border-primary-300 transition-colors cursor-pointer group"
                                    onClick={() => window.open(img.url, '_blank')}
                                  >
                                    <div className="aspect-square bg-gray-50 overflow-hidden">
                                      <img
                                        src={img.thumbnail_url || img.url}
                                        alt={img.title || 'Image'}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        loading="lazy"
                                        onError={(e) => {
                                          e.target.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-size=%2214%22%3EImage%3C/text%3E%3C/svg%3E';
                                        }}
                                      />
                                    </div>
                                    <div className="p-1.5 bg-gray-50">
                                      <p className="text-xs text-gray-700 truncate" title={img.title || 'Image'}>
                                        {img.title || 'Image'}
                                      </p>
                                      {img.page_number && (
                                        <p className="text-xs text-gray-500">Page {img.page_number}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {message.images.length > 4 && (
                                <p className="text-xs text-gray-500 mt-1">
                                  +{message.images.length - 4} more image{message.images.length - 4 !== 1 ? 's' : ''}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Function Calls */}
                          {message.function_calls && message.function_calls.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center text-xs font-medium text-gray-700 mb-2">
                                <Zap className="w-3 h-3 mr-1" />
                                Function Calls ({message.function_calls.length})
                              </div>
                              {message.function_calls.map((func, idx) => (
                                <div key={idx} className="text-xs text-gray-600 bg-gray-50 rounded p-2 mb-1">
                                  <span className="font-medium">{func.function_name}</span>
                                  <span className="text-green-600 ml-2">✓ {func.status}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Cost Info */}
						  {message.cost !== undefined && (
							<div className="mt-2 pt-2 border-t border-gray-200">
							  <div className="flex items-center justify-between text-xs">
								<span className="text-gray-500">
								  {message.context_used && (
									<>
									  {message.context_used.knowledge_base_chunks > 0 && (
										<span className="mr-2">📚 {message.context_used.knowledge_base_chunks} chunks</span>
									  )}
									  <span className="mr-2">💬 {message.context_used.conversation_history_messages} history</span>
									  <span>🔤 {message.context_used.total_context_tokens} tokens</span>
									</>
								  )}
								</span>
								<span className="font-medium text-gray-700">
								  <DollarSign className="w-3 h-3 inline mr-0.5" />
								  {formatCost(message.cost)}
								</span>
							  </div>
							  
							  {/* Cost Breakdown Details */}
							  {message.cost_breakdown && message.cost_breakdown.operations && (
								<div className="mt-1 space-y-1">
								  {message.cost_breakdown.operations.map((op, idx) => (
									<div key={idx} className="text-xs text-gray-600 flex items-center justify-between">
									  <span className="capitalize">
										{op.operation.replace(/_/g, ' ')}
										{op.details && op.details.model && (
										  <span className="text-gray-400 ml-1">({op.details.model})</span>
										)}
									  </span>
									  <span className="text-gray-500">
										{formatCost(op.total_cost)}
									  </span>
									</div>
								  ))}
								  {message.cost_breakdown.operations.length > 1 && (
									<div className="text-xs font-medium text-gray-700 flex items-center justify-between pt-1 border-t border-gray-100">
									  <span>Total</span>
									  <span>{formatCost(message.cost_breakdown.final_cost)}</span>
									</div>
								  )}
								</div>
							  )}
							</div>
						  )}
                        </div>

                        <div className="flex items-center mt-1 space-x-2">
                          <span className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                          <button
                            onClick={() => copyMessage(message.content, index)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Copy message"
                          >
                            {copiedIndex === index ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
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
                        <div className="flex items-center space-x-2">
                          <Loader className="w-4 h-4 animate-spin text-gray-400" />
                          <span className="text-sm text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Area */}
          {selectedAgent && (
            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <form onSubmit={handleSend} className="max-w-4xl mx-auto">
                <div className="flex space-x-3">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={sending || !selectedAgent}
                    placeholder={sending ? "Waiting for response..." : "Type your message..."}
                    className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim() || !selectedAgent}
                    className="inline-flex items-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? (
                      <>
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                        Sending
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentTestChat;