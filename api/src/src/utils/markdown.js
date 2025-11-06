/**
 * Markdown Utility
 * Convert between markdown, HTML, and plain text for chat responses
 */
require('dotenv').config();
/**
 * Convert markdown to HTML
 * Supports: bold, italic, links, lists, code blocks, headers, blockquotes
 * @param {string} markdown - Markdown text
 * @returns {string} HTML text
 */
 
function markdownToHtml(markdown) {
  if (!markdown) return '';

  let html = markdown;

  // Escape HTML entities first
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headers (must come before other conversions)
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Inline code
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, lang, code) {
    const language = lang || 'plaintext';
    return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
  });

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gim, '<blockquote>$1</blockquote>');

  // Horizontal rule
  html = html.replace(/^---$/gim, '<hr>');
  html = html.replace(/^\*\*\*$/gim, '<hr>');

  // Unordered lists
  html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<')) {
    html = `<p>${html}</p>`;
  }

  return html;
}

/**
 * Convert HTML to plain text
 * @param {string} html - HTML text
 * @returns {string} Plain text
 */
function htmlToText(html) {
  if (!html) return '';

  let text = html;

  // Remove script and style tags
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Replace common block elements with newlines
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr)\b[^>]*>/gi, '\n');

  // Replace list items
  text = text.replace(/<li\b[^>]*>/gi, '• ');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Remove extra whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Convert markdown to plain text (via HTML)
 * @param {string} markdown - Markdown text
 * @returns {string} Plain text
 */
function markdownToText(markdown) {
  const html = markdownToHtml(markdown);
  return htmlToText(html);
}

/**
 * Sanitize HTML for safe display
 * Removes potentially dangerous tags and attributes
 * @param {string} html - HTML text
 * @returns {string} Sanitized HTML
 */
function sanitizeHtml(html) {
  if (!html) return '';

  let sanitized = html;

  // Remove script tags
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*"[^"]*"/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*'[^']*'/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');

  // Remove style tags
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove iframe, object, embed tags
  sanitized = sanitized.replace(/<(iframe|object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');

  return sanitized;
}

/**
 * Format response with all three formats
 * @param {string} text - Original text (markdown or plain text)
 * @returns {Object} Object with text, html, and markdown
 */
function formatResponse(text) {
  if (!text) {
    return {
      text: '',
      html: '',
      markdown: ''
    };
  }

  // Detect if input is markdown (has markdown syntax)
  const hasMarkdown = /[*_`#\[\]]/g.test(text);

  if (hasMarkdown) {
    return {
      text: markdownToText(text),
      html: sanitizeHtml(markdownToHtml(text)),
      markdown: text
    };
  } else {
    // Plain text input
    return {
      text: text,
      html: sanitizeHtml(text.replace(/\n/g, '<br>')),
      markdown: text
    };
  }
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength = 100, suffix = '...') {
  if (!text || text.length <= maxLength) return text;

  const truncated = text.substr(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');

  // Try to break at word boundary
  if (lastSpace > maxLength * 0.8) {
    return truncated.substr(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

/**
 * Extract plain text from markdown (for search/indexing)
 * Removes all markdown syntax
 * @param {string} markdown - Markdown text
 * @returns {string} Plain text without markdown syntax
 */
function stripMarkdown(markdown) {
  if (!markdown) return '';

  let text = markdown;

  // Remove code blocks
  text = text.replace(/```[\s\S]*?```/g, '');

  // Remove inline code
  text = text.replace(/`[^`]+`/g, '');

  // Remove images
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Remove links but keep text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove headers
  text = text.replace(/^#+\s+/gm, '');

  // Remove bold/italic
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');

  // Remove strikethrough
  text = text.replace(/~~(.*?)~~/g, '$1');

  // Remove blockquotes
  text = text.replace(/^>\s+/gm, '');

  // Remove list markers
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Remove horizontal rules
  text = text.replace(/^(-{3,}|\*{3,})$/gm, '');

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  return text;
}

/**
 * Highlight search terms in text
 * @param {string} text - Text to highlight
 * @param {string} searchTerm - Term to highlight
 * @param {string} highlightClass - CSS class for highlight (default: 'highlight')
 * @returns {string} Text with highlighted terms
 */
function highlightSearchTerms(text, searchTerm, highlightClass = 'highlight') {
  if (!text || !searchTerm) return text;

  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, `<span class="${highlightClass}">$1</span>`);
}

/**
 * Format code block with syntax highlighting class
 * @param {string} code - Code to format
 * @param {string} language - Programming language
 * @returns {string} Formatted code block
 */
function formatCodeBlock(code, language = 'plaintext') {
  if (!code) return '';

  return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
}

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * Unescape HTML entities
 * @param {string} text - Text to unescape
 * @returns {string} Unescaped text
 */
function unescapeHtml(text) {
  if (!text) return '';

  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };

  return text.replace(/&(amp|lt|gt|quot|#39);/g, entity => map[entity]);
}

/**
 * Convert line breaks to <br> tags
 * @param {string} text - Text with line breaks
 * @returns {string} Text with <br> tags
 */
function nl2br(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>');
}

/**
 * Convert <br> tags to line breaks
 * @param {string} html - HTML with <br> tags
 * @returns {string} Text with line breaks
 */
function br2nl(html) {
  if (!html) return '';
  return html.replace(/<br\s*\/?>/gi, '\n');
}

/**
 * Extract URLs from text
 * @param {string} text - Text containing URLs
 * @returns {Array<string>} Array of URLs
 */
function extractUrls(text) {
  if (!text) return [];

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);

  return matches || [];
}

/**
 * Convert URLs in text to clickable links
 * @param {string} text - Text containing URLs
 * @returns {string} Text with clickable links
 */
function linkifyUrls(text) {
  if (!text) return '';

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

module.exports = {
  // Main conversion functions
  markdownToHtml,
  htmlToText,
  markdownToText,
  formatResponse,

  // Utility functions
  sanitizeHtml,
  truncateText,
  stripMarkdown,
  highlightSearchTerms,
  formatCodeBlock,

  // HTML utilities
  escapeHtml,
  unescapeHtml,
  nl2br,
  br2nl,

  // URL utilities
  extractUrls,
  linkifyUrls
};