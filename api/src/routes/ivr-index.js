/**
 * IVR Routes Index
 * Registers all IVR-related routes
 * 
 * Add to your main app.js or routes/index.js:
 * const ivrRoutes = require('./routes/ivr');
 * app.use('/api', ivrRoutes);
 */

const express = require('express');
const router = express.Router();

// Import route modules
const flowRoutes = require('./flows');
const segmentRoutes = require('./segments');
const templateRoutes = require('./templates');
const languageRoutes = require('./languages');
const internalRoutes = require('./internal');

// Register routes
router.use('/flows', flowRoutes);
router.use('/segments', segmentRoutes);
router.use('/templates', templateRoutes);
router.use('/languages', languageRoutes);
router.use('/internal', internalRoutes);

module.exports = router;
