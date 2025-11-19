/**
 * Knowledge Search Response Formatter
 * Formats search results with proper HTML including images
 */

const markdown = require('./markdown');

/**
 * Format knowledge search results into HTML with embedded images
 * @param {Object} searchResults - Raw search results from Python service
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted response with HTML, text, and markdown
 */
function formatKnowledgeResponse(searchResults, options = {}) {
  const {
    includeImages = true,
    imagePosition = 'inline', // 'inline', 'gallery', 'sidebar'
    maxImages = 10,
    imageSize = 'medium', // 'small', 'medium', 'large'
    includeMetadata = true,
    baseUrl = process.env.API_BASE_URL || ''
  } = options;

  const textResults = searchResults.text_results || [];
  const imageResults = searchResults.image_results || [];
  const productResults = searchResults.product_results || [];

console.log('************************************')
console.log('🔍 Formatting knowledge response...');
console.log('📄 Text results:', textResults.map(r => ({
  doc: r.source?.document_name,
  page: r.source?.page || r.source?.metadata?.page_number,
  docId: r.source?.document_id
})));
console.log('🖼️  Image results:', imageResults.map(img => ({
  page: img.page_number || img.metadata?.page_number,
  docId: img.metadata?.document_id,
  source: img.source_document
})));
console.log('************************************')

  let htmlContent = '';
  let markdownContent = '';
  let plainText = '';

  // ============================================
  // GROUP IMAGES BY DOCUMENT + PAGE
  // ============================================
  const imagesByPage = {};
  if (includeImages && imageResults.length > 0) {
    imageResults.forEach(img => {
      const docId = img.metadata?.document_id || 'unknown';
      const page = img.page_number || img.metadata?.page_number || 0;
      const key = `${docId}_page${page}`;
      
      if (!imagesByPage[key]) {
        imagesByPage[key] = [];
      }
      imagesByPage[key].push(img);
    });
  }

  // ============================================
  // FORMAT TEXT RESULTS WITH INLINE IMAGES
  // ============================================
  if (textResults.length > 0) {
    htmlContent += '<div class="knowledge-text-results">\n';
    markdownContent += '## Search Results\n\n';
    plainText += 'Search Results:\n\n';

    textResults.forEach((result, index) => {
	  const relevancePercentage = Math.round(result.score * 100);
	  const docName = result.source?.document_name || 'Unknown Document';
	  const docId = result.source?.document_id;
	  
	  // ✅ EXTRACT PAGE NUMBER FROM CONTENT (e.g., "[Page 8]")
	  let pageNum = result.source?.metadata?.page_number || result.source?.page;
	  if (!pageNum && result.content) {
		const pageMatch = result.content.match(/\[Page (\d+)\]/);
		if (pageMatch) {
		  pageNum = parseInt(pageMatch[1], 10);
		}
	  }
	  
      // ============================================
      // HTML FORMAT
      // ============================================
      htmlContent += `<div class="text-result" data-relevance="${relevancePercentage}">\n`;
      htmlContent += `  <div class="result-header">\n`;
      htmlContent += `    <span class="result-number">${index + 1}.</span>\n`;
      htmlContent += `    <span class="document-name">${escapeHtml(docName)}</span>\n`;
      if (pageNum) {
        htmlContent += `    <span class="page-number">Page ${pageNum}</span>\n`;
      }
      htmlContent += `    <span class="relevance-score">${relevancePercentage}% relevant</span>\n`;
      htmlContent += `  </div>\n`;
      
      // Format content
      const formatted = markdown.formatResponse(result.content);
      htmlContent += `  <div class="result-content">\n${formatted.html}\n  </div>\n`;
      
      // ✅ INSERT IMAGES FROM THIS PAGE (INLINE)
      if (includeImages && docId && pageNum) {
        const pageKey = `${docId}_page${pageNum}`;
        const pageImages = imagesByPage[pageKey];
        
        if (pageImages && pageImages.length > 0) {
          htmlContent += `  <div class="inline-page-images" style="margin-top: 15px; padding: 10px; background: #f8fafc; border-left: 3px solid #3b82f6; border-radius: 4px;">\n`;
          htmlContent += `    <p style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #475569;">📷 Images from Page ${pageNum}:</p>\n`;
          htmlContent += `    <div style="display: flex; gap: 10px; flex-wrap: wrap;">\n`;
          
          const maxImagesPerChunk = 4;
          pageImages.slice(0, maxImagesPerChunk).forEach(img => {
            const imageUrl = getFullImageUrl(img.url, baseUrl);
            htmlContent += `      <a href="${imageUrl}" target="_blank" style="display: block;">\n`;
            htmlContent += `        <img src="${imageUrl}" alt="Page ${pageNum}" loading="lazy" style="max-width: 250px; max-height: 180px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; object-fit: contain;" />\n`;
            htmlContent += `      </a>\n`;
          });
          
          htmlContent += `    </div>\n`;
          htmlContent += `  </div>\n`;
        }
      }
      
      htmlContent += `</div>\n\n`;

      // ============================================
      // MARKDOWN FORMAT
      // ============================================
      markdownContent += `### ${index + 1}. ${docName}`;
      if (pageNum) markdownContent += ` (Page ${pageNum})`;
      markdownContent += `\n**Relevance:** ${relevancePercentage}%\n\n`;
      markdownContent += `${result.content}\n\n`;
      
      // ✅ INSERT IMAGES FROM THIS PAGE (MARKDOWN)
      if (includeImages && docId && pageNum) {
        const pageKey = `${docId}_page${pageNum}`;
        const pageImages = imagesByPage[pageKey];
        
        if (pageImages && pageImages.length > 0) {
          markdownContent += `**Images from Page ${pageNum}:**\n\n`;
          pageImages.slice(0, 4).forEach(img => {
            const imageUrl = getFullImageUrl(img.url, baseUrl);
            markdownContent += `![Image from page ${pageNum}](${imageUrl})\n\n`;
          });
        }
      }
      
      markdownContent += `---\n\n`;

      // ============================================
      // PLAIN TEXT FORMAT
      // ============================================
      plainText += `${index + 1}. ${docName}`;
      if (pageNum) plainText += ` (Page ${pageNum})`;
      plainText += ` - ${relevancePercentage}% relevant\n`;
      plainText += `${markdown.markdownToText(result.content)}\n`;
      
      // ✅ INSERT IMAGE REFERENCES (PLAIN TEXT)
      if (includeImages && docId && pageNum) {
        const pageKey = `${docId}_page${pageNum}`;
        const pageImages = imagesByPage[pageKey];
        
        if (pageImages && pageImages.length > 0) {
          plainText += `\n[${pageImages.length} image(s) from page ${pageNum}]\n`;
        }
      }
      
      plainText += `\n`;
    });

    htmlContent += '</div>\n\n';
  }

  // ============================================
  // FORMAT PRODUCT RESULTS
  // ============================================
  if (productResults.length > 0) {
    htmlContent += formatProductResults(productResults, baseUrl);
    markdownContent += formatProductMarkdown(productResults);
    plainText += formatProductPlainText(productResults);
  }

  return {
    html: htmlContent,
    markdown: markdownContent,
    text: plainText,
    hasImages: imageResults.length > 0,
    hasProducts: productResults.length > 0,
    stats: {
      textResults: textResults.length,
      imageResults: imageResults.length,
      productResults: productResults.length
    }
  };
}

