/**
 * Scrape Source Service
 * Manages web scrape sources and their sync settings
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const axios = require('axios');

class ScrapeSourceService {
  
  /**
   * Get all scrape sources for a knowledge base
   */
  async getSources(kbId, tenantId) {
    const [sources] = await db.query(`
      SELECT 
        ss.*,
        (SELECT COUNT(*) FROM yovo_tbl_aiva_documents d 
         WHERE d.scrape_source_id = ss.id) as documents_count
      FROM yovo_tbl_aiva_scrape_sources ss
      WHERE ss.kb_id = ? AND ss.tenant_id = ?
      ORDER BY ss.created_at DESC
    `, [kbId, tenantId]);
    
    return sources;
  }

  /**
   * Get a single scrape source by ID
   */
  async getSource(sourceId) {
    const [sources] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE id = ?',
      [sourceId]
    );
    return sources[0] || null;
  }

  /**
   * Get scrape source by URL and KB
   */
  async getSourceByUrl(kbId, url) {
    const [sources] = await db.query(
      'SELECT * FROM yovo_tbl_aiva_scrape_sources WHERE kb_id = ? AND url = ?',
      [kbId, url]
    );
    return sources[0] || null;
  }

  /**
   * Create or update scrape source and trigger scraping
   */
  async scrapeUrl({ kbId, tenantId, url, maxDepth = 2, maxPages = 20, autoSyncEnabled = false, syncIntervalHours = 24 }) {
    // Check if source already exists
    let source = await this.getSourceByUrl(kbId, url);
    const sourceId = source?.id || uuidv4();
    const now = new Date();
    const nextSyncAt = autoSyncEnabled 
      ? new Date(now.getTime() + syncIntervalHours * 60 * 60 * 1000)
      : null;

    if (source) {
      // Update existing source
      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          max_depth = ?,
          max_pages = ?,
          auto_sync_enabled = ?,
          sync_interval_hours = ?,
          next_sync_at = ?,
          sync_status = 'syncing',
          updated_at = NOW()
        WHERE id = ?
      `, [maxDepth, maxPages, autoSyncEnabled, syncIntervalHours, nextSyncAt, sourceId]);
    } else {
      // Create new source
      await db.query(`
        INSERT INTO yovo_tbl_aiva_scrape_sources 
        (id, kb_id, tenant_id, url, scrape_type, max_depth, max_pages, 
         auto_sync_enabled, sync_interval_hours, next_sync_at, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'crawl', ?, ?, ?, ?, ?, 'syncing', NOW(), NOW())
      `, [sourceId, kbId, tenantId, url, maxDepth, maxPages, autoSyncEnabled, syncIntervalHours, nextSyncAt]);
    }

    // Call Python service to scrape
    try {
      const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:62002';
      const response = await axios.post(`${pythonUrl}/api/documents/scrape-url`, {
        kb_id: kbId,
        tenant_id: tenantId,
        url: url,
        max_depth: maxDepth,
        max_pages: maxPages,
        metadata: {
          scrape_source_id: sourceId,
          source_type: 'web_scrape'
        }
      }, {
        timeout: 300000 // 5 minutes timeout for scraping
      });

      const result = response.data;

      // Update source with results
      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          documents_count = ?,
          last_sync_at = NOW(),
          sync_status = 'idle',
          last_error = NULL,
          updated_at = NOW()
        WHERE id = ?
      `, [result.documents_processed || 0, sourceId]);

      // Link documents to this source
      if (result.documents && result.documents.length > 0) {
        const docIds = result.documents.map(d => d.document_id);
        await db.query(`
          UPDATE yovo_tbl_aiva_documents 
          SET scrape_source_id = ?
          WHERE id IN (?) AND kb_id = ?
        `, [sourceId, docIds, kbId]);
      }

      return {
        source_id: sourceId,
        ...result
      };

    } catch (error) {
      // Update source with error
      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          sync_status = 'error',
          last_error = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [error.message || 'Scraping failed', sourceId]);

      throw error;
    }
  }

  /**
   * Scrape from sitemap
   */
  async scrapeSitemap({ kbId, tenantId, sitemapUrl, maxPages = 20, autoSyncEnabled = false, syncIntervalHours = 24 }) {
    let source = await this.getSourceByUrl(kbId, sitemapUrl);
    const sourceId = source?.id || uuidv4();
    const now = new Date();
    const nextSyncAt = autoSyncEnabled 
      ? new Date(now.getTime() + syncIntervalHours * 60 * 60 * 1000)
      : null;

    if (source) {
      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          max_pages = ?,
          auto_sync_enabled = ?,
          sync_interval_hours = ?,
          next_sync_at = ?,
          sync_status = 'syncing',
          updated_at = NOW()
        WHERE id = ?
      `, [maxPages, autoSyncEnabled, syncIntervalHours, nextSyncAt, sourceId]);
    } else {
      await db.query(`
        INSERT INTO yovo_tbl_aiva_scrape_sources 
        (id, kb_id, tenant_id, url, scrape_type, max_depth, max_pages, 
         auto_sync_enabled, sync_interval_hours, next_sync_at, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'sitemap', 1, ?, ?, ?, ?, 'syncing', NOW(), NOW())
      `, [sourceId, kbId, tenantId, sitemapUrl, maxPages, autoSyncEnabled, syncIntervalHours, nextSyncAt]);
    }

    try {
      const pythonUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:62002';
      const response = await axios.post(`${pythonUrl}/api/documents/scrape-sitemap`, {
        kb_id: kbId,
        tenant_id: tenantId,
        sitemap_url: sitemapUrl,
        max_pages: maxPages,
        metadata: {
          scrape_source_id: sourceId,
          source_type: 'sitemap_scrape'
        }
      }, {
        timeout: 300000
      });

      const result = response.data;

      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          documents_count = ?,
          last_sync_at = NOW(),
          sync_status = 'idle',
          last_error = NULL,
          updated_at = NOW()
        WHERE id = ?
      `, [result.documents_processed || 0, sourceId]);

      if (result.documents && result.documents.length > 0) {
        const docIds = result.documents.map(d => d.document_id);
        await db.query(`
          UPDATE yovo_tbl_aiva_documents 
          SET scrape_source_id = ?
          WHERE id IN (?) AND kb_id = ?
        `, [sourceId, docIds, kbId]);
      }

      return {
        source_id: sourceId,
        ...result
      };

    } catch (error) {
      await db.query(`
        UPDATE yovo_tbl_aiva_scrape_sources SET
          sync_status = 'error',
          last_error = ?,
          updated_at = NOW()
        WHERE id = ?
      `, [error.message || 'Scraping failed', sourceId]);

      throw error;
    }
  }

  /**
   * Update scrape source settings (auto-save)
   */
  async updateSource(sourceId, updates) {
    const allowedFields = ['auto_sync_enabled', 'sync_interval_hours', 'max_depth', 'max_pages'];
    const setClause = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    // Calculate next_sync_at if auto_sync settings changed
    if ('auto_sync_enabled' in updates || 'sync_interval_hours' in updates) {
      const source = await this.getSource(sourceId);
      const autoSyncEnabled = updates.auto_sync_enabled ?? source.auto_sync_enabled;
      const syncIntervalHours = updates.sync_interval_hours ?? source.sync_interval_hours;
      
      if (autoSyncEnabled) {
        const nextSyncAt = new Date(Date.now() + syncIntervalHours * 60 * 60 * 1000);
        setClause.push('next_sync_at = ?');
        values.push(nextSyncAt);
      } else {
        setClause.push('next_sync_at = NULL');
      }
    }

    setClause.push('updated_at = NOW()');
    values.push(sourceId);

    await db.query(
      `UPDATE yovo_tbl_aiva_scrape_sources SET ${setClause.join(', ')} WHERE id = ?`,
      values
    );

    return this.getSource(sourceId);
  }

  /**
   * Delete scrape source and optionally its documents
   */
  async deleteSource(sourceId, deleteDocuments = false) {
    const source = await this.getSource(sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    if (deleteDocuments) {
      // Delete associated documents (will cascade to chunks via FK)
      await db.query(
        'DELETE FROM yovo_tbl_aiva_documents WHERE scrape_source_id = ?',
        [sourceId]
      );
    } else {
      // Just unlink documents
      await db.query(
        'UPDATE yovo_tbl_aiva_documents SET scrape_source_id = NULL WHERE scrape_source_id = ?',
        [sourceId]
      );
    }

    // Delete the source
    await db.query('DELETE FROM yovo_tbl_aiva_scrape_sources WHERE id = ?', [sourceId]);

    return { deleted: true, documents_affected: deleteDocuments };
  }

  /**
   * Trigger manual re-sync for a source
   */
  async syncSource(sourceId) {
    const source = await this.getSource(sourceId);
    if (!source) {
      throw new Error('Source not found');
    }

    if (source.scrape_type === 'sitemap') {
      return this.scrapeSitemap({
        kbId: source.kb_id,
        tenantId: source.tenant_id,
        sitemapUrl: source.url,
        maxPages: source.max_pages,
        autoSyncEnabled: source.auto_sync_enabled,
        syncIntervalHours: source.sync_interval_hours
      });
    } else {
      return this.scrapeUrl({
        kbId: source.kb_id,
        tenantId: source.tenant_id,
        url: source.url,
        maxDepth: source.max_depth,
        maxPages: source.max_pages,
        autoSyncEnabled: source.auto_sync_enabled,
        syncIntervalHours: source.sync_interval_hours
      });
    }
  }
}

module.exports = new ScrapeSourceService();