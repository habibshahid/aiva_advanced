/**
 * Knowledge Routes
 * API endpoints for knowledge bases and document management
 */
require('dotenv').config();

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, verifyApiKey } = require('../middleware/auth');
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
const PythonServiceClient = require('../services/PythonServiceClient');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024 // 50MB default
  }
});

const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (apiKey) {
        // Use API key authentication
        return verifyApiKey(req, res, next);
    } else {
        // Use JWT token authentication
        return verifyToken(req, res, next);
    }
};

/**
 * @route POST /api/knowledge
 * @desc Create knowledge base
 * @access Private
 */
router.post('/', authenticate, checkPermission('agents.create'), async (req, res) => {
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
router.get('/', authenticate, async (req, res) => {
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
 * @route GET /api/knowledge/cache/stats
 * @desc Get semantic cache statistics
 * @access Private
 */
router.get('/cache/stats', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id } = req.query;
    
    const stats = await PythonServiceClient.getCacheStats(kb_id);

    res.json(rb.success(stats));

  } catch (error) {
    console.error('Get cache stats error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route DELETE /api/knowledge/cache/clear
 * @desc Clear semantic cache
 * @access Private
 */
router.delete('/cache/clear', authenticate, checkPermission('agents.update'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id } = req.query;
    
    const result = await PythonServiceClient.clearCache(kb_id);

    res.json(rb.success(result));

  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/knowledge/:kbId
 * @desc Get knowledge base details
 * @access Private
 */
router.get('/:kbId', authenticate, async (req, res) => {
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
router.put('/:kbId', authenticate, checkPermission('agents.update'), async (req, res) => {
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
router.delete('/:kbId', authenticate, checkPermission('agents.delete'), async (req, res) => {
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
router.get('/:kbId/analytics', authenticate, async (req, res) => {
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
 * @route POST /api/knowledge/:kbId/update-stats
 * @desc Manually update KB statistics
 * @access Private
 */
router.post('/:kbId/update-stats', authenticate, checkPermission('agents.view'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }

    // Check ownership
    if (kb.tenant_id !== (req.user.tenant_id || req.user.id) && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    await KnowledgeService.updateKBStats(req.params.kbId);
    
    // Get updated KB
    const updated = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    res.json(rb.success(updated, 'Statistics updated successfully'));

  } catch (error) {
    console.error('Update stats error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/knowledge/:kbId/documents
 * @desc Upload document to knowledge base
 * @access Private
 */
router.post('/:kbId/documents', authenticate, upload.single('file'), async (req, res) => {
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
router.get('/:kbId/documents', authenticate, async (req, res) => {
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
router.get('/:kbId/documents/:documentId', authenticate, async (req, res) => {
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
router.delete('/:kbId/documents/:documentId', authenticate, async (req, res) => {
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
 * @desc Search knowledge base (auto-routes to image or text search)
 * @access Private
 */
 /**
 * @swagger
 * /api/knowledge/search:
 *   post:
 *     summary: Search knowledge base
 *     tags: [Knowledge]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - kb_id
 *               - query
 *             properties:
 *               kb_id:
 *                 type: string
 *                 format: uuid
 *               query:
 *                 type: string
 *               top_k:
 *                 type: integer
 *                 default: 5
 *                 minimum: 1
 *                 maximum: 20
 *               search_type:
 *                 type: string
 *                 enum: [text, image, hybrid]
 *                 default: text
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_found:
 *                       type: integer
 *                     returned:
 *                       type: integer
 *                     text_results:
 *                       type: array
 *                     image_results:
 *                       type: array
 *                     product_results:
 *                       type: array
 */
router.post('/search', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { kb_id, query, image_base64, search_type, top_k, filters } = req.body;
    // Validate KB exists
    const kb = await KnowledgeService.getKnowledgeBase(kb_id);
    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }

    // Check ownership
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    // Check credits
    const balance = await CreditService.getBalance(tenantId);
    if (balance < 0.001) {
      return res.status(402).json(ResponseBuilder.insufficientCredits(balance));
    }

    // ROUTE TO APPROPRIATE SERVICE
    let result;
    const isImageSearch = image_base64 || search_type === 'image' || search_type === 'hybrid';
    
    if (isImageSearch) {
      console.log('Routing to IMAGE search service...');
      result = await KnowledgeService.searchImages({
        kbId: kb_id,
        tenantId,
        query: query || '',
        imageBase64: image_base64,
        searchType: search_type || 'image',
        topK: top_k || 5,
        filters: filters || {}
      });
      
      // Normalize image search response structure
      if (result.results) {
        result = {
          total_found: result.total_found || 0,
          returned: result.returned || 0,
          search_type: search_type || 'image',
          text_results: [],
          image_results: result.results || [],
          product_results: [],
          query_tokens: result.metrics?.query_tokens,
          embedding_model: result.metrics?.embedding_model,
          processing_time_ms: result.metrics?.processing_time_ms,
          chunks_searched: result.metrics?.chunks_searched || 0,
          cost: result.cost
        };
      }
    } else {
      console.log('Routing to TEXT search service...');
      result = await KnowledgeService.search({
        kbId: kb_id,
        tenantId,
        query,
        topK: top_k || 5,
        searchType: 'text',
        filters: filters || {}
      });
	  
	  result = {
		total_found: result.results?.total_found || 0,
		returned: result.results?.returned || 0,
		search_type: 'text',
		text_results: result.results?.text_results || [],
		image_results: result.results?.image_results || [],
		product_results: [],
		query_tokens: result.results?.query_tokens,
		embedding_model: result.results?.embedding_model,
		processing_time_ms: result.results?.processing_time_ms,
		chunks_searched: result.results?.chunks_searched || 0,
        cost: result.cost
  	  };
    }

    // Get updated balance
    const newBalance = await CreditService.getBalance(tenantId);

    // Build response with credits info
    const response = rb.success(result, 'Search completed successfully');
    response.credits = {
      operation: isImageSearch ? 'image_search' : 'knowledge_search',
      cost: result.cost || 0.0005,
      remaining_balance: newBalance,
      breakdown: {
        base_cost: result.cost || 0.0005,
        profit_amount: (result.cost || 0.0005) * 0.2,
        final_cost: result.cost || 0.0005,
        operations: [
          {
            operation: isImageSearch ? 'image_search' : 'knowledge_search',
            quantity: 1,
            unit_cost: result.cost || 0.0005,
            total_cost: result.cost || 0.0005,
            details: {
              search_type: search_type || 'text',
              results_returned: result.returned || 0,
              query_tokens: result.query_tokens || 0,
              embedding_model: result.embedding_model || 'unknown',
              processing_time_ms: result.processing_time_ms || 0
            }
          }
        ]
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Knowledge search failed')
    );
  }
});

// Get KB statistics
router.get('/:id/stats', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { id } = req.params;
    
    // Verify KB ownership
    const kb = await KnowledgeService.getKnowledgeBase(id);
    if (!kb || kb.tenant_id !== req.user.tenant_id) {
      return res.status(404).json(ResponseBuilder.notFound(null, 'Knowledge base not found', 404));
    }
    
    const stats = await KnowledgeService.getKBStats(id);
    
    res.json(rb.success(stats));
  } catch (error) {
    console.error('Get KB stats error:', error);
    res.status(500).json(rb.error(null, error.message, 500));
  }
});

// Get search history
router.get('/:id/searches', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();
  
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    // Verify KB ownership
    const kb = await KnowledgeService.getKnowledgeBase(id);
    if (!kb || kb.tenant_id !== req.user.id) {
      return res.status(404).json(rb.error(null, 'Knowledge base not found', 404));
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
    
    res.json(rb.success(searches));
  } catch (error) {
    console.error('Get search history error:', error);
    res.status(500).json(rb.error(null, error.message, 500));
  }
});

// Test URL - send JSON
router.post('/test-url', authenticate, async (req, res) => {
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
router.post('/:kbId/scrape-url', authenticate, async (req, res) => {
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
router.post('/:kbId/scrape-sitemap', authenticate, async (req, res) => {
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

/**
 * @route POST /api/knowledge/:kbId/images
 * @desc Upload image to knowledge base
 * @access Private
 */
router.post('/:kbId/images', authenticate, upload.single('file'), async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);

    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }

    // Check ownership
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    // Validate file
    const errors = validateDocumentUpload(req.file);
    if (errors.length > 0) {
      return res.status(422).json(ResponseBuilder.validationError(errors));
    }

    // Check if it's an image
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!imageTypes.includes(req.file.mimetype)) {
      return res.status(422).json(rb.badRequest('File must be an image (JPG, PNG, GIF, or WEBP)'));
    }

    // Check credits
    const balance = await CreditService.getBalance(tenantId);
    if (balance < 0.001) {
      return res.status(402).json(ResponseBuilder.insufficientCredits(balance));
    }

    // Upload image to Python service
    const result = await PythonServiceClient.uploadImage({
      kb_id: req.params.kbId,
      file: req.file.buffer,
      filename: req.file.originalname,
      description: req.body.description || null,
      metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {}
    });

    // Deduct credits
    const imageCost = result.cost_summary?.total_cost || 0.0003; // From Python response or default
    await CreditService.deductCredits(
      tenantId,
      imageCost,
      'image_upload',
      {
        kb_id: req.params.kbId,
        image_id: result.image_id,
        filename: req.file.originalname,
        file_size: req.file.size
      }
    );

    // Get new balance
    const newBalance = await CreditService.getBalance(tenantId);

    // Build credits info
    const creditsInfo = rb.buildCreditsInfo(
      'image_upload',
      imageCost,
      newBalance,
      result.cost_summary?.breakdown || {}
    );

    res.status(201).json(rb.success(result, creditsInfo, 201));

  } catch (error) {
    console.error('Upload image error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/knowledge/:kbId/images/search
 * @desc Search images by text query
 * @access Private
 */
router.post('/:kbId/images/search', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const { query, limit } = req.body;

    if (!query) {
      return res.status(422).json(rb.badRequest('Query is required'));
    }

    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);
    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }

    // Check ownership
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    // Check credits
    const balance = await CreditService.getBalance(tenantId);
    if (balance < 0.0001) {
      return res.status(402).json(ResponseBuilder.insufficientCredits(balance));
    }

    // Search images
    const result = await PythonServiceClient.searchImages({
      kb_id: req.params.kbId,
      query: query,
      limit: limit || 5
    });

    // Deduct credits
    const searchCost = result.cost_summary?.cost || 0.0001;
    await CreditService.deductCredits(
      tenantId,
      searchCost,
      'image_search',
      {
        kb_id: req.params.kbId,
        query: query,
        results_count: result.results?.length || 0
      }
    );

    const newBalance = await CreditService.getBalance(tenantId);
    const creditsInfo = rb.buildCreditsInfo(
      'image_search',
      searchCost,
      newBalance,
      result.cost_summary || {}
    );

    res.json(rb.success(result, creditsInfo));

  } catch (error) {
    console.error('Image search error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route GET /api/knowledge/:kbId/images
 * @desc List images in knowledge base
 * @access Private
 */
router.get('/:kbId/images', authenticate, async (req, res) => {
  const rb = new ResponseBuilder();

  try {
    const kb = await KnowledgeService.getKnowledgeBase(req.params.kbId);
    if (!kb) {
      return res.status(404).json(ResponseBuilder.notFound('Knowledge base'));
    }

    // Check ownership
    const tenantId = req.user.tenant_id || req.user.id;
    if (kb.tenant_id !== tenantId && req.user.role !== 'super_admin') {
      return res.status(403).json(ResponseBuilder.forbidden());
    }

    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    const result = await PythonServiceClient.listImages(req.params.kbId, limit, offset);

    res.json(rb.success(result));

  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json(ResponseBuilder.serverError(error.message));
  }
});

/**
 * @route POST /api/knowledge/:kb_id/images/upload
 * @desc Upload image to knowledge base
 * @access Private
 */
router.post('/:kb_id/images/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { kb_id } = req.params;
    const { metadata } = req.body;
    const rb = new ResponseBuilder();
	
    // Validate file
    if (!req.file) {
      return res.status(400).json(
        rb.badRequest('No image file provided')
      );
    }

    // Validate image type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(req.file.mimetype)) {
      return res.status(400).json(
        rb.badRequest('Invalid image type. Only JPG, PNG, GIF, and WEBP are supported.')
      );
    }

    // Validate file size (10MB max)
    if (req.file.size > 10 * 1024 * 1024) {
      return res.status(400).json(
        rb.badRequest('Image file too large. Maximum size is 10MB.')
      );
    }

    // Parse metadata
    let parsedMetadata = {};
    if (metadata) {
      try {
        parsedMetadata = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
      } catch (error) {
        console.error('Error parsing metadata:', error);
      }
    }

    // Upload image
    const result = await KnowledgeService.uploadImage({
      kbId: kb_id,
      tenantId: req.user.tenant_id || req.user.id,
      file: req.file,
      metadata: parsedMetadata
    });

    res.json(rb.success(result, 'Image uploaded successfully'));
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to upload image')
    );
  }
});

/**
 * @route POST /api/knowledge/:kb_id/images/search
 * @desc Search images in knowledge base
 * @access Private
 */
router.post('/:kb_id/images/search', authenticate, async (req, res) => {
  try {
    const { kb_id } = req.params;
    const { query, image_base64, search_type, top_k, filters } = req.body;
	const rb = new ResponseBuilder();
	
    // Validate search type
    const validTypes = ['text', 'image', 'hybrid'];
    if (search_type && !validTypes.includes(search_type)) {
      return res.status(400).json(
        rb.badRequest(`Invalid search_type. Must be one of: ${validTypes.join(', ')}`)
      );
    }

    // Validate required fields based on search type
    if (search_type === 'image' && !image_base64) {
      return res.status(400).json(
        rb.badRequest('image_base64 is required for image search')
      );
    }

    if (search_type === 'hybrid' && (!query || !image_base64)) {
      return res.status(400).json(
        rb.badRequest('Both query and image_base64 are required for hybrid search')
      );
    }

    const result = await KnowledgeService.searchImages({
      kbId: kb_id,
      tenantId: req.user.tenant_id || req.user.id,
      query,
      imageBase64: image_base64,
      searchType: search_type || 'text',
      topK: top_k || 5,
      filters: filters || {}
    });

    res.json(rb.success(result, 'Search completed successfully'));
  } catch (error) {
    console.error('Image search error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to search images')
    );
  }
});

/**
 * @route GET /api/knowledge/:kb_id/images/stats
 * @desc Get image statistics for knowledge base
 * @access Private
 */
router.get('/:kb_id/images/stats', authenticate, async (req, res) => {
  try {
    const { kb_id } = req.params;
	const rb = new ResponseBuilder();
	
    const stats = await KnowledgeService.getImageStats(kb_id);

    res.json(rb.success(stats, 'Statistics retrieved successfully'));
  } catch (error) {
    console.error('Get image stats error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to retrieve statistics')
    );
  }
});

/**
 * @route GET /api/knowledge/:kb_id/images/list
 * @desc List images in knowledge base
 * @access Private
 */
router.get('/:kb_id/images/list', authenticate, async (req, res) => {
  try {
    const { kb_id } = req.params;
    const { page = 1, limit = 20 } = req.query;
	const rb = new ResponseBuilder();
	
    const result = await KnowledgeService.listImages(
      kb_id,
      parseInt(page),
      parseInt(limit)
    );

    res.json(rb.success(result, 'Images retrieved successfully'));
  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to list images')
    );
  }
});

/**
 * @route DELETE /api/knowledge/:kb_id/images/:image_id
 * @desc Delete image from knowledge base
 * @access Private
 */

router.delete('/:kb_id/images/:image_id', authenticate, async (req, res) => {
  try {
    const { kb_id, image_id } = req.params;
	const rb = new ResponseBuilder();
	
    const result = await KnowledgeService.deleteImage(kb_id, image_id);

    res.json(rb.success(result, 'Image deleted successfully'));
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message || 'Failed to delete image')
    );
  }
});

/**
 * @route GET /api/knowledge/:kb_id/images/:image_id/view
 * @desc View/download image - Serves images from /etc/aiva-oai/storage/images/
 * @access Private
 */
router.get('/:kb_id/images/:image_id/view', async (req, res) => {
  try {
    const { kb_id, image_id } = req.params;
    const db = require('../config/database');
    const fs = require('fs');
    
    // Get image info from database
    const [images] = await db.query(
      `SELECT storage_url, image_type, file_size_bytes, filename 
       FROM yovo_tbl_aiva_images 
       WHERE id = ? AND kb_id = ?`,
      [image_id, kb_id]
    );
    
    if (images.length === 0) {
      console.error(`Image not found: ${image_id}`);
      return res.status(404).json({ error: 'Image not found' });
    }
    
    const image = images[0];
    let imagePath = image.storage_url;
    
	if(!imagePath.includes('/etc/aiva-oai')){
		imagePath = `/etc/aiva-oai/${imagePath}`;
	}
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      console.error(`File not found: ${imagePath}`);
      return res.status(404).json({ error: 'Image file not found' });
    }
    
    // Determine content type
    let contentType = 'image/png';
    const imageType = (image.image_type || '').toLowerCase();
    
    if (imageType.includes('jpeg') || imageType.includes('jpg')) {
      contentType = 'image/jpeg';
    } else if (imageType.includes('png')) {
      contentType = 'image/png';
    } else if (imageType.includes('gif')) {
      contentType = 'image/gif';
    } else if (imageType.includes('webp')) {
      contentType = 'image/webp';
    } else if (imageType.includes('svg')) {
      contentType = 'image/svg+xml';
    }
    
    // Set headers
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      'Content-Disposition': `inline; filename="${image.filename}"`,
      'Content-Length': image.file_size_bytes
    });
	
    // Stream file
    const fileStream = fs.createReadStream(imagePath);
    
    fileStream.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error streaming image' });
      }
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Get image error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * NEW ROUTES: Document Status & Reprocess Endpoints
 * 
 * ADD these routes to api/src/routes/knowledge.js
 * Place them after the existing /:kbId/documents/:documentId route (around line 280)
 * 
 * IMPORTANT: Make sure these imports exist at the top of knowledge.js:
 * - const db = require('../config/database');  // If not already imported
 * - const PythonServiceClient = require('../services/PythonServiceClient');
 */

/**
 * @route GET /api/knowledge/:kbId/documents/:documentId/status
 * @desc Get document processing status with real-time progress
 * @access Private
 */
router.get('/:kbId/documents/:documentId/status', authenticate, async (req, res) => {
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

    // Get document status (uses KnowledgeService.getDocumentStatus from KnowledgeService_updates.js)
    const status = await KnowledgeService.getDocumentStatus(req.params.documentId);

    if (!status) {
      return res.status(404).json(
        ResponseBuilder.notFound('Document')
      );
    }

    // Verify document belongs to KB
    if (status.kb_id !== req.params.kbId) {
      return res.status(404).json(
        ResponseBuilder.notFound('Document')
      );
    }

    res.json(rb.success(status));

  } catch (error) {
    console.error('Get document status error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});

/**
 * @route POST /api/knowledge/:kbId/documents/:documentId/reprocess
 * @desc Reprocess a document (re-extract and re-embed)
 * @access Private
 */
router.post('/:kbId/documents/:documentId/reprocess', authenticate, async (req, res) => {
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

    // Get document
    const doc = await KnowledgeService.getDocument(req.params.documentId);

    if (!doc) {
      return res.status(404).json(
        ResponseBuilder.notFound('Document')
      );
    }

    // Verify document belongs to KB
    if (doc.kb_id !== req.params.kbId) {
      return res.status(404).json(
        ResponseBuilder.notFound('Document')
      );
    }

    // Check if already processing
    if (doc.status === 'processing' || doc.status === 'queued') {
      return res.status(400).json(
        rb.error('Document is already being processed', 400)
      );
    }

    // Trigger reprocessing via Python service
    const result = await PythonServiceClient.reprocessDocument(req.params.documentId);

    // Update document status in DB
    const db = require('../config/database');
    await db.query(
      `UPDATE yovo_tbl_aiva_documents 
       SET status = 'processing', 
           error_message = NULL,
           updated_at = NOW()
       WHERE id = ?`,
      [req.params.documentId]
    );

    res.json(rb.success({
      document_id: req.params.documentId,
      status: 'processing',
      message: 'Document reprocessing started'
    }));

  } catch (error) {
    console.error('Reprocess document error:', error);
    res.status(500).json(
      ResponseBuilder.serverError(error.message)
    );
  }
});


module.exports = router;