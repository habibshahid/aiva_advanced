/**
 * Scrape Sources Routes
 * Manages web scraping sources and sync settings
 */

const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const ScrapeSourceService = require('../services/ScrapeSourceService');

/**
 * @route GET /api/knowledge/:kbId/scrape-sources
 * @desc Get all scrape sources for a knowledge base
 */
router.get('/:kbId/scrape-sources', verifyToken, async (req, res) => {
  try {
    const { kbId } = req.params;
    const tenantId = req.user.tenant_id || req.user.id;

    const sources = await ScrapeSourceService.getSources(kbId, tenantId);

    res.json({ success: true, data: { sources } });
  } catch (error) {
    console.error('Get scrape sources error:', error);
    res.status(500).json({ success: false, error: 'Failed to get scrape sources' });
  }
});

/**
 * @route PATCH /api/knowledge/scrape-sources/:sourceId
 * @desc Update scrape source settings (auto-save)
 */
router.patch('/scrape-sources/:sourceId', verifyToken, async (req, res) => {
  try {
    const { sourceId } = req.params;
    const updates = req.body;

    const source = await ScrapeSourceService.updateSource(sourceId, updates);

    res.json({ success: true, data: { source } });
  } catch (error) {
    console.error('Update scrape source error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to update source' });
  }
});

/**
 * @route DELETE /api/knowledge/scrape-sources/:sourceId
 * @desc Delete a scrape source
 */
router.delete('/scrape-sources/:sourceId', verifyToken, async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { delete_documents = false } = req.query;

    const result = await ScrapeSourceService.deleteSource(
      sourceId, 
      delete_documents === 'true'
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Delete scrape source error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete source' });
  }
});

/**
 * @route POST /api/knowledge/scrape-sources/:sourceId/sync
 * @desc Manually trigger re-sync for a source
 */
router.post('/scrape-sources/:sourceId/sync', verifyToken, async (req, res) => {
  try {
    const { sourceId } = req.params;

    const result = await ScrapeSourceService.syncSource(sourceId);

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Sync source error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to sync source' });
  }
});

module.exports = router;