/**
 * Format images as a gallery
 */
function formatImageGallery(images, size, baseUrl) {
  const sizeClass = {
    small: 'w-32 h-32',
    medium: 'w-48 h-48',
    large: 'w-64 h-64'
  }[size] || 'w-48 h-48';

  let html = '<div class="image-gallery">\n';
  html += '  <h3 class="gallery-title">Related Images</h3>\n';
  html += '  <div class="gallery-grid">\n';

  images.forEach((img, index) => {
    const imageUrl = getFullImageUrl(img.url, baseUrl);
    const thumbnailUrl = getFullImageUrl(img.thumbnail_url || img.url, baseUrl);
    const title = img.title || img.description || `Image ${index + 1}`;
    const pageNum = img.page_number || img.metadata?.page_number;
    const relevance = img.similarity_score ? Math.round(img.similarity_score * 100) : null;

    html += `    <div class="gallery-item" data-image-id="${img.image_id}">\n`;
    html += `      <div class="image-wrapper ${sizeClass}">\n`;
    html += `        <img src="${thumbnailUrl}" \n`;
    html += `             alt="${escapeHtml(title)}" \n`;
    html += `             loading="lazy" \n`;
    html += `             onclick="window.open('${imageUrl}', '_blank')" \n`;
    html += `             style="cursor: pointer; object-fit: cover; width: 100%; height: 100%;" />\n`;
    html += `      </div>\n`;
    html += `      <div class="image-info">\n`;
    html += `        <p class="image-title">${escapeHtml(title)}</p>\n`;
    if (pageNum) {
      html += `        <p class="image-page">Page ${pageNum}</p>\n`;
    }
    if (relevance) {
      html += `        <p class="image-relevance">${relevance}% match</p>\n`;
    }
    html += `      </div>\n`;
    html += `    </div>\n`;
  });

  html += '  </div>\n';
  html += '</div>\n\n';

  return html;
}

