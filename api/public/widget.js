/**
 * AIVA Chat Widget
 * Complete embeddable chat widget for websites
 */

(function() {
  'use strict';

  /**
   * Auto-detect API URL from widget script source
   */
  function getApiUrl() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src;
      if (src && src.includes('widget.js')) {
        try {
          const url = new URL(src);
          const baseUrl = url.origin + url.pathname.replace('/widget.js', '');
          return baseUrl + '/api/public/chat';
        } catch (e) {
          console.warn('AIVA Widget: Could not parse script URL', e);
        }
      }
    }
    return window.location.origin + '/aiva/api/public/chat';
  }

  /**
	 * Format sources for display with collapsible content
	 */
	function formatSources(sources) {
	  if (!sources || sources.length === 0) return '';
	  
	  return `
		<div class="aiva-sources">
		  <div class="aiva-sources-header">📚 Sources (${sources.length})</div>
		  ${sources.map((source, idx) => {
			const sourceId = `source-${Date.now()}-${idx}`;
			const sourceUrl = source.url || source.metadata?.source_url;
			const hasLongContent = source.content && source.content.length > 150;
			
			return `
			  <div class="aiva-source-item">
				<!-- Title with badge -->
				<div class="aiva-source-title-wrapper">
				  <span class="aiva-source-badge">${idx + 1}</span>
				  <span class="aiva-source-title-text">${escapeHtml(source.title || 'Document')}</span>
				</div>
				
				<!-- Content -->
				<div class="aiva-source-content" id="${sourceId}-content">
				  <div class="aiva-source-preview">${escapeHtml(source.content.substring(0, 150))}${hasLongContent ? '...' : ''}</div>
				  <div class="aiva-source-full" style="display: none;">${escapeHtml(source.content)}</div>
				</div>
				
				<!-- Metadata -->
				${(source.page || source.relevance_score) ? `
				  <div class="aiva-source-meta">
					${source.page ? `<span>📄 Page ${source.page}</span>` : ''}
					${source.relevance_score ? `<span>🎯 ${(source.relevance_score * 100).toFixed(0)}% match</span>` : ''}
				  </div>
				` : ''}
				
				<!-- Toggle Button -->
				${hasLongContent ? `
				  <button class="aiva-source-toggle" onclick="toggleSource('${sourceId}')">
					<span class="show-more">↓ Show more</span>
					<span class="show-less" style="display: none;">↑ Show less</span>
				  </button>
				` : ''}
				
				<!-- Source Link -->
				${sourceUrl ? `
				  <div class="aiva-source-link-wrapper">
					<a href="${sourceUrl}" target="_blank" class="aiva-source-link">
					  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
						<polyline points="15 3 21 3 21 9"></polyline>
						<line x1="10" y1="14" x2="21" y2="3"></line>
					  </svg>
					  View source
					</a>
				  </div>
				` : ''}
			  </div>
			`;
		  }).join('')}
		</div>
	  `;
	}

	/**
	 * Toggle source content visibility
	 */
	window.toggleSource = function(sourceId) {
	  const container = document.getElementById(sourceId + '-content');
	  if (!container) return;
	  
	  const preview = container.querySelector('.aiva-source-preview');
	  const full = container.querySelector('.aiva-source-full');
	  const button = container.parentElement.querySelector('.aiva-source-toggle');
	  
	  if (preview && full && button) {
		const isExpanded = full.style.display !== 'none';
		
		preview.style.display = isExpanded ? 'block' : 'none';
		full.style.display = isExpanded ? 'none' : 'block';
		button.querySelector('.show-more').style.display = isExpanded ? 'inline' : 'none';
		button.querySelector('.show-less').style.display = isExpanded ? 'none' : 'inline';
	  }
	};

	/**
	 * Format products for display
	 */
	function formatProducts(products) {
	  if (!products || products.length === 0) return '';
	  
	  return `
		<div class="aiva-products">
		  <div class="aiva-products-header">🛍️ Products (${products.length})</div>
		  <div class="aiva-products-grid">
			${products.map(product => `
			  <div class="aiva-product-card">
				${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" class="aiva-product-image">` : ''}
				<div class="aiva-product-name">${escapeHtml(product.name)}</div>
				<div class="aiva-product-price">${escapeHtml(product.price)}</div>
				${product.purchase_url ? `<a href="${product.purchase_url}" target="_blank" class="aiva-product-link">View Product</a>` : ''}
			  </div>
			`).join('')}
		  </div>
		</div>
	  `;
	}

	/**
	 * Format images for display
	 */
	function formatImages(images) {
	  if (!images || images.length === 0) return '';
	  
	  let html = '<div class="aiva-images" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">';
	  html += '<div style="font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">';
	  html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
	  html += 'Related Images (' + images.length + ')';
	  html += '</div>';
	  
	  html += '<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">';
	  
	  images.forEach(function(img) {
		const title = img.title || 'Image';
		const pageNum = img.page_number || null;
		const relevance = img.similarity_score ? Math.round(img.similarity_score * 100) : null;
		const url = img.url || '';
		const thumbnailUrl = img.thumbnail_url || img.url || '';
		
		html += '<div class="aiva-image-item" onclick="window.open(\'' + url + '\', \'_blank\')" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; cursor: pointer; transition: all 0.2s;">';
		
		// Image
		html += '<div style="width: 100%; height: 100px; background: #f3f4f6; overflow: hidden;">';
		html += '<img src="' + thumbnailUrl + '" alt="' + escapeHtml(title) + '" style="width: 100%; height: 100%; object-fit: cover; display: block;" loading="lazy" onerror="this.src=\'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-size=%2214%22%3EImage%3C/text%3E%3C/svg%3E\'" />';
		html += '</div>';
		
		// Info
		html += '<div style="padding: 6px; background: white;">';
		html += '<div style="font-weight: 500; color: #1f2937; font-size: 10px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="' + escapeHtml(title) + '">' + escapeHtml(title) + '</div>';
		
		if (pageNum) {
		  html += '<div style="color: #6b7280; font-size: 9px;">Page ' + pageNum + '</div>';
		}
		
		if (relevance) {
		  html += '<div style="color: #10b981; font-weight: 500; font-size: 9px;">' + relevance + '% match</div>';
		}
		
		html += '</div>';
		html += '</div>';
	  });
	  
	  html += '</div>';
	  html += '</div>';
	  
	  return html;
	}
  // Configuration
  let config = {
    agentId: null,
    apiUrl: null,
    primaryColor: '#6366f1',
    position: 'bottom-right',
    buttonText: 'Chat with us'
  };

  let sessionId = null;
  let isOpen = false;
  let messages = [];
  
  let showFeedbackPrompt = false;
  let feedbackSubmitted = false;

  /**
   * Initialize widget
   */
  function init(options) {
    // Set API URL
    if (options.apiUrl) {
      config.apiUrl = options.apiUrl;
    } else {
      config.apiUrl = getApiUrl();
    }
    
    config = { ...config, ...options };

    console.log('AIVA Widget: Initializing...', {
      agentId: config.agentId,
      apiUrl: config.apiUrl,
      primaryColor: config.primaryColor,
      position: config.position
    });

    if (!config.agentId) {
      console.error('AIVA Widget: agentId is required');
      return;
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        initWidget();
      });
    } else {
      initWidget();
    }
  }

  /**
   * Initialize widget after DOM is ready
   */
  function initWidget() {
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
    
    console.log('AIVA Widget: Initialized successfully! Chat bubble should be visible.');
  }

  /**
   * Create widget HTML
   */
  function createWidget() {
    // Check if widget already exists
    if (document.getElementById('aiva-widget')) {
      console.warn('AIVA Widget: Widget already exists');
      return;
    }

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
            <span class="aiva-powered">Powered by Intellicon AiVA</span>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);
    console.log('AIVA Widget: HTML elements created');

    // Attach event listeners
    const chatButton = document.getElementById('aiva-chat-button');
    const minimizeButton = document.getElementById('aiva-minimize');
    const sendButton = document.getElementById('aiva-send');
    const input = document.getElementById('aiva-input');

    if (chatButton) {
      chatButton.addEventListener('click', toggleChat);
      console.log('AIVA Widget: Chat button listener attached');
    }

    if (minimizeButton) {
      minimizeButton.addEventListener('click', closeChat);
    }

    if (sendButton) {
      sendButton.addEventListener('click', sendMessage);
    }

    if (input) {
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
      });
    }
  }

  /**
	 * Apply custom styles
	 */
	function applyStyles() {
	  // Check if styles already applied
	  if (document.getElementById('aiva-widget-styles')) {
		return;
	  }

	  const styleSheet = document.createElement('style');
	  styleSheet.id = 'aiva-widget-styles';
	  styleSheet.textContent = `
		/* Widget Container */
		.aiva-widget {
		  position: fixed;
		  z-index: 999999;
		  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		}
		
		/* Position variants */
		.aiva-widget.bottom-right {
		  bottom: 20px;
		  right: 20px;
		}
		.aiva-widget.bottom-left {
		  bottom: 20px;
		  left: 20px;
		}
		.aiva-widget.top-right {
		  top: 20px;
		  right: 20px;
		}
		.aiva-widget.top-left {
		  top: 20px;
		  left: 20px;
		}
		
		/* Chat Button */
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
		  position: relative;
		  z-index: 1000000;
		}
		.aiva-chat-button:hover {
		  transform: scale(1.1);
		  box-shadow: 0 6px 16px rgba(0,0,0,0.2);
		}
		.aiva-chat-button:active {
		  transform: scale(0.95);
		}
		
		/* Icons */
		.aiva-icon-chat, .aiva-icon-close {
		  width: 28px;
		  height: 28px;
		}
		
		/* Chat Window - Fixed positioning to prevent overflow */
		.aiva-chat-window {
		  position: fixed;
		  width: 380px;
		  height: 600px;
		  max-width: calc(100vw - 40px);
		  max-height: calc(100vh - 100px);
		  background: white;
		  border-radius: 16px;
		  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
		  display: flex;
		  flex-direction: column;
		  overflow: hidden;
		  animation: slideUp 0.3s ease;
		  z-index: 999999;
		}
		
		/* Position chat window based on button position */
		.aiva-widget.bottom-right .aiva-chat-window {
		  bottom: 90px;
		  right: 20px;
		}
		.aiva-widget.bottom-left .aiva-chat-window {
		  bottom: 90px;
		  left: 20px;
		}
		.aiva-widget.top-right .aiva-chat-window {
		  top: 90px;
		  right: 20px;
		}
		.aiva-widget.top-left .aiva-chat-window {
		  top: 90px;
		  left: 20px;
		}
		
		@keyframes slideUp {
		  from { 
			opacity: 0; 
			transform: scale(0.95) translateY(10px); 
		  }
		  to { 
			opacity: 1; 
			transform: scale(1) translateY(0); 
		  }
		}
		
		/* Header */
		.aiva-header {
		  background: ${config.primaryColor};
		  color: white;
		  padding: 16px;
		  display: flex;
		  align-items: center;
		  justify-content: space-between;
		  flex-shrink: 0;
		}
		.aiva-header-content {
		  display: flex;
		  align-items: center;
		  gap: 12px;
		  flex: 1;
		  min-width: 0;
		}
		.aiva-avatar {
		  width: 40px;
		  height: 40px;
		  background: rgba(255,255,255,0.2);
		  border-radius: 50%;
		  display: flex;
		  align-items: center;
		  justify-content: center;
		  flex-shrink: 0;
		}
		.aiva-avatar svg {
		  width: 24px;
		  height: 24px;
		}
		.aiva-header-text {
		  flex: 1;
		  min-width: 0;
		}
		.aiva-agent-name {
		  font-weight: 600;
		  font-size: 16px;
		  white-space: nowrap;
		  overflow: hidden;
		  text-overflow: ellipsis;
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
		  flex-shrink: 0;
		  transition: opacity 0.2s;
		}
		.aiva-minimize-button:hover {
		  opacity: 0.8;
		}
		.aiva-minimize-button svg {
		  width: 20px;
		  height: 20px;
		}
		
		/* Messages Container */
		.aiva-messages {
		  flex: 1;
		  overflow-y: auto;
		  padding: 16px;
		  display: flex;
		  flex-direction: column;
		  gap: 12px;
		  background: #f9fafb;
		  -webkit-overflow-scrolling: touch;
		}
		.aiva-messages::-webkit-scrollbar {
		  width: 6px;
		}
		.aiva-messages::-webkit-scrollbar-track {
		  background: transparent;
		}
		.aiva-messages::-webkit-scrollbar-thumb {
		  background: #d1d5db;
		  border-radius: 3px;
		}
		.aiva-messages::-webkit-scrollbar-thumb:hover {
		  background: #9ca3af;
		}
		
		/* Welcome Message */
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
		  line-height: 1.5;
		}
		
		/* Messages */
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
		  word-wrap: break-word;
		  word-break: break-word;
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
		
		/* Typing Indicator */
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
		
		/* Input Container */
		.aiva-input-container {
		  padding: 12px 16px;
		  background: white;
		  border-top: 1px solid #e5e7eb;
		  display: flex;
		  gap: 8px;
		  flex-shrink: 0;
		}
		.aiva-input {
		  flex: 1;
		  padding: 10px 14px;
		  border: 1px solid #e5e7eb;
		  border-radius: 20px;
		  font-size: 14px;
		  outline: none;
		  transition: border-color 0.2s;
		  font-family: inherit;
		  min-width: 0;
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
		  flex-shrink: 0;
		}
		.aiva-send-button:hover {
		  transform: scale(1.1);
		}
		.aiva-send-button:active {
		  transform: scale(0.95);
		}
		.aiva-send-button svg {
		  width: 20px;
		  height: 20px;
		}
		
		/* Footer */
		.aiva-footer {
		  padding: 8px 16px;
		  text-align: center;
		  background: white;
		  border-top: 1px solid #e5e7eb;
		  flex-shrink: 0;
		}
		.aiva-powered {
		  font-size: 11px;
		  color: #9ca3af;
		}
		
		/* Mobile Responsive */
		@media (max-width: 480px) {
		  .aiva-widget {
			bottom: 10px !important;
			right: 10px !important;
			left: 10px !important;
			top: auto !important;
		  }
		  
		  .aiva-chat-button {
			width: 56px;
			height: 56px;
		  }
		  
		  .aiva-chat-window {
			position: fixed !important;
			bottom: 80px !important;
			left: 10px !important;
			right: 10px !important;
			top: 10px !important;
			width: auto !important;
			height: auto !important;
			max-width: none !important;
			max-height: none !important;
		  }
		  
		  .aiva-header {
			padding: 12px;
		  }
		  
		  .aiva-agent-name {
			font-size: 14px;
		  }
		  
		  .aiva-input-container {
			padding: 10px 12px;
		  }
		}
		
		/* Tablet */
		@media (min-width: 481px) and (max-width: 768px) {
		  .aiva-chat-window {
			width: 360px;
			max-width: calc(100vw - 40px);
		  }
		}
		
		/* Small screens in landscape */
		@media (max-height: 600px) and (orientation: landscape) {
		  .aiva-chat-window {
			height: calc(100vh - 100px);
			max-height: calc(100vh - 100px);
		  }
		}
		/* Products */
		.aiva-products {
		  margin-top: 12px;
		  padding-top: 12px;
		  border-top: 1px solid #e5e7eb;
		}
		.aiva-products-header {
		  font-weight: 600;
		  font-size: 12px;
		  color: #6b7280;
		  margin-bottom: 8px;
		}
		.aiva-products-grid {
		  display: grid;
		  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		  gap: 8px;
		}
		.aiva-product-card {
		  background: #f9fafb;
		  border-radius: 8px;
		  padding: 8px;
		  text-align: center;
		  transition: transform 0.2s;
		}
		.aiva-product-card:hover {
		  transform: translateY(-2px);
		  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
		}
		.aiva-product-image {
		  width: 100%;
		  height: 80px;
		  object-fit: cover;
		  border-radius: 6px;
		  margin-bottom: 6px;
		}
		.aiva-product-name {
		  font-weight: 500;
		  font-size: 11px;
		  color: #111827;
		  margin-bottom: 4px;
		  overflow: hidden;
		  text-overflow: ellipsis;
		  display: -webkit-box;
		  -webkit-line-clamp: 2;
		  -webkit-box-orient: vertical;
		}
		.aiva-product-price {
		  font-weight: 600;
		  color: ${config.primaryColor};
		  font-size: 12px;
		  margin-bottom: 6px;
		}
		.aiva-product-link {
		  display: inline-block;
		  background: ${config.primaryColor};
		  color: white;
		  padding: 4px 8px;
		  border-radius: 4px;
		  text-decoration: none;
		  font-size: 10px;
		  transition: background 0.2s;
		}
		.aiva-product-link:hover {
		  opacity: 0.9;
		}

		/* Images */
		.aiva-images {
		  margin-top: 12px;
		  padding-top: 12px;
		  border-top: 1px solid #e5e7eb;
		}
		.aiva-image-item:hover {
		  border-color: ${config.primaryColor} !important;
		  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
		  transform: translateY(-2px);
		}

		.aiva-image-item img {
		  transition: transform 0.2s;
		}

		.aiva-image-item:hover img {
		  transform: scale(1.05);
		}

		.aiva-images-header {
		  font-weight: 600;
		  font-size: 12px;
		  color: #6b7280;
		  margin-bottom: 8px;
		}
		.aiva-images-grid {
		  display: grid;
		  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		  gap: 8px;
		}
		.aiva-image-item {
		  border-radius: 8px;
		  overflow: hidden;
		}
		.aiva-message-image {
		  width: 100%;
		  height: auto;
		  display: block;
		  border-radius: 8px;
		}
		.aiva-image-caption {
		  padding: 6px;
		  font-size: 11px;
		  color: #6b7280;
		  background: #f9fafb;
		}

		/* System messages */
		.aiva-message.system .aiva-message-bubble {
		  background: #fef3c7;
		  color: #92400e;
		  text-align: center;
		  font-size: 13px;
		}
		/* Sources - Enhanced */
		.aiva-sources {
		  margin-top: 12px;
		  padding-top: 12px;
		  border-top: 1px solid #e5e7eb;
		}
		.aiva-sources-header {
		  font-weight: 600;
		  font-size: 12px;
		  color: #6b7280;
		  margin-bottom: 8px;
		}
		.aiva-source-item {
		  background: #f9fafb;
		  border-radius: 6px;
		  padding: 10px;
		  margin-bottom: 6px;
		  font-size: 12px;
		}

		/* Title with badge */
		.aiva-source-title-wrapper {
		  display: flex;
		  align-items: flex-start;
		  gap: 6px;
		  margin-bottom: 6px;
		}
		.aiva-source-badge {
		  flex-shrink: 0;
		  width: 18px;
		  height: 18px;
		  border-radius: 50%;
		  background: #e0e7ff;
		  color: #4f46e5;
		  font-size: 10px;
		  font-weight: 600;
		  display: flex;
		  align-items: center;
		  justify-content: center;
		}
		.aiva-source-title-text {
		  flex: 1;
		  font-weight: 600;
		  color: #111827;
		  line-height: 1.3;
		}

		/* Content */
		.aiva-source-content {
		  color: #6b7280;
		  line-height: 1.4;
		  margin-bottom: 6px;
		}
		.aiva-source-preview,
		.aiva-source-full {
		  white-space: pre-wrap;
		  word-break: break-word;
		}

		/* Metadata */
		.aiva-source-meta {
		  display: flex;
		  gap: 8px;
		  margin-bottom: 6px;
		  font-size: 10px;
		  color: #6b7280;
		}
		.aiva-source-meta span {
		  background: #f3f4f6;
		  padding: 2px 6px;
		  border-radius: 3px;
		}

		/* Toggle button */
		.aiva-source-toggle {
		  background: none;
		  border: none;
		  color: #6366f1;
		  font-size: 11px;
		  font-weight: 500;
		  cursor: pointer;
		  padding: 4px 0;
		  margin-bottom: 6px;
		  display: block;
		}
		.aiva-source-toggle:hover {
		  text-decoration: underline;
		}

		/* Source link wrapper */
		.aiva-source-link-wrapper {
		  padding-top: 6px;
		  border-top: 1px solid #e5e7eb;
		}
		.aiva-source-link {
		  color: #6366f1;
		  text-decoration: none;
		  font-size: 11px;
		  font-weight: 500;
		  display: inline-flex;
		  align-items: center;
		  gap: 4px;
		}
		.aiva-source-link:hover {
		  text-decoration: underline;
		}
		.aiva-source-link svg {
		  flex-shrink: 0;
		}
		
		/* Feedback Prompt */
		.aiva-feedback-prompt {
		  padding: 16px;
		  background: #eff6ff;
		  border-top: 1px solid #bfdbfe;
		  animation: fadeIn 0.3s ease;
		}
		.aiva-feedback-content {
		  text-align: center;
		}
		.aiva-feedback-title {
		  font-weight: 600;
		  font-size: 14px;
		  color: #1f2937;
		  margin-bottom: 4px;
		}
		.aiva-feedback-subtitle {
		  font-size: 12px;
		  color: #6b7280;
		  margin-bottom: 12px;
		}
		.aiva-feedback-buttons {
		  display: flex;
		  gap: 8px;
		  justify-content: center;
		}
		.aiva-feedback-btn {
		  display: flex;
		  align-items: center;
		  gap: 6px;
		  padding: 8px 16px;
		  border: none;
		  border-radius: 8px;
		  font-size: 13px;
		  font-weight: 500;
		  cursor: pointer;
		  transition: all 0.2s;
		  color: white;
		}
		.aiva-feedback-good {
		  background: #10b981;
		}
		.aiva-feedback-good:hover {
		  background: #059669;
		  transform: scale(1.05);
		}
		.aiva-feedback-bad {
		  background: #ef4444;
		}
		.aiva-feedback-bad:hover {
		  background: #dc2626;
		  transform: scale(1.05);
		}
		.aiva-feedback-emoji {
		  font-size: 16px;
		}
		/* Message Feedback */
		.aiva-message-feedback {
		  margin-top: 8px;
		  padding-top: 8px;
		  border-top: 1px solid #e5e7eb;
		  display: flex;
		  align-items: center;
		  gap: 8px;
		  font-size: 11px;
		  color: #6b7280;
		}
		.aiva-message-feedback-btn {
		  background: none;
		  border: none;
		  cursor: pointer;
		  padding: 4px;
		  font-size: 14px;
		  opacity: 0.6;
		  transition: all 0.2s;
		  border-radius: 4px;
		}
		.aiva-message-feedback-btn:hover {
		  opacity: 1;
		  background: #f3f4f6;
		}
		.aiva-message-feedback-btn.selected {
		  opacity: 1;
		  background: #e0e7ff;
		}
	  `;
	  document.head.appendChild(styleSheet);
	  console.log('AIVA Widget: Styles applied');
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
    const chatWindow = document.getElementById('aiva-chat-window');
    const iconChat = document.querySelector('.aiva-icon-chat');
    const iconClose = document.querySelector('.aiva-icon-close');
    
    if (chatWindow) chatWindow.style.display = 'flex';
    if (iconChat) iconChat.style.display = 'none';
    if (iconClose) iconClose.style.display = 'block';
    
    const input = document.getElementById('aiva-input');
    if (input) input.focus();

    // Initialize session if needed
    if (!sessionId) {
      await initSession();
    }

    console.log('AIVA Widget: Chat opened');
  }

  /**
   * Close chat
   */
  function closeChat() {
    isOpen = false;
    const chatWindow = document.getElementById('aiva-chat-window');
    const iconChat = document.querySelector('.aiva-icon-chat');
    const iconClose = document.querySelector('.aiva-icon-close');
    
    if (chatWindow) chatWindow.style.display = 'none';
    if (iconChat) iconChat.style.display = 'block';
    if (iconClose) iconClose.style.display = 'none';

    console.log('AIVA Widget: Chat closed');
  }

  /**
   * Initialize chat session
   */
  async function initSession() {
    try {
      console.log('AIVA Widget: Initializing session...');
      
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
          const agentName = document.querySelector('.aiva-agent-name');
          if (agentName) agentName.textContent = data.data.agent.name;
        }
        if (data.data.agent.greeting) {
          const welcomeText = document.querySelector('.aiva-welcome-text');
          if (welcomeText) welcomeText.textContent = data.data.agent.greeting;
        }
        
        console.log('AIVA Widget: Session initialized:', sessionId);
      } else {
        console.error('AIVA Widget: Init failed:', data.error);
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
		  messages = data.data.messages.map(msg => ({
			role: msg.role,
			content: msg.content,
			html: msg.content_html,
			sources: msg.sources || [],
			images: msg.images || [],
			products: msg.products || [],
			isHtml: true // Mark as HTML for rendering
		  }));
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
    const message = input ? input.value.trim() : '';

    if (!message) return;

    // Clear input
    if (input) input.value = '';

    // Add user message to UI
    addMessage('user', message);

    // Show typing indicator
    const typing = document.getElementById('aiva-typing');
    if (typing) typing.style.display = 'block';
    scrollToBottom();

    try {
      const response = await fetch(`${config.apiUrl}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          agent_id: config.agentId,
          message: message
        })
      });

      const data = await response.json();

      // Hide typing indicator
      if (typing) typing.style.display = 'none';

      if (data.success) {
		  // Update session ID if new session was created
		  if (data.data.new_session_created) {
			sessionId = data.data.session_id;
			localStorage.setItem('aiva_session_' + config.agentId, sessionId);
		  }
		  
		  // Build rich message content
		  const responseText = data.data.formatted_html || data.data.response.html || data.data.response.text || data.data.response;
		  const sources = formatSources(data.data.sources);
		  const products = formatProducts(data.data.products);
		  const images = formatImages(data.data.images);
		  
		  const fullContent = responseText + sources + products + images;
		  
		  addMessage('bot', fullContent, true, data.data.message_id); // Pass true for rich HTML content
		  
		  // Handle agent transfer
		  if (data.data.agent_transfer) {
			setTimeout(() => {
			  addMessage('system', '🤝 Connecting you to a human agent...');
			}, 1000);
		  }
		  
		  if (data.data.show_feedback_prompt && !feedbackSubmitted) {
			showFeedbackPrompt = true;
			renderFeedbackPrompt();
		  }
	  }
    } catch (error) {
      if (typing) typing.style.display = 'none';
      addMessage('bot', 'Sorry, I could not connect to the server. Please try again later.');
      console.error('AIVA Widget: Send message failed', error);
    }
  }

  /**
   * Add message to UI
   */
  function addMessage(role, content, isHtml = false, messageId = null) {
    messages.push({ role, content, isHtml, id: messageId || Date.now().toString()});
    renderMessages();
  }

  /**
   * Render all messages
   */
  function renderMessages() {
    const container = document.getElementById('aiva-messages');
    if (!container) return;
    
    // Keep welcome message if no messages
    if (messages.length === 0) return;

    // Clear and re-render
    container.innerHTML = '';
    
    messages.forEach((msg, index) => {
	  const messageDiv = document.createElement('div');
	  messageDiv.className = `aiva-message ${msg.role}`;
	  
	  // Use HTML directly if it's rich content, otherwise escape
	  const content = msg.isHtml ? msg.content : escapeHtml(msg.content);
	  
	  // ✅ ADD MESSAGE FEEDBACK for assistant messages
	  const messageFeedback = msg.role === 'assistant' && msg.id ? `
		<div class="aiva-message-feedback">
		  <span>Was this helpful?</span>
		  <button 
			class="aiva-message-feedback-btn" 
			onclick="window.aivaSubmitMessageFeedback('${msg.id}', 'useful')"
			title="Helpful"
		  >
			👍
		  </button>
		  <button 
			class="aiva-message-feedback-btn" 
			onclick="window.aivaSubmitMessageFeedback('${msg.id}', 'not_useful')"
			title="Not helpful"
		  >
			👎
		  </button>
		</div>
	  ` : '';
	  
	  messageDiv.innerHTML = `
		<div class="aiva-message-bubble">
		  ${content}
		  ${messageFeedback}
		</div>
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
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  /**
   * Submit feedback
   */
  window.aivaSubmitFeedback = async function(rating) {
    try {
      const response = await fetch(`${config.apiUrl.replace('/message', '')}/feedback/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          rating: rating
        })
      });

      const data = await response.json();

      if (data.success) {
        feedbackSubmitted = true;
        showFeedbackPrompt = false;
        
        // Remove feedback prompt
        const feedbackElement = document.getElementById('aiva-feedback-prompt');
        if (feedbackElement) {
          feedbackElement.remove();
        }
        
        // Show thank you message
        addMessage('system', '✅ Thank you for your feedback!');
      }
    } catch (error) {
      console.error('AIVA Widget: Submit feedback failed', error);
    }
  };
  
  /**
   * Submit message feedback
   */
  window.aivaSubmitMessageFeedback = async function(messageId, rating) {
    try {
      const response = await fetch(`${config.apiUrl.replace('/message', '')}/feedback/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: messageId,
          rating: rating
        })
      });

      const data = await response.json();

      if (data.success) {
        console.log('✅ Message feedback submitted');
        // Optional: Add visual feedback (button highlight, etc.)
      }
    } catch (error) {
      console.error('AIVA Widget: Submit message feedback failed', error);
    }
  };
  
  /**
   * Render feedback prompt
   */
  function renderFeedbackPrompt() {
    const container = document.getElementById('aiva-messages');
    if (!container) return;
    
    // Check if feedback prompt already exists
    if (document.getElementById('aiva-feedback-prompt')) return;
    
    const feedbackDiv = document.createElement('div');
    feedbackDiv.id = 'aiva-feedback-prompt';
    feedbackDiv.className = 'aiva-feedback-prompt';
    feedbackDiv.innerHTML = `
      <div class="aiva-feedback-content">
        <div class="aiva-feedback-title">How was your experience?</div>
        <div class="aiva-feedback-subtitle">Your feedback helps us improve</div>
        <div class="aiva-feedback-buttons">
          <button class="aiva-feedback-btn aiva-feedback-good" onclick="window.aivaSubmitFeedback('good')">
            <span class="aiva-feedback-emoji">👍</span>
            <span>Good</span>
          </button>
          <button class="aiva-feedback-btn aiva-feedback-bad" onclick="window.aivaSubmitFeedback('bad')">
            <span class="aiva-feedback-emoji">👎</span>
            <span>Bad</span>
          </button>
        </div>
      </div>
    `;
    container.appendChild(feedbackDiv);
    scrollToBottom();
  }
  
  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  console.log('AIVA Widget: Script executing...');

  // Save any queued calls BEFORE we overwrite window.aiva
  let queuedCalls = [];
  if (typeof window.aiva === 'function' && window.aiva.q) {
    queuedCalls = window.aiva.q.slice(); // Copy the queue
    console.log('AIVA Widget: Found', queuedCalls.length, 'queued calls');
  }

  // Define the aiva function
  window.aiva = function(command, options) {
    console.log('AIVA Widget: Received command:', command);
    if (command === 'init') {
      console.log('AIVA Widget: Init called with options:', options);
      init(options);
    }
  };

  // Preserve the queue for any future calls
  window.aiva.q = [];

  // Process queued calls
  console.log('AIVA Widget: Processing queued calls...');
  queuedCalls.forEach(function(args) {
    console.log('AIVA Widget: Processing queued call:', args);
    if (args && args.length > 0) {
      window.aiva(args[0], args[1]);
    }
  });

  console.log('AIVA Widget: Initialization complete');
})();