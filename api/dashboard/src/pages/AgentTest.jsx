import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Phone, PhoneOff, Volume2, Settings } from 'lucide-react';
import { getAgents, getRealtimeToken } from '../services/api';
import toast from 'react-hot-toast';

const AgentTest = () => {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const micStreamRef = useRef(null);
  const audioPlayerRef = useRef(null);

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

  const connect = async () => {
  if (!selectedAgent) {
    toast.error('Please select an agent');
    return;
  }

  try {
    const tokenResponse = await getRealtimeToken(selectedAgent.id);
    const { ephemeral_key } = tokenResponse.data;

    console.log('Connecting with key:', ephemeral_key);

    // Correct WebSocket connection with subprotocols
    const ws = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${selectedAgent.model}`,
      ['realtime', `openai-insecure-api-key.${ephemeral_key}`, 'openai-beta.realtime-v1']
    );

    wsRef.current = ws;

    ws.onopen = async () => {
      console.log('Connected to OpenAI Realtime');
      setIsConnected(true);
      toast.success('Connected to agent');

      // Configure session
      ws.send(JSON.stringify({
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: selectedAgent.instructions,
          voice: selectedAgent.voice,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: { model: 'whisper-1' },
          turn_detection: {
            type: 'server_vad',
            threshold: selectedAgent.vad_threshold || 0.5,
            silence_duration_ms: selectedAgent.silence_duration_ms || 500
          },
          temperature: selectedAgent.temperature || 0.6,
          max_response_output_tokens: selectedAgent.max_tokens || 4096
        }
      }));

      // Start microphone
      await startMicrophone();
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleRealtimeMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast.error('Connection error');
    };

    ws.onclose = (event) => {
      console.log('Disconnected from OpenAI');
      console.log('Close code:', event.code);
      console.log('Close reason:', event.reason);
      setIsConnected(false);
      stopMicrophone();
      
      if (event.code !== 1000) {
        toast.error(`Connection closed: ${event.reason || 'Unknown error'}`);
      }
    };

  } catch (error) {
    console.error('Failed to connect:', error);
    toast.error('Failed to connect to agent');
  }
};

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    stopMicrophone();
    setIsConnected(false);
  };

  const startMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000
        } 
      });

      micStreamRef.current = stream;

      // Create audio context for processing
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      // Audio level meter
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
        if (!wsRef.current || isMuted) return;

        const inputData = e.inputBuffer.getChannelData(0);
        
        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send to OpenAI
        const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
        wsRef.current.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (error) {
      console.error('Microphone error:', error);
      toast.error('Failed to access microphone');
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

  const handleRealtimeMessage = (message) => {
    switch (message.type) {
      case 'session.created':
        console.log('Session created');
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

      case 'input_audio_buffer.speech_started':
        console.log('User speaking...');
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('User stopped speaking');
        break;

      default:
        break;
    }
  };

  const playAudio = (base64Audio) => {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();

    } catch (error) {
      console.error('Audio playback error:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Agent Test Utility</h1>
        <p className="mt-1 text-sm text-gray-500">
          Test your voice agents in real-time from your browser
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2" />
              Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Agent
                </label>
                <select
                  value={selectedAgent?.id || ''}
                  onChange={(e) => {
                    const agent = agents.find(a => a.id === e.target.value);
                    setSelectedAgent(agent);
                  }}
                  disabled={isConnected}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Choose an agent...</option>
                  {agents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.voice})
                    </option>
                  ))}
                </select>
              </div>

              {selectedAgent && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                  <div>
                    <span className="font-medium">Model:</span> {selectedAgent.model}
                  </div>
                  <div>
                    <span className="font-medium">Voice:</span> {selectedAgent.voice}
                  </div>
                  <div>
                    <span className="font-medium">Language:</span> {selectedAgent.language}
                  </div>
                  <div>
                    <span className="font-medium">Temperature:</span> {selectedAgent.temperature}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                {!isConnected ? (
                  <button
                    onClick={connect}
                    disabled={!selectedAgent}
                    className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    <Phone className="w-5 h-5 mr-2" />
                    Start Call
                  </button>
                ) : (
                  <button
                    onClick={disconnect}
                    className="w-full flex items-center justify-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                  >
                    <PhoneOff className="w-5 h-5 mr-2" />
                    End Call
                  </button>
                )}
              </div>

              {isConnected && (
                <>
                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-full flex items-center justify-center px-4 py-2 rounded-lg font-medium ${
                      isMuted
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {isMuted ? (
                      <>
                        <MicOff className="w-5 h-5 mr-2" />
                        Unmute
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5 mr-2" />
                        Mute
                      </>
                    )}
                  </button>

                  {/* Audio Level Indicator */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Microphone Level</span>
                      <span className="text-gray-900 font-medium">
                        {Math.round(audioLevel * 100)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          audioLevel > 0.7 ? 'bg-red-500' :
                          audioLevel > 0.4 ? 'bg-yellow-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${audioLevel * 100}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg overflow-hidden flex flex-col h-[600px]">
            <div className="px-6 py-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold flex items-center">
                <Volume2 className="w-5 h-5 mr-2" />
                Conversation
                {isConnected && (
                  <span className="ml-auto flex items-center text-sm text-green-600">
                    <span className="w-2 h-2 bg-green-600 rounded-full mr-2 animate-pulse" />
                    Live
                  </span>
                )}
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {transcript.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <Mic className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p className="text-lg">
                      {isConnected ? 'Start speaking...' : 'Connect to start testing'}
                    </p>
                  </div>
                </div>
              ) : (
                transcript.map((item, index) => (
                  <div
                    key={index}
                    className={`flex ${item.role === 'user' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-3 rounded-lg ${
                        item.role === 'user'
                          ? 'bg-gray-100 text-gray-900'
                          : 'bg-primary-600 text-white'
                      }`}
                    >
                      <div className="flex items-baseline space-x-2 mb-1">
                        <span className="text-xs font-semibold uppercase opacity-75">
                          {item.role === 'user' ? 'You' : 'Agent'}
                        </span>
                        <span className="text-xs opacity-50">
                          {item.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm">{item.content}</p>
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