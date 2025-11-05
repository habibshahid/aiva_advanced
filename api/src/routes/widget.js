/**
 * Widget Distribution Route
 * Serves the widget JavaScript file
 */

const express = require('express');
const path = require('path');
const router = express.Router();

/**
 * @route GET /widget.js
 * @desc Serve widget JavaScript
 * @access Public
 */
router.get('/widget.js', (req, res) => {
  res.set('Content-Type', 'application/javascript');
  res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.sendFile(path.join(__dirname, '../../public/widget.js'));
});

module.exports = router;