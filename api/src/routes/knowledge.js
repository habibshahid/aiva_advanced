/**
 * Knowledge Routes
 * API endpoints for knowledge bases and document management
 */
require('dotenv').config();

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permissions');
const KnowledgeService = require('../services/KnowledgeService');
const CreditService = require('../services/CreditService');
const ResponseBuilder = require('../utils/response-builder');
const axios = require('axios');
const FormData = require('form-data');
const { 
  validate, 
  validateKnowledgeBase, 
  validateDocumentUpload,
  validateSearchQuery,
  validatePagination 
} = require('../utils/validators');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 // 50MB default
  }
});

/**
 * @route POST /api/knowledge
 * @desc Create knowledge base
 * @access Private
 */
router.post('/', verifyToken, checkPermission('agents.create'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const errors = validateKnowledgeBase(req.body);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    const kb = await KnowledgeService.createKnowledgeBase(
      req.user.tenant_id || req.user.id,
      req.body
    );

    res.status(201).json(rb.success(kb, null, 201));

  } catch (error) {
    console.error('Create KB error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/knowledge
 * @desc List knowledge bases
 * @access Private
 */
router.get('/', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kbs = await KnowledgeService.listKnowledgeBases(
      req.user.tenant_id || req.user.id,
      {
        type: req.query.type,
        status: req.query.status
      }
    );

    res.json(rb.success({ knowledge_bases: kbs }));

  } catch (error) {
    console.error('List KBs error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/knowledge/:kbId
 * @desc Get knowledge base details
 * @access Private
 */
router.get('/:kbId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    res.json(rb.success(kb));

  } catch (error) {
    console.error('Get KB error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route PUT /api/knowledge/:kbId
 * @desc Update knowledge base
 * @access Private
 */
router.put('/:kbId', verifyToken, checkPermission('agents.update'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const errors = validateKnowledgeBase(req.body, true);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    const updated = await KnowledgeService.updateKnowledgeBase(req.params.kbId, req.body);

    res.json(rb.success(updated));

  } catch (error) {
    console.error('Update KB error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route DELETE /api/knowledge/:kbId
 * @desc Delete knowledge base
 * @access Private
 */
router.delete('/:kbId', verifyToken, checkPermission('agents.delete'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    await KnowledgeService.deleteKnowledgeBase(req.params.kbId);

    res.json(rb.success({ message: 'Knowledge base deleted successfully' }));

  } catch (error) {
    console.error('Delete KB error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/knowledge/:kbId/analytics
 * @desc Get KB analytics
 * @access Private
 */
router.get('/:kbId/analytics', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const days = parseInt(req.query.days) || 30;
    const analytics = await KnowledgeService.getKBAnalytics(req.params.kbId, days);

    res.json(rb.success(analytics));

  } catch (error) {
    console.error('Get KB analytics error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/knowledge/:kbId/documents
 * @desc Upload document to knowledge base
 * @access Private
 */
router.post('/:kbId/documents', verifyToken, upload.single('file'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    // Validate file
    const errors = validateDocumentUpload(req.file);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    // Check credits
    const tenantId = req.user.tenant_id || req.user.id;
    const balance = await CreditService.getBalance(tenantId);

    if (balance < 0.01) {
      return res.status(402).json(
        ResponseBuilder.insufficientCredits(balance)
      );
    }

    // Upload document
    const result = await KnowledgeService.uploadDocument({
      kbId: req.params.kbId,
      tenantId: tenantId,
      file: req.file,
      originalFilename: req.file.originalname,
      uploadedBy: req.user.id,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {}
    });

    res.status(201).json(rb.success(result, null, 201));

  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/knowledge/:kbId/documents
 * @desc List documents in knowledge base
 * @access Private
 */
router.get('/:kbId/documents', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const { page, limit, errors } = validatePagination(req.query);
    
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    const result = await KnowledgeService.listDocuments(
      req.params.kbId,
      {
        page,
        limit,
        status: req.query.status
      }
    );

    res.json(rb.paginated(result.documents, result.total, page, limit));

  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route GET /api/knowledge/:kbId/documents/:documentId
 * @desc Get document details
 * @access Private
 */
router.get('/:kbId/documents/:documentId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    const document = await KnowledgeService.getDocument(req.params.documentId);

    if (!document) {
      return res.status(404).json(
        ResponseBuilder.notFound('Document')
      );
    }

    res.json(rb.success(document));

  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route DELETE /api/knowledge/:kbId/documents/:documentId
 * @desc Delete document
 * @access Private
 */
router.delete('/:kbId/documents/:documentId', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    await KnowledgeService.deleteDocument(req.params.documentId);

    res.json(rb.success({ message: 'Document deleted successfully' }));

  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/knowledge/search
 * @desc Search knowledge base
 * @access Private
 */
router.post('/search', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const errors = validateSearchQuery(req.body);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    const { kb_id, query, image, top_k, search_type, filters } = req.body;

    // Get KB to check ownership
    const kb = await KnowledgeService.getKnowledgeBase(kb_id);

    if (!kb) {
      return res.status(404).json(
        ResponseBuilder.notFound('Knowledge base')
      );
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(
        ResponseBuilder.forbidden()
      );
    }

    // Check credits
    const tenantId = req.user.tenant_id || req.user.id;
    const balance = await CreditService.getBalance(tenantId);

    if (balance < 0.001) {
      return res.status(402).json(
        ResponseBuilder.insufficientCredits(balance)
      );
    }

    // Perform search
    const result = await KnowledgeService.search({
      kbId: kb_id,
      query: query,
      image: image,
      topK: top_k || 5,
      searchType: search_type || 'hybrid',
      filters: filters || {}
    });

    // Deduct credits
    await CreditService.deductCredits(
      tenantId,
      result.cost,
      null,
      'knowledge_search',
      {
        kb_id: kb_id,
        query: query,
        results_count: result.results?.total_found || 0
      }
    );

    // Get new balance
    const newBalance = await CreditService.getBalance(tenantId);

    // Build credits info
    const creditsInfo = rb.buildCreditsInfo(
      'knowledge_search',
      result.cost,
      newBalance,
      result.cost_breakdown
    );

    res.json(rb.success(result.results, creditsInfo));

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

// Get KB statistics
router.get('/:id/stats', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { id } = req.params;
    
    // Verify KB ownership
    const kb = await KnowledgeService.getKnowledgeBase(id);
    if (!kb || kb.tenant_id !== req.user.id) {
      return res.status(404).json(ResponseBuilder(null, 'Knowledge base not found', 404));
    }
    
    const stats = await KnowledgeService.getKBStats(id);
    
    res.json(rb.success(stats));
  } catch (error) {
    console.error('Get KB stats error:', error);
    res.status(500).json(ResponseBuilder(null, error.message, 500));
  }
});

// Get search history
router.get('/:id/searches', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    // Verify KB ownership
    const kb = await KnowledgeService.getKnowledgeBase(id);
    if (!kb || kb.tenant_id !== req.user.id) {
      return res.status(404).json(ResponseBuilder(null, 'Knowledge base not found', 404));
    }
    
    // Get search history from database
    const [searches] = await db.query(`
      SELECT 
        id,
        query,
        search_type,
        results_count,
        avg_relevance_score,
        processing_time_ms,
        cost,
        created_at
      FROM yovo_tbl_aiva_knowledge_searches
      WHERE kb_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [id, parseInt(limit)]);
    
    res.json(ResponseBuilder(searches));
  } catch (error) {
    console.error('Get search history error:', error);
    res.status(500).json(ResponseBuilder(null, error.message, 500));
  }
});

// Test URL - send JSON
router.post('/test-url', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json(rb.error('URL is required', 400));
    }
    
    const pythonResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/api/v1/documents/test-url`,
      { url },  // Send as JSON
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.PYTHON_SERVICE_API_KEY
        }
      }
    );
    
    res.json(rb.success(pythonResponse.data));
    
  } catch (error) {
    console.error('Test URL error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(
        rb.error(error.response.data.detail || 'Failed to test URL', error.response.status)
      );
    }
    
    res.status(500).json(rb.error(error.message, 500));
  }
});

// Scrape URL - send JSON
router.post('/:kbId/scrape-url', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { kbId } = req.params;
    const { url, max_depth = 2, max_pages = 20, metadata = {} } = req.body;
    
    if (!url) {
      return res.status(400).json(rb.error('URL is required', 400));
    }
    
    const kb = await KnowledgeService.getKnowledgeBase(kbId);
    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }
    
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }
    
    const balance = await CreditService.getBalance(tenantId);
    if (balance < 0.1) {
      return res.status(402).json(ResponseBuilder.insufficientCredits(balance));
    }
    
    const pythonResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/api/v1/documents/scrape-url`,
      {  // Send as JSON
        url,
        kb_id: kbId,
        tenant_id: tenantId,
        max_depth,
        max_pages,
        metadata
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.PYTHON_SERVICE_API_KEY
        },
        timeout: 300000
      }
    );
    
    if (pythonResponse.data.documents_processed > 0) {
      const cost = pythonResponse.data.total_pages_scraped * 0.01;
      await CreditService.deductCredits(
        tenantId,
        cost,
        'web_scraping',
        {
          kb_id: kbId,
          url: url,
          pages_scraped: pythonResponse.data.total_pages_scraped
        }
      );
    }
    
    res.json(rb.success(pythonResponse.data));
    
  } catch (error) {
    console.error('Scrape URL error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(
        rb.error(error.response.data.detail || 'Failed to scrape URL', error.response.status)
      );
    }
    
    res.status(500).json(rb.error(error.message, 500));
  }
});

// Scrape Sitemap - send JSON
router.post('/:kbId/scrape-sitemap', verifyToken, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { kbId } = req.params;
    const { sitemap_url, max_pages = 50, metadata = {} } = req.body;
    
    if (!sitemap_url) {
      return res.status(400).json(rb.error('Sitemap URL is required', 400));
    }
    
    const kb = await KnowledgeService.getKnowledgeBase(kbId);
    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }
    
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }
    
    const balance = await CreditService.getBalance(tenantId);
    if (balance < 0.5) {
      return res.status(402).json(ResponseBuilder.insufficientCredits(balance));
    }
    
    const pythonResponse = await axios.post(
      `${process.env.PYTHON_SERVICE_URL}/api/v1/documents/scrape-sitemap`,
      {  // Send as JSON
        sitemap_url,
        kb_id: kbId,
        tenant_id: tenantId,
        max_pages,
        metadata
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.PYTHON_SERVICE_API_KEY
        },
        timeout: 600000
      }
    );
    
    if (pythonResponse.data.documents_processed > 0) {
      const cost = pythonResponse.data.documents_processed * 0.01;
      await CreditService.deductCredits(
        tenantId,
        cost,
        'sitemap_scraping',
        {
          kb_id: kbId,
          sitemap_url: sitemap_url,
          documents_processed: pythonResponse.data.documents_processed
        }
      );
    }
    
    res.json(rb.success(pythonResponse.data));
    
  } catch (error) {
    console.error('Scrape sitemap error:', error);
    
    if (error.response) {
      return res.status(error.response.status).json(
        rb.error(error.response.data.detail || 'Failed to scrape sitemap', error.response.status)
      );
    }
    
    res.status(500).json(rb.error(error.message, 500));
  }
});

module.exports = router;