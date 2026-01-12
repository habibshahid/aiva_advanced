/**
 * Standalone Chat Page
 * OpenAI-style full-page chat interface with rich content support
 * 
 * FIXED: Shows response.html (synthesized answer) instead of formatted_html (raw chunks)
 * FIXED: Sources and images are in collapsible section
 */

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader, ShoppingBag, ChevronDown, ChevronRight, FileText, Image as ImageIcon, X, Camera, ThumbsUp, ThumbsDown, Mic, MicOff, Volume2, Square, ExternalLink, Download } from 'lucide-react';
import axios from 'axios';

/**
 * Audio Player Component
 * Reusable audio playback for sent/received audio
 */
const AudioPlayer = ({ audioUrl, label, isPlaying, onTogglePlay, variant = 'default' }) => {
  const [duration, setDuration] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef(null);
  
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current.duration);
      });
      audioRef.current.addEventListener('timeupdate', () => {
        setCurrentTime(audioRef.current.currentTime);
      });
      audioRef.current.addEventListener('ended', () => {
        setCurrentTime(0);
        onTogglePlay(false);
      });
    }
  }, []);
  
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(err => console.log('Playback error:', err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);
  
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const progress = duration ? (currentTime / duration) * 100 : 0;
  
  const bgColor = variant === 'user' ? 'bg-primary-500/20' : 'bg-gray-100';
  const buttonColor = variant === 'user' ? 'bg-white text-primary-600' : 'bg-primary-500 text-white';
  const textColor = variant === 'user' ? 'text-primary-100' : 'text-gray-600';
  const progressBg = variant === 'user' ? 'bg-primary-400/30' : 'bg-gray-200';
  const progressFill = variant === 'user' ? 'bg-white' : 'bg-primary-500';
  
  return (
    <div className={`flex items-center gap-3 p-2 ${bgColor} rounded-lg`}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      
      {/* Play/Pause Button */}
      <button
        onClick={() => onTogglePlay(!isPlaying)}
        className={`p-2 ${buttonColor} rounded-full hover:opacity-80 transition-opacity flex-shrink-0`}
      >
        {isPlaying ? (
          <Square className="w-4 h-4" />
        ) : (
          <Volume2 className="w-4 h-4" />
        )}
      </button>
      
      {/* Progress Bar & Time */}
      <div className="flex-1 min-w-0">
        <div className={`h-1 ${progressBg} rounded-full overflow-hidden`}>
          <div 
            className={`h-full ${progressFill} transition-all duration-100`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={`flex justify-between mt-1 text-xs ${textColor}`}>
          <span>{formatTime(currentTime)}</span>
          <span>{label || formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Collapsible Sources Component
 * Shows sources and images in an expandable panel with download/open links
 */
const CollapsibleSources = ({ sources = [], images = [] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSources, setExpandedSources] = useState({});
  
  // Don't render if no sources or images
  if ((!sources || sources.length === 0) && (!images || images.length === 0)) {
    return null;
  }
  
  const sourceCount = sources?.length || 0;
  const imageCount = images?.length || 0;
  
  // Toggle individual source content
  const toggleSourceContent = (idx) => {
    setExpandedSources(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };
  
  // Check if source is a web page
  const isWebSource = (source) => {
    const sourceUrl = source.url || 
                      source.source?.metadata?.source_url || 
                      source.metadata?.source_url ||
                      source.source_url;
    return sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'));
  };
  
  // Get source URL for web pages
  const getSourceUrl = (source) => {
    return source.url || 
           source.source?.metadata?.source_url || 
           source.metadata?.source_url ||
           source.source_url;
  };
  
  // Get document ID for download
  const getDocumentId = (source) => {
    return source.document_id || 
           source.source?.document_id || 
           source.metadata?.document_id ||
           source.source?.metadata?.document_id;
  };
  
  // Get API base URL
  const getApiBaseUrl = () => {
    // Try to detect from current URL or use default
    const currentUrl = window.location.origin;
    if (currentUrl.includes('localhost')) {
      return 'http://localhost:62001';
    }
    return currentUrl.includes('/chat/') 
      ? currentUrl.split('/chat/')[0] 
      : currentUrl;
  };
  
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
                const docName = source.source?.document_name || source.document || source.title || 'Document';
                const page = source.source?.page || source.source?.metadata?.page_number || source.page || '';
                const relevance = Math.round((source.score || source.relevance || 0) * 100);
                const content = source.content || '';
                const preview = content.substring(0, 200) + (content.length > 200 ? '...' : '');
                const isWeb = isWebSource(source);
                const sourceUrl = getSourceUrl(source);
                const documentId = getDocumentId(source);
                const isSourceExpanded = expandedSources[idx];
                
                return (
                  <div 
                    key={idx} 
                    className="bg-gray-50 rounded-lg p-3 text-xs"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="flex-shrink-0 w-5 h-5 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center text-xs font-medium">
                          {idx + 1}
                        </span>
                        <span className="font-medium text-gray-900 truncate" title={docName}>
                          {docName}
                        </span>
                      </div>
                      {relevance > 0 && (
                        <span className="flex-shrink-0 text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                          {relevance}%
                        </span>
                      )}
                    </div>
                    
                    {/* Page info */}
                    {page && (
                      <div className="text-gray-500 mb-2">
                        📄 Page {page}
                      </div>
                    )}
                    
                    {/* Content Preview */}
                    <div className="text-gray-600 mb-2">
                      {isSourceExpanded ? content : preview}
                      {content.length > 200 && (
                        <button
                          onClick={() => toggleSourceContent(idx)}
                          className="ml-1 text-primary-600 hover:text-primary-700 font-medium"
                        >
                          {isSourceExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                      {isWeb && sourceUrl ? (
                        // Web source - Open in new tab
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open Source
                        </a>
                      ) : documentId ? (
                        // Document - Download
                        <a
                          href={`${getApiBaseUrl()}/aiva/api/public/chat/document/${documentId}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                        >
                          <Download className="w-3 h-3" />
                          Download Document
                        </a>
                      ) : sourceUrl ? (
                        // Fallback to URL if available
                        <a
                          href={sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View Source
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Images */}
          {images && images.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700">Images</div>
              <div className="grid grid-cols-2 gap-2">
                {images.map((image, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={image.url || image.thumbnail_url}
                      alt={image.description || `Image ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    {image.description && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 rounded-b-lg truncate">
                        {image.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
  
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState(null); // ID of message with playing audio
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioFileInputRef = useRef(null);

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

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
  
    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, GIF, or WebP)');
      return;
    }
  
    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('Image size must be less than 10MB');
      return;
    }
  
    setSelectedImage(file);
  
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start(100); // Collect data every 100ms
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Start timer
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      alert('Could not access microphone. Please check permissions.');
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    }
  };
  
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAudioBlob(null);
    setRecordingDuration(0);
    
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };
  
  const removeAudio = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
  };
  
  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const handleAudioFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'audio/m4a', 'audio/mp4'];
    const validExtensions = ['.mp3', '.wav', '.webm', '.ogg', '.m4a', '.mp4', '.flac'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      alert('Please select a valid audio file (MP3, WAV, WebM, OGG, M4A, FLAC)');
      return;
    }
    
    if (file.size > 25 * 1024 * 1024) {
      alert('Audio file must be less than 25MB');
      return;
    }
    
    setAudioBlob(file);
  };
  
  const imageToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const sendMessage = async (e) => {
	  e.preventDefault();

	  // Allow sending if there's text, image, OR audio
	  if (!input.trim() && !selectedImage && !audioBlob) return;
	  if (sending) return;
	  
	  const userMessage = input.trim();
	  setInput('');
	  setSending(true);
	  
	  // Convert image to base64 if selected
	  let imageBase64 = null;
	  if (selectedImage) {
		try {
		  imageBase64 = await imageToBase64(selectedImage);
		} catch (err) {
		  console.error('Failed to convert image:', err);
		}
	  }
	  
	  // Determine user message content for display
	  let userMsgContent = userMessage;
	  if (!userMsgContent && selectedImage) userMsgContent = '📷 [Image]';
	  if (!userMsgContent && audioBlob) userMsgContent = '🎤 [Voice Message]';
	  
	  // ✅ FIX: Store attachments BEFORE clearing them
	  const sentImagePreview = imagePreview;
	  const sentAudioBlob = audioBlob;
	  
	  // ✅ FIX: Now sentAudioBlob is declared, so we can use it
	  let userAudioUrl = null;
	  if (sentAudioBlob) {
		userAudioUrl = URL.createObjectURL(sentAudioBlob);
	  }
	  
	  // Add user message to chat
	  setMessages(prev => [...prev, {
		id: Date.now().toString(),
		role: 'user',
		content: userMsgContent,
		image: sentImagePreview,  // ✅ Use sentImagePreview instead of imagePreview
		isAudio: !!sentAudioBlob,
		audioUrl: userAudioUrl,
		created_at: new Date().toISOString()
	  }]);
	  
	  // Clear attachments
	  removeImage();
	  removeAudio();
	  
	  try {
		let response;
		
		if (sentAudioBlob) {
		  // Send as FormData for audio
		  const formData = new FormData();
		  formData.append('audio', sentAudioBlob, 'recording.webm');
		  formData.append('session_id', sessionId || '');
		  formData.append('agent_id', agentId);
		  formData.append('generate_audio_response', 'true');
		  
		  if (userMessage) {
			formData.append('message', userMessage);
		  }
		  
		  // ✅ FIX: Added missing parentheses
		  response = await axios.post(`${API_URL}/message`, formData, {
			headers: { 'Content-Type': 'multipart/form-data' }
		  });
		} else {
		  // Send as JSON for text/image
		  // ✅ FIX: Added missing parentheses
		  response = await axios.post(`${API_URL}/message`, {
			session_id: sessionId,
			agent_id: agentId,
			message: userMessage || '.',
			image: imageBase64
		  });
		}
		
		const data = response.data.data;
		
		// Save session if new
		if (data.session_id && (!sessionId || data.new_session_created)) {
		  setSessionId(data.session_id);
		  localStorage.setItem(`aiva_chat_${agentId}`, data.session_id);
		}
		
		// Add assistant message
		setMessages(prev => [...prev, {
		  id: data.message_id || Date.now().toString(),
		  role: 'assistant',
		  content: data.response?.text || '',
		  content_html: data.response?.html,
		  sources: data.sources || [],
		  images: data.images || [],
		  products: data.products || [],
		  transcription: data.transcription,
		  audio_response: data.audio_response,
		  created_at: new Date().toISOString()
		}]);
		
		// Auto-play audio response if available (optional - can be annoying)
		// if (data.audio_response?.url) {
		//   const audio = new Audio(data.audio_response.url);
		//   audio.play().catch(err => console.log('Auto-play blocked:', err));
		// }
		
		// Handle feedback prompt
		if (data.show_feedback_prompt || data.interaction_closed) {
		  setShowFeedbackPrompt(true);
		}
		
	  } catch (error) {
		console.error('Send message error:', error);
		setMessages(prev => [...prev, {
		  id: Date.now().toString(),
		  role: 'assistant',
		  content: 'Sorry, I encountered an error. Please try again.',
		  error: true,
		  created_at: new Date().toISOString()
		}]);
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
  /**
   * Render message content with audio players
   */
  const renderMessageContent = (message) => {
    // User message with image
    if (message.role === 'user' && message.image) {
      return (
        <div>
          {message.content && message.content !== '📷 [Image]' && (
            <p className="text-sm mb-2">{message.content}</p>
          )}
          <img 
            src={message.image} 
            alt="Uploaded" 
            className="max-w-xs rounded-lg"
          />
        </div>
      );
    }
    
    // User message with audio
    if (message.role === 'user' && message.isAudio) {
      return (
        <div>
          {message.content && message.content !== '🎤 [Voice Message]' && (
            <p className="text-sm mb-2">{message.content}</p>
          )}
          {message.audioUrl ? (
            <AudioPlayer
              audioUrl={message.audioUrl}
              label="Voice message"
              isPlaying={playingAudioId === `user-${message.id}`}
              onTogglePlay={(playing) => setPlayingAudioId(playing ? `user-${message.id}` : null)}
              variant="user"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm opacity-80">
              <Mic className="w-4 h-4" />
              <span>Voice message sent</span>
            </div>
          )}
        </div>
      );
    }
    
    // Assistant message
    const mainContent = message.response?.html 
      || message.response?.text 
      || message.html 
      || message.content 
      || '';
    
    return (
      <>
        {/* Transcription indicator */}
        {message.transcription && (
          <div className="mb-2 text-xs text-gray-500 italic flex items-center gap-1">
            <Mic className="w-3 h-3" />
            <span>Transcribed from voice ({message.transcription.language})</span>
          </div>
        )}
        
        {/* Main content */}
        <div 
          className="text-sm whitespace-pre-wrap prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: mainContent }}
        />
        
        {/* Audio Response Player */}
        {message.audio_response?.url && (
          <div className="mt-3">
            <AudioPlayer
              audioUrl={message.audio_response.url}
              label={message.audio_response.estimated_duration 
                ? `${Math.round(message.audio_response.estimated_duration)}s` 
                : 'Audio response'}
              isPlaying={playingAudioId === `assistant-${message.id}`}
              onTogglePlay={(playing) => setPlayingAudioId(playing ? `assistant-${message.id}` : null)}
              variant="default"
            />
          </div>
        )}

        {/* Collapsible Sources */}
        <CollapsibleSources 
          sources={message.sources} 
          images={message.images} 
        />

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

        {/* Message Feedback */}
        {message.role === 'assistant' && message.id && message.id !== 'greeting' && (
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
			{/* Image Preview */}
			{imagePreview && (
			  <div className="mb-3 flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
				<img 
				  src={imagePreview} 
				  alt="Selected" 
				  className="w-16 h-16 object-cover rounded-lg"
				/>
				<div className="flex-1 min-w-0">
				  <p className="text-sm font-medium text-gray-900 truncate">
					{selectedImage?.name}
				  </p>
				  <p className="text-xs text-gray-500">
					{selectedImage && (selectedImage.size / 1024).toFixed(1)} KB
				  </p>
				</div>
				<button
				  type="button"
				  onClick={removeImage}
				  className="text-gray-400 hover:text-gray-600 p-1"
				>
				  <X className="w-5 h-5" />
				</button>
			  </div>
			)}
			{/* Audio Preview */}
			{audioBlob && !isRecording && (
			  <div className="mb-3 flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-200">
				<div className="p-2 bg-blue-500 rounded-full">
				  <Mic className="w-5 h-5 text-white" />
				</div>
				<div className="flex-1 min-w-0">
				  <p className="text-sm font-medium text-gray-900">
					Voice Message
				  </p>
				  <p className="text-xs text-gray-500">
					{formatDuration(recordingDuration)} • Ready to send
				  </p>
				</div>
				<button
				  type="button"
				  onClick={removeAudio}
				  className="text-gray-400 hover:text-gray-600 p-1"
				>
				  <X className="w-5 h-5" />
				</button>
			  </div>
			)}
			
			<form onSubmit={sendMessage} className="flex items-end space-x-3">
			  {/* Hidden file input */}
			  <input
				ref={fileInputRef}
				type="file"
				accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
				onChange={handleImageSelect}
				className="hidden"
			  />
			  <input
				ref={audioFileInputRef}
				type="file"
				accept="audio/*,.mp3,.wav,.webm,.ogg,.m4a,.flac"
				onChange={handleAudioFileSelect}
				className="hidden"
			  />
			  {/* Image upload button */}
			  <button
				type="button"
				onClick={() => fileInputRef.current?.click()}
				disabled={sending || isRecording}
				className="flex-shrink-0 p-3 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				title="Upload image"
			  >
				<Camera className="w-5 h-5 text-gray-600" />
			  </button>
			  
			  {/* Microphone / Recording button */}
			  {!audioBlob && (
				<button
				  type="button"
				  onClick={isRecording ? stopRecording : startRecording}
				  disabled={sending}
				  className={`flex-shrink-0 p-3 border rounded-xl transition-colors ${
					isRecording 
					  ? 'bg-red-500 border-red-500 text-white animate-pulse' 
					  : 'border-gray-300 hover:bg-gray-50 text-gray-600'
				  } disabled:opacity-50 disabled:cursor-not-allowed`}
				  title={isRecording ? 'Stop recording' : 'Start voice recording'}
				>
				  {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
				</button>
			  )}
			  
			  {/* Recording indicator */}
			  {isRecording && (
				<div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
				  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
				  <span className="text-sm text-red-600 font-medium">
					{formatDuration(recordingDuration)}
				  </span>
				  <button
					type="button"
					onClick={cancelRecording}
					className="text-red-500 hover:text-red-700"
				  >
					<X className="w-4 h-4" />
				  </button>
				</div>
			  )}
			  
			  {/* Text input */}
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
				  placeholder={
					audioBlob 
					  ? "Add a message or just send the audio..."
					  : isRecording 
					  ? "Recording..."
					  : selectedImage 
					  ? "Add a message or just send the image..." 
					  : "Type your message..."
				  }
				  disabled={isRecording}
				  rows="1"
				  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none disabled:bg-gray-100"
				  style={{ minHeight: '52px', maxHeight: '200px' }}
				/>
			  </div>
			  
			  {/* Send button */}
			  <button
				type="submit"
				disabled={(!input.trim() && !selectedImage && !audioBlob) || sending || isRecording}
				className="flex-shrink-0 bg-primary-600 text-white rounded-xl px-4 py-3 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
			  >
				{sending ? (
				  <Loader className="w-5 h-5 animate-spin" />
				) : (
				  <Send className="w-5 h-5" />
				)}
			  </button>
			</form>
			
			<p className="text-xs text-gray-500 text-center mt-2">
			  {selectedImage 
				? "Press Enter to send with image" 
				: "Press Enter to send, Shift+Enter for new line"
			  }
			</p>
		  </div>
		</div>
    </div>
  );
};

export default ChatPage;