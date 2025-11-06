/**
 * Widget Distribution Route
 * Serves the widget JavaScript file with proper CORS headers
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

/**
 * @route GET /widget.js
 * @desc Serve widget JavaScript with CORS headers
 * @access Public
 */
router.get('/widget.js', (req, res) => {
  try {
    const widgetPath = path.join(__dirname, '../../public/widget.js');
    
    // Check if file exists
    if (!fs.existsSync(widgetPath)) {
      return res.status(404).send('// Widget not found');
    }
    
    // Read file
    const widgetCode = fs.readFileSync(widgetPath, 'utf8');
    
    // Set proper headers for cross-origin loading
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cross-Origin-Resource-Policy': 'cross-origin', // ✅ CRITICAL
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Timing-Allow-Origin': '*'
    });
    
    res.send(widgetCode);
    
  } catch (error) {
    console.error('Widget serve error:', error);
    res.status(500).set('Content-Type', 'application/javascript').send('// Error loading widget');
  }
});

/**
 * Handle OPTIONS preflight requests
 */
router.options('/widget.js', (req, res) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Max-Age': '86400'
  });
  res.sendStatus(204);
});

module.exports = router;