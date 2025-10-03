import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, User, Clock, DollarSign, Activity } from 'lucide-react';

const Monitor = () => {
  const [connected, setConnected] = useState(false);
  const [activeCalls, setActiveCalls] = useState(new Map());
  const [selectedCall, setSelectedCall] = useState(null);
  const [transcripts, setTranscripts] = useState(new Map());
  const wsRef = useRef(null);

  useEffect(() => {
    // Connect to monitor WebSocket
    const ws = new WebSocket('/aiva/ws');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to monitor server');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from monitor server');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  const handleMessage = (message) => {
    switch (message.type) {
      case 'connection_added':
      case 'connection_info':
        setActiveCalls(prev => {
          const updated = new Map(prev);
          updated.set(message.data.clientKey, message.data);
          return updated;
        });
        // Initialize transcript array for new call
        setTranscripts(prev => {
          const updated = new Map(prev);
          if (!updated.has(message.data.clientKey)) {
            updated.set(message.data.clientKey, []);
          }
          return updated;
        });
        break;

      case 'connection_updated':
        setActiveCalls(prev => {
          const updated = new Map(prev);
          if (updated.has(message.data.clientKey)) {
            updated.set(message.data.clientKey, {
              ...updated.get(message.data.clientKey),
              ...message.data
            });
          }
          return updated;
        });
        break;

      case 'connection_removed':
        setActiveCalls(prev => {
          const updated = new Map(prev);
          updated.delete(message.data.clientKey);
          return updated;
        });
        // Keep transcripts for history
        break;

      case 'transcript':
        setTranscripts(prev => {
          const updated = new Map(prev);
          const callTranscripts = updated.get(message.data.clientKey) || [];
          updated.set(message.data.clientKey, [
            ...callTranscripts,
            {
              speaker: message.data.speaker,
              text: message.data.text,
              timestamp: message.data.timestamp
            }
          ]);
          return updated;
        });
        break;

      case 'cost_update':
        setActiveCalls(prev => {
          const updated = new Map(prev);
          if (updated.has(message.data.clientKey)) {
            const call = updated.get(message.data.clientKey);
            call.cost = message.data.cost;
            updated.set(message.data.clientKey, call);
          }
          return updated;
        });
        break;

      case 'function_call':
      case 'function_response':
        // Add to transcript as system message
        setTranscripts(prev => {
          const updated = new Map(prev);
          const callTranscripts = updated.get(message.data.clientKey) || [];
          updated.set(message.data.clientKey, [
            ...callTranscripts,
            {
              speaker: 'system',
              text: message.type === 'function_call' 
                ? `🔧 Function call: ${message.data.functionName}`
                : `✅ Function response: ${message.data.functionName}`,
              timestamp: message.data.timestamp,
              details: message.data
            }
          ]);
          return updated;
        });
        break;

      default:
        break;
    }
  };

  const activeCallsArray = Array.from(activeCalls.values());
  const callTranscripts = selectedCall ? (transcripts.get(selectedCall.clientKey) || []) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Live Call Monitor</h1>
          <p className="mt-1 text-sm text-gray-500">Real-time monitoring of active calls</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`flex items-center px-3 py-1 rounded-full text-sm ${
            connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              connected ? 'bg-green-600 animate-pulse' : 'bg-red-600'
            }`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
            {activeCallsArray.length} Active
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Calls List */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Active Calls</h2>
            </div>
            <div className="divide-y divide-gray-200 max-h-[calc(100vh-250px)] overflow-y-auto">
              {activeCallsArray.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  <PhoneOff className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  No active calls
                </div>
              ) : (
                activeCallsArray.map((call) => (
                  <button
                    key={call.clientKey}
                    onClick={() => setSelectedCall(call)}
                    className={`w-full px-4 py-4 text-left hover:bg-gray-50 transition-colors ${
                      selectedCall?.clientKey === call.clientKey ? 'bg-blue-50 border-l-4 border-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${
                          call.userSpeaking ? 'bg-green-500 animate-pulse' :
                          call.agentSpeaking ? 'bg-blue-500 animate-pulse' :
                          'bg-gray-300'
                        }`} />
                        <span className="text-sm font-medium text-gray-900">
                          {call.callerId || 'Unknown'}
                        </span>
                      </div>
                      <Phone className="w-4 h-4 text-green-600" />
                    </div>
                    
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        {call.agentName || 'Unknown Agent'}
                      </div>
                      <div className="flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {call.connectedAt ? new Date(call.connectedAt).toLocaleTimeString() : 'N/A'}
                      </div>
                      {call.cost && (
                        <div className="flex items-center font-semibold text-blue-600">
                          <DollarSign className="w-3 h-3 mr-1" />
                          {call.cost.formatted?.finalCost || '$0.00'}
                        </div>
                      )}
                    </div>

                    {(call.userSpeaking || call.agentSpeaking) && (
                      <div className="mt-2 flex items-center space-x-1">
                        <Activity className="w-3 h-3 text-blue-600" />
                        <span className="text-xs text-blue-600 font-medium">
                          {call.userSpeaking ? 'User Speaking' : 'Agent Speaking'}
                        </span>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Transcript Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden h-[calc(100vh-200px)] flex flex-col">
            {selectedCall ? (
              <>
                {/* Call Header */}
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {selectedCall.callerId || 'Unknown Caller'}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {selectedCall.agentName} • Session: {selectedCall.sessionId}
                      </p>
                    </div>
                    {selectedCall.cost && (
                      <div className="text-right">
                        <div className="text-2xl font-bold text-blue-600">
                          {selectedCall.cost.formatted?.finalCost || '$0.00'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {selectedCall.cost.duration?.formatted || '0s'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Transcript */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {callTranscripts.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                      <div className="text-center">
                        <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-sm">Waiting for conversation...</p>
                      </div>
                    </div>
                  ) : (
                    callTranscripts.map((item, index) => (
                      <div
                        key={index}
                        className={`flex ${
                          item.speaker === 'user' ? 'justify-start' : 
                          item.speaker === 'agent' ? 'justify-end' : 
                          'justify-center'
                        }`}
                      >
                        {item.speaker === 'system' ? (
                          <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                            {item.text}
                          </div>
                        ) : (
                          <div
                            className={`max-w-[75%] px-4 py-3 rounded-lg ${
                              item.speaker === 'user'
                                ? 'bg-gray-100 text-gray-900'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            <div className="flex items-baseline space-x-2 mb-1">
                              <span className="text-xs font-semibold uppercase opacity-75">
                                {item.speaker}
                              </span>
                              <span className="text-xs opacity-50">
                                {new Date(item.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed">{item.text}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Call Stats Footer */}
                {selectedCall.cost && (
                  <div className="px-6 py-3 border-t border-gray-200 bg-gray-50">
                    <div className="grid grid-cols-4 gap-4 text-center text-xs">
                      <div>
                        <div className="text-gray-500">Audio In</div>
                        <div className="font-semibold text-gray-900">
                          {selectedCall.cost.audio?.input?.seconds?.toFixed(1) || 0}s
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Audio Out</div>
                        <div className="font-semibold text-gray-900">
                          {selectedCall.cost.audio?.output?.seconds?.toFixed(1) || 0}s
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Tokens In</div>
                        <div className="font-semibold text-gray-900">
                          {selectedCall.cost.text?.input?.tokens || 0}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Tokens Out</div>
                        <div className="font-semibold text-gray-900">
                          {selectedCall.cost.text?.output?.tokens || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <Phone className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">Select a call to view transcript</p>
                  <p className="text-sm mt-1">Live transcripts will appear here</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Monitor;