import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2, Settings } from 'lucide-react';
import { getAgents, getRealtimeToken, finalizeTestCall } from '../services/api';
import toast from 'react-hot-toast';
import axios from 'axios';

const AgentTest = () => {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [testSessionId, setTestSessionId] = useState(null);
  const [provider, setProvider] = useState(null);
  
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const audioContextRef = useRef(null);
  const connectTimeRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const wsRef = useRef(null);
  const micStreamRef = useRef(null);

  useEffect(() => {
    loadAgents();
    return () => {
      disconnect();
    };
  }, []);

  const loadAgents = async () => {
    try {
      const response = await getAgents();
      setAgents(response.data.agents);
    } catch (error) {
      toast.error('Failed to load agents');
    }
  };

  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(() => {
      if (connectTimeRef.current) {
        const durationMinutes = (Date.now() - connectTimeRef.current) / 60000;
        const cost = provider === 'deepgram' 
          ? durationMinutes * 0.015  // Deepgram pricing
          : durationMinutes * 0.024; // OpenAI pricing
        setEstimatedCost(cost);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isConnected, provider]);

  const connect = async () => {
    if (!selectedAgent) {
      toast.error('Please select an agent');
      return;
    }

    const agentProvider = selectedAgent.provider || 'openai';
    setProvider(agentProvider);
    setIsConnecting(true);

    try {
      if (agentProvider === 'openai') {
        await connectOpenAI();
      } else if (agentProvider === 'deepgram') {
        await connectDeepgram();
      } else {
        toast.error('Unsupported provider');
        setIsConnecting(false);
      }
    } catch (error) {
      console.error('Connection error:', error);
      toast.error('Failed to connect');
      setIsConnecting(false);
    }
  };

  const connectOpenAI = async () => {
    const tokenResponse = await getRealtimeToken(selectedAgent.id);
    const { ephemeral_key, session_id } = tokenResponse.data;

    setTestSessionId(session_id);

    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${selectedAgent.model}`,
      ['realtime', `openai-insecure-api-key.${ephemeral_key}`, 'openai-beta.realtime-v1']
    );

    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('Connected to OpenAI Realtime');
      connectTimeRef.current = Date.now();
      setIsConnected(true);
      setIsConnecting(false);
      toast.success('Connected to OpenAI agent');
      await startMicrophone();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleOpenAIMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnecting(false);
      toast.error('Connection error');
    };

    ws.onclose = (event) => {
      console.log('Disconnected from OpenAI');
      setIsConnected(false);
      setIsConnecting(false);
      stopMicrophone();
      if (event.code !== 1005) {
        toast.error(`Connection closed: ${event.reason || 'Unknown error'}`);
      }
    };
  };

  const connectDeepgram = async () => {
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';
    const token = localStorage.getItem('token');
    
    const tokenResponse = await axios.post(
      `${API_URL}/realtime/token/deepgram`,
      { agent_id: selectedAgent.id },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const { api_key, session_id, agent } = tokenResponse.data;
    setTestSessionId(session_id);
	
	const ws = new WebSocket(
      'wss://agent.deepgram.com/v1/agent/converse',
      ['token', api_key]
    );
	
    wsRef.current = ws;

    ws.onopen = async () => {
	  console.log('Connected to Deepgram Agent');
	  
	  // Wait a bit before sending config
	  setTimeout(() => {
		const config = {
		  type: 'Settings',
		  audio: {
			input: {
			  encoding: 'linear16',
			  sample_rate: 16000
			},
			output: {
			  encoding: 'linear16',
			  sample_rate: 24000,
			  container: 'none'
			}
		  },
		  agent: {
			listen: { 
			  provider: { 
				type: "deepgram", 
				model: agent.model
			  } 
			},
			speak: {
			  provider: {
				type: "deepgram",
				model: agent.voice
			  }
			},
			greeting: agent.greeting || null,
			think: {
			  provider: {
				type: 'open_ai',
				model: "gpt-4o-mini",
			  },
			  prompt: agent.instructions,
			  functions: []
			}
		  }
		};

		console.log('📤 Sending config');
		wsRef.current.send(JSON.stringify(config));
	  }, 100);
	};

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        // Audio data
        event.data.arrayBuffer().then(buffer => {
          const audioData = new Uint8Array(buffer);
          playDeepgramAudio(audioData);
        });
      } else {
        // JSON message
        const message = JSON.parse(event.data);
        handleDeepgramMessage(message);
      }
    };

    ws.onerror = (error) => {
      console.error('Deepgram error:', error);
      setIsConnecting(false);
      toast.error('Connection error');
    };

    ws.onclose = (event) => {
	  console.log('Disconnected from Deepgram:', event.code, event.reason);
	  setIsConnected(false);
	  setIsConnecting(false);
	  stopMicrophone();
	  
	  // Clear keepalive
	  if (wsRef.current?.keepaliveInterval) {
		clearInterval(wsRef.current.keepaliveInterval);
	  }
	  
	  // Show error only for abnormal closes
	  if (event.code !== 1000 && event.code !== 1005) {
		toast.error(`Connection closed: ${event.reason || 'Unknown error'}`);
	  }
	};
  };

  const handleOpenAIMessage = (message) => {
    console.log('OpenAI:', message.type);
    
    switch (message.type) {
      case 'session.created':
        configureOpenAISession();
        break;

      case 'session.updated':
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'response.create' }));
          }
        }, 500);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        setTranscript(prev => [...prev, {
          role: 'user',
          content: message.transcript,
          timestamp: new Date()
        }]);
        break;

      case 'response.audio_transcript.done':
        setTranscript(prev => [...prev, {
          role: 'assistant',
          content: message.transcript,
          timestamp: new Date()
        }]);
        break;

      case 'response.audio.delta':
        playAudio(message.delta);
        break;

      default:
        break;
    }
  };

  const handleDeepgramMessage = (message) => {
	  console.log('Deepgram:', message.type, message.description);
	  
	  switch (message.type) {
		case 'Welcome':
		  console.log('👋 Deepgram welcome');
		  break;

		case 'SettingsApplied':
		  console.log('✅ Settings applied');
		  connectTimeRef.current = Date.now();
		  setIsConnected(true);
		  setIsConnecting(false);
		  toast.success('Connected to Deepgram agent');
		  
		  // Start keepalive
		  const keepaliveInterval = setInterval(() => {
			if (wsRef.current?.readyState === WebSocket.OPEN) {
			  try {
				wsRef.current.send(JSON.stringify({ type: 'KeepAlive' }));
			  } catch (error) {
				console.error('Keepalive error:', error);
				clearInterval(keepaliveInterval);
			  }
			} else {
			  clearInterval(keepaliveInterval);
			}
		  }, 5000);
		  
		  wsRef.current.keepaliveInterval = keepaliveInterval;
		  
		  // Start microphone ONLY here
		  setTimeout(() => {
			startMicrophone();
		  }, 500);
		  break;

		case 'ConversationText':
		  if (message.role === 'user') {
			setTranscript(prev => [...prev, {
			  role: 'user',
			  content: message.content,
			  timestamp: new Date()
			}]);
		  } else if (message.role === 'assistant') {
			setTranscript(prev => [...prev, {
			  role: 'assistant',
			  content: message.content,
			  timestamp: new Date()
			}]);
		  }
		  break;

		case 'UserStartedSpeaking':
		  console.log('🎤 User speaking');
		  audioQueueRef.current = [];
		  isPlayingRef.current = false;
		  nextPlayTimeRef.current = 0;
		  break;
		  
		case 'AgentStartedSpeaking':
		  console.log('🔊 Agent speaking');
		  break;

		case 'AgentAudioDone':
		  console.log('✅ Agent audio done');
		  break;

		case 'Error':
		  console.error('❌ Deepgram error:', message);
		  toast.error(message.description || message.error || 'Deepgram error');
		  break;

		default:
		  console.log('ℹ️ Unhandled:', message.type);
		  break;
	  }
	};

  const configureOpenAISession = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    const config = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: selectedAgent.instructions,
        voice: selectedAgent.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
          language: selectedAgent.language
        },
        turn_detection: {
          type: 'server_vad',
          threshold: parseFloat(selectedAgent.vad_threshold || '0.5'),
          prefix_padding_ms: 300,
          silence_duration_ms: parseInt(selectedAgent.silence_duration_ms || '500'),
          create_response: true
        },
        tools: [],
        max_response_output_tokens: parseInt(selectedAgent.max_tokens || '4096'),
        temperature: parseFloat(selectedAgent.temperature || '0.6')
      }
    };

    wsRef.current.send(JSON.stringify(config));
  };

  const startMicrophone = async () => {
    try {
      const sampleRate = provider === 'deepgram' ? 16000 : 24000;
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: sampleRate
        } 
      });

      micStreamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      
      const updateLevel = () => {
        if (!isConnected) return;
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setAudioLevel(average / 255);
        requestAnimationFrame(updateLevel);
      };
      updateLevel();

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || isMuted) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        if (provider === 'openai') {
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64
          }));
        } else if (provider === 'deepgram') {
          wsRef.current.send(pcm16.buffer);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (error) {
      console.error('Microphone error:', error);
      toast.error('Failed to access microphone');
    }
  };

  const playAudio = (base64Audio) => {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      audioQueueRef.current.push(bytes);
      
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (error) {
      console.error('Audio error:', error);
    }
  };

  const playDeepgramAudio = (audioData) => {
    try {
      // Queue the audio
      audioQueueRef.current.push(audioData);
      
      // Start playing if not already
      if (!isPlayingRef.current) {
        playNextChunk();
      }
    } catch (error) {
      console.error('Error queueing audio:', error);
    }
  };

  const playNextChunk = async () => {
    // Deepgram: wait for multiple chunks to reduce choppiness
    if (provider === 'deepgram') {
      const minChunks = 2;
      if (audioQueueRef.current.length < minChunks && audioQueueRef.current.length > 0) {
        // Wait for more chunks
        setTimeout(() => playNextChunk(), 50);
        return;
      }
    }
    
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      nextPlayTimeRef.current = 0;
      return;
    }

    isPlayingRef.current = true;

    try {
      // Create audio context if needed (24kHz for both providers)
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        });
        nextPlayTimeRef.current = audioContextRef.current.currentTime;
      }

      const audioContext = audioContextRef.current;
      let pcm16;

      if (provider === 'deepgram') {
        // Deepgram: combine multiple chunks for smoother playback
        const chunksToPlay = Math.min(2, audioQueueRef.current.length);
        let totalLength = 0;
        const chunksData = [];
        
        for (let i = 0; i < chunksToPlay; i++) {
          const chunk = audioQueueRef.current.shift();
          const chunkPcm16 = new Int16Array(chunk.buffer || chunk);
          chunksData.push(chunkPcm16);
          totalLength += chunkPcm16.length;
        }
        
        // Combine chunks
        pcm16 = new Int16Array(totalLength);
        let offset = 0;
        for (const chunk of chunksData) {
          pcm16.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        // OpenAI: single chunk playback (existing behavior)
        const chunk = audioQueueRef.current.shift();
        pcm16 = new Int16Array(chunk.buffer || chunk);
      }
      
      // Convert to Float32Array (same for both)
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(
        1,
        float32.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32);

      // Create buffer source
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      if (provider === 'deepgram') {
        // Deepgram: use scheduled playback for smoother audio
        const startTime = Math.max(nextPlayTimeRef.current, audioContext.currentTime);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;
        
        // Schedule next chunk
        const timeoutMs = (audioBuffer.duration * 1000) - 50;
        setTimeout(() => {
          playNextChunk();
        }, Math.max(0, timeoutMs));
      } else {
        // OpenAI: use onended callback (existing behavior)
        source.onended = () => {
          playNextChunk();
        };
        source.start(0);
      }

    } catch (error) {
      console.error('Audio playback error:', error);
      isPlayingRef.current = false;
      nextPlayTimeRef.current = 0;
      // Try next chunk anyway
      setTimeout(() => playNextChunk(), 50);
    }
  };

  const stopMicrophone = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const disconnect = () => {
	  if (wsRef.current?.keepaliveInterval) {
		clearInterval(wsRef.current.keepaliveInterval);
	  }
	  
	  if (testSessionId && wsRef.current) {
		finalizeCost();
	  }

	  if (wsRef.current) {
		if (wsRef.current.readyState === WebSocket.OPEN) {
		  try {
			if (provider === 'deepgram') {
			  wsRef.current.send(JSON.stringify({ type: 'EndSession' }));
			}
		  } catch (error) {
			console.error('Error sending EndSession:', error);
		  }
		}
		
		wsRef.current.close();
		wsRef.current = null;
	  }
	  
	  stopMicrophone();
	  
	  // Clear all audio state
	  audioQueueRef.current = [];
	  isPlayingRef.current = false;
	  nextPlayTimeRef.current = 0;  // ADD THIS
	  
	  setIsConnected(false);
	  setTestSessionId(null);
	  setProvider(null);
	};

  const finalizeCost = async () => {
    try {
      const duration = Date.now() - connectTimeRef.current;
      const response = await finalizeTestCall(testSessionId, duration);
      
      if (response.data.success) {
        toast.success(`Test call completed. Cost: $${response.data.cost.toFixed(4)}`);
      }
    } catch (error) {
      console.error('Failed to finalize cost:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Agent Test Utility</h1>
        <p className="mt-1 text-sm text-gray-500">
          Test your voice agents (OpenAI & Deepgram) in real-time
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Settings</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Agent
                </label>
                <select
                  value={selectedAgent?.id || ''}
                  onChange={(e) => setSelectedAgent(agents.find(a => a.id === e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  disabled={isConnected}
                >
                  <option value="">Choose an agent...</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.provider || 'openai'})
                    </option>
                  ))}
                </select>
              </div>

              {selectedAgent && (
                <div className="text-sm text-gray-600 space-y-2">
                  <div className="flex justify-between">
                    <span>Provider:</span>
                    <span className="font-medium">
                      {selectedAgent.provider === 'deepgram' ? 'Deepgram' : 'OpenAI'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Model:</span>
                    <span className="font-medium">
                      {selectedAgent.provider === 'deepgram' 
                        ? selectedAgent.deepgram_model 
                        : selectedAgent.model}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Voice:</span>
                    <span className="font-medium">
                      {selectedAgent.provider === 'deepgram' 
                        ? selectedAgent.deepgram_voice 
                        : selectedAgent.voice}
                    </span>
                  </div>
                </div>
              )}

              <div className="pt-4">
                {!isConnected ? (
                  <button
                    onClick={connect}
                    disabled={!selectedAgent || isConnecting}
                    className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <button
                    onClick={disconnect}
                    className="w-full flex items-center justify-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    <PhoneOff className="w-5 h-5 mr-2" />
                    Disconnect
                  </button>
                )}
              </div>

              {isConnected && (
                <div className="space-y-3">
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-full flex items-center justify-center px-4 py-2 rounded-md ${
                      isMuted 
                        ? 'bg-gray-600 hover:bg-gray-700' 
                        : 'bg-blue-600 hover:bg-blue-700'
                    } text-white`}
                  >
                    {isMuted ? <MicOff className="w-5 h-5 mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>

                  <div className="bg-gray-50 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Audio Level</span>
                      <Volume2 className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${audioLevel * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-sm text-gray-600">Estimated Cost</div>
                    <div className="text-2xl font-bold text-gray-900">
                      ${estimatedCost.toFixed(4)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Conversation</h2>
            
            <div className="h-96 overflow-y-auto space-y-3 border border-gray-200 rounded-lg p-4">
              {transcript.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  No conversation yet. Connect and start talking!
                </div>
              ) : (
                transcript.map((item, idx) => (
                  <div 
                    key={idx}
                    className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div 
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        item.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <div className="text-xs opacity-75 mb-1">
                        {item.role === 'user' ? 'You' : 'Agent'}
                      </div>
                      <div>{item.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentTest;