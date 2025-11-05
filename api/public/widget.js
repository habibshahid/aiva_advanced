/**
 * AIVA Chat Widget Loader
 * Embeddable chat widget for websites
 */

(function() {
  'use strict';

  // Configuration
  let config = {
    agentId: null,
    apiUrl: window.location.origin + '/api/public/chat',
    primaryColor: '#6366f1',
    position: 'bottom-right',
    buttonText: 'Chat with us'
  };

  let sessionId = null;
  let isOpen = false;
  let messages = [];

  /**
   * Initialize widget
   */
  function init(options) {
    config = { ...config, ...options };

    if (!config.agentId) {
      console.error('AIVA Widget: agentId is required');
      return;
    }

    // Load session from localStorage
    const savedSession = localStorage.getItem('aiva_session_' + config.agentId);
    if (savedSession) {
      sessionId = savedSession;
      loadHistory();
    }

    // Create widget UI
    createWidget();
    
    // Apply custom styles
    applyStyles();
  }

  /**
   * Create widget HTML
   */
  function createWidget() {
    const widgetHTML = `
      <div id="aiva-widget" class="aiva-widget ${config.position}">
        <!-- Chat Button -->
        <button id="aiva-chat-button" class="aiva-chat-button" aria-label="Open chat">
          <svg class="aiva-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <svg class="aiva-icon-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <!-- Chat Window -->
        <div id="aiva-chat-window" class="aiva-chat-window" style="display:none;">
          <!-- Header -->
          <div class="aiva-header">
            <div class="aiva-header-content">
              <div class="aiva-avatar">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              </div>
              <div class="aiva-header-text">
                <div class="aiva-agent-name">AI Assistant</div>
                <div class="aiva-agent-status">Online</div>
              </div>
            </div>
            <button id="aiva-minimize" class="aiva-minimize-button" aria-label="Minimize">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>

          <!-- Messages -->
          <div id="aiva-messages" class="aiva-messages">
            <div class="aiva-welcome">
              <div class="aiva-welcome-icon">👋</div>
              <div class="aiva-welcome-text">Hello! How can I help you today?</div>
            </div>
          </div>

          <!-- Typing Indicator -->
          <div id="aiva-typing" class="aiva-typing" style="display:none;">
            <div class="aiva-typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <!-- Input -->
          <div class="aiva-input-container">
            <input 
              type="text" 
              id="aiva-input" 
              class="aiva-input" 
              placeholder="Type your message..."
              autocomplete="off"
            />
            <button id="aiva-send" class="aiva-send-button" aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>

          <!-- Powered By -->
          <div class="aiva-footer">
            <span class="aiva-powered">Powered by AIVA</span>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    // Attach event listeners
    document.getElementById('aiva-chat-button').addEventListener('click', toggleChat);
    document.getElementById('aiva-minimize').addEventListener('click', closeChat);
    document.getElementById('aiva-send').addEventListener('click', sendMessage);
    document.getElementById('aiva-input').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  /**
   * Apply custom styles
   */
  function applyStyles() {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .aiva-widget {
        position: fixed;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .aiva-widget.bottom-right {
        bottom: 20px;
        right: 20px;
      }
      .aiva-widget.bottom-left {
        bottom: 20px;
        left: 20px;
      }
      .aiva-chat-button {
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: ${config.primaryColor};
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
        color: white;
      }
      .aiva-chat-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }
      .aiva-icon-chat, .aiva-icon-close {
        width: 28px;
        height: 28px;
      }
      .aiva-chat-window {
        position: absolute;
        bottom: 80px;
        width: 380px;
        height: 600px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s ease;
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .aiva-header {
        background: ${config.primaryColor};
        color: white;
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .aiva-header-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .aiva-avatar {
        width: 40px;
        height: 40px;
        background: rgba(255,255,255,0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .aiva-avatar svg {
        width: 24px;
        height: 24px;
      }
      .aiva-agent-name {
        font-weight: 600;
        font-size: 16px;
      }
      .aiva-agent-status {
        font-size: 12px;
        opacity: 0.9;
      }
      .aiva-minimize-button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .aiva-minimize-button svg {
        width: 20px;
        height: 20px;
      }
      .aiva-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f9fafb;
      }
      .aiva-welcome {
        text-align: center;
        padding: 20px;
      }
      .aiva-welcome-icon {
        font-size: 48px;
        margin-bottom: 8px;
      }
      .aiva-welcome-text {
        color: #6b7280;
        font-size: 14px;
      }
      .aiva-message {
        display: flex;
        gap: 8px;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .aiva-message.user {
        flex-direction: row-reverse;
      }
      .aiva-message-bubble {
        max-width: 75%;
        padding: 10px 14px;
        border-radius: 18px;
        font-size: 14px;
        line-height: 1.4;
      }
      .aiva-message.bot .aiva-message-bubble {
        background: white;
        color: #1f2937;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .aiva-message.user .aiva-message-bubble {
        background: ${config.primaryColor};
        color: white;
        border-bottom-right-radius: 4px;
      }
      .aiva-typing {
        padding: 8px 16px;
        background: #f9fafb;
      }
      .aiva-typing-indicator {
        display: flex;
        gap: 4px;
        padding: 10px 14px;
        background: white;
        border-radius: 18px;
        width: fit-content;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .aiva-typing-indicator span {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        animation: bounce 1.4s infinite ease-in-out;
      }
      .aiva-typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
      .aiva-typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }
      .aiva-input-container {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }
      .aiva-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #e5e7eb;
        border-radius: 20px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      .aiva-input:focus {
        border-color: ${config.primaryColor};
      }
      .aiva-send-button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: ${config.primaryColor};
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s;
      }
      .aiva-send-button:hover {
        transform: scale(1.1);
      }
      .aiva-send-button svg {
        width: 20px;
        height: 20px;
      }
      .aiva-footer {
        padding: 8px 16px;
        text-align: center;
        background: white;
        border-top: 1px solid #e5e7eb;
      }
      .aiva-powered {
        font-size: 11px;
        color: #9ca3af;
      }
      @media (max-width: 480px) {
        .aiva-chat-window {
          width: calc(100vw - 40px);
          height: calc(100vh - 120px);
        }
      }
    `;
    document.head.appendChild(styleSheet);
  }

  /**
   * Toggle chat window
   */
  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  /**
   * Open chat
   */
  async function openChat() {
    isOpen = true;
    document.getElementById('aiva-chat-window').style.display = 'flex';
    document.querySelector('.aiva-icon-chat').style.display = 'none';
    document.querySelector('.aiva-icon-close').style.display = 'block';
    document.getElementById('aiva-input').focus();

    // Initialize session if needed
    if (!sessionId) {
      await initSession();
    }
  }

  /**
   * Close chat
   */
  function closeChat() {
    isOpen = false;
    document.getElementById('aiva-chat-window').style.display = 'none';
    document.querySelector('.aiva-icon-chat').style.display = 'block';
    document.querySelector('.aiva-icon-close').style.display = 'none';
  }

  /**
   * Initialize chat session
   */
  async function initSession() {
    try {
      const response = await fetch(`${config.apiUrl}/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: config.agentId,
          visitor_info: {
            url: window.location.href,
            referrer: document.referrer,
            userAgent: navigator.userAgent
          }
        })
      });

      const data = await response.json();
      
      if (data.success) {
        sessionId = data.data.session_id;
        localStorage.setItem('aiva_session_' + config.agentId, sessionId);

        // Update header with agent info
        if (data.data.agent.name) {
          document.querySelector('.aiva-agent-name').textContent = data.data.agent.name;
        }
        if (data.data.agent.greeting) {
          document.querySelector('.aiva-welcome-text').textContent = data.data.agent.greeting;
        }
      }
    } catch (error) {
      console.error('AIVA Widget: Failed to initialize session', error);
    }
  }

  /**
   * Load message history
   */
  async function loadHistory() {
    try {
      const response = await fetch(`${config.apiUrl}/history/${sessionId}`);
      const data = await response.json();

      if (data.success && data.data.messages) {
        messages = data.data.messages;
        renderMessages();
      }
    } catch (error) {
      console.error('AIVA Widget: Failed to load history', error);
    }
  }

  /**
   * Send message
   */
  async function sendMessage() {
    const input = document.getElementById('aiva-input');
    const message = input.value.trim();

    if (!message || !sessionId) return;

    // Clear input
    input.value = '';

    // Add user message to UI
    addMessage('user', message);

    // Show typing indicator
    document.getElementById('aiva-typing').style.display = 'block';
    scrollToBottom();

    try {
      const response = await fetch(`${config.apiUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: message
        })
      });

      const data = await response.json();

      // Hide typing indicator
      document.getElementById('aiva-typing').style.display = 'none';

      if (data.success) {
        addMessage('bot', data.data.response);
      } else {
        addMessage('bot', 'Sorry, I encountered an error. Please try again.');
      }
    } catch (error) {
      document.getElementById('aiva-typing').style.display = 'none';
      addMessage('bot', 'Sorry, I could not connect to the server. Please try again later.');
      console.error('AIVA Widget: Send message failed', error);
    }
  }

  /**
   * Add message to UI
   */
  function addMessage(role, content) {
    messages.push({ role, content });
    renderMessages();
  }

  /**
   * Render all messages
   */
  function renderMessages() {
    const container = document.getElementById('aiva-messages');
    
    // Keep welcome message if no messages
    if (messages.length === 0) return;

    // Clear and re-render
    container.innerHTML = '';
    
    messages.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `aiva-message ${msg.role}`;
      messageDiv.innerHTML = `
        <div class="aiva-message-bubble">${escapeHtml(msg.content)}</div>
      `;
      container.appendChild(messageDiv);
    });

    scrollToBottom();
  }

  /**
   * Scroll to bottom
   */
  function scrollToBottom() {
    const container = document.getElementById('aiva-messages');
    container.scrollTop = container.scrollHeight;
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose init function
  window.aiva = function(command, options) {
    if (command === 'init') {
      init(options);
    }
  };

  // Process queued calls
  if (window.aiva && window.aiva.q) {
    window.aiva.q.forEach(function(args) {
      window.aiva.apply(window, args);
    });
  }
})();