/**
 * Format images inline with text
 */
function formatImagesInline(images, size, baseUrl) {
  const sizeStyle = {
    small: 'max-width: 200px; max-height: 150px;',
    medium: 'max-width: 400px; max-height: 300px;',
    large: 'max-width: 600px; max-height: 450px;'
  }[size] || 'max-width: 400px; max-height: 300px;';

  let html = '<div class="inline-images">\n';
  html += '  <h3>Related Images from Documents</h3>\n';

  images.forEach((img, index) => {
    const imageUrl = getFullImageUrl(img.url, baseUrl);
    const thumbnailUrl = getFullImageUrl(img.thumbnail_url || img.url, baseUrl);
    const title = img.title || img.description || `Image ${index + 1}`;
    const pageNum = img.page_number || img.metadata?.page_number;
    const sourceDoc = img.source_document || img.metadata?.document_name;
    const relevance = img.similarity_score ? Math.round(img.similarity_score * 100) : null;

    html += `  <div class="inline-image-item" style="margin: 20px 0; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px;">\n`;
    html += `    <div style="display: flex; align-items: flex-start; gap: 15px;">\n`;
    html += `      <div style="flex-shrink: 0;">\n`;
    html += `        <a href="${imageUrl}" target="_blank">\n`;
    html += `          <img src="${thumbnailUrl}" \n`;
    html += `               alt="${escapeHtml(title)}" \n`;
    html += `               loading="lazy" \n`;
    html += `               style="${sizeStyle} border-radius: 4px; cursor: pointer; object-fit: contain;" />\n`;
    html += `        </a>\n`;
    html += `      </div>\n`;
    html += `      <div style="flex: 1;">\n`;
    html += `        <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;">${escapeHtml(title)}</h4>\n`;
    
    if (sourceDoc) {
      html += `        <p style="margin: 4px 0; font-size: 14px; color: #6b7280;"><strong>Source:</strong> ${escapeHtml(sourceDoc)}</p>\n`;
    }
    if (pageNum) {
      html += `        <p style="margin: 4px 0; font-size: 14px; color: #6b7280;"><strong>Page:</strong> ${pageNum}</p>\n`;
    }
    if (relevance) {
      html += `        <p style="margin: 4px 0; font-size: 14px; color: #10b981;"><strong>Relevance:</strong> ${relevance}%</p>\n`;
    }
    if (img.width && img.height) {
      html += `        <p style="margin: 4px 0; font-size: 12px; color: #9ca3af;">Dimensions: ${img.width} × ${img.height}px</p>\n`;
    }
    html += `      </div>\n`;
    html += `    </div>\n`;
    html += `  </div>\n`;
  });

  html += '</div>\n\n';

  return html;
}

/**
 * Format images for markdown
 */
function formatImageMarkdown(images, baseUrl) {
  let md = '## Related Images\n\n';

  images.forEach((img, index) => {
    const imageUrl = getFullImageUrl(img.url, baseUrl);
    const title = img.title || img.description || `Image ${index + 1}`;
    const pageNum = img.page_number || img.metadata?.page_number;
    const relevance = img.similarity_score ? Math.round(img.similarity_score * 100) : null;

    md += `### ${index + 1}. ${title}\n`;
    md += `![${title}](${imageUrl})\n`;
    if (pageNum) md += `- **Page:** ${pageNum}\n`;
    if (relevance) md += `- **Relevance:** ${relevance}%\n`;
    if (img.source_document) md += `- **Source:** ${img.source_document}\n`;
    md += '\n';
  });

  return md;
}

/**
 * Format images for plain text
 */
function formatImagePlainText(images) {
  let text = '\nRelated Images:\n\n';

  images.forEach((img, index) => {
    const title = img.title || img.description || `Image ${index + 1}`;
    const pageNum = img.page_number || img.metadata?.page_number;
    const relevance = img.similarity_score ? Math.round(img.similarity_score * 100) : null;

    text += `${index + 1}. ${title}\n`;
    if (pageNum) text += `   Page: ${pageNum}\n`;
    if (relevance) text += `   Relevance: ${relevance}%\n`;
    if (img.source_document) text += `   Source: ${img.source_document}\n`;
    text += '\n';
  });

  return text;
}

/**
 * Format product results
 */
function formatProductResults(products, baseUrl) {
  let html = '<div class="product-results">\n';
  html += '  <h3>Related Products</h3>\n';
  html += '  <div class="product-grid">\n';

  products.forEach((product) => {
    html += `    <div class="product-item">\n`;
    if (product.image_url) {
      html += `      <img src="${product.image_url}" alt="${escapeHtml(product.name)}" />\n`;
    }
    html += `      <h4>${escapeHtml(product.name)}</h4>\n`;
    if (product.description) {
      html += `      <p>${escapeHtml(product.description)}</p>\n`;
    }
    if (product.price) {
      html += `      <p class="price">$${product.price}</p>\n`;
    }
    html += `    </div>\n`;
  });

  html += '  </div>\n';
  html += '</div>\n\n';

  return html;
}

/**
 * Format products for markdown
 */
function formatProductMarkdown(products) {
  let md = '## Related Products\n\n';

  products.forEach((product, index) => {
    md += `### ${index + 1}. ${product.name}\n`;
    if (product.description) md += `${product.description}\n`;
    if (product.price) md += `**Price:** $${product.price}\n`;
    md += '\n';
  });

  return md;
}

/**
 * Format products for plain text
 */
function formatProductPlainText(products) {
  let text = '\nRelated Products:\n\n';

  products.forEach((product, index) => {
    text += `${index + 1}. ${product.name}\n`;
    if (product.description) text += `   ${product.description}\n`;
    if (product.price) text += `   Price: $${product.price}\n`;
    text += '\n';
  });

  return text;
}

/**
 * Get full image URL
 */
function getFullImageUrl(url, baseUrl) {
  if (!url) return '';
  
  // If URL is already absolute, return it
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // If it's a relative URL, prepend baseUrl
  if (url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }
  
  return `${baseUrl}/${url}`;
}

/**
 * Escape HTML special characters
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
  
  return String(text).replace(/[&<>"']/g, char => map[char]);
}

module.exports = {
  formatKnowledgeResponse,
  formatImageGallery,
  formatImagesInline,
  getFullImageUrl
};