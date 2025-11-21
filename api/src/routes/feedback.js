/**
 * Feedback Routes
 * Handles session and message feedback submission
 */

const express = require('express');
const router = express.Router();
const FeedbackService = require('../services/FeedbackService');
const ResponseBuilder = require('../utils/response-builder');
const { verifyToken, verifyApiKey } = require('../middleware/auth');

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
 * @route POST /api/feedback/session
 * @desc Submit session feedback (public - no auth required)
 * @access Public
 */
router.post('/session', async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const { session_id, rating, comment } = req.body;

        // Validate
        if (!session_id || !rating) {
            return res.status(400).json(
                ResponseBuilder.badRequest('session_id and rating are required')
            );
        }

        if (!['good', 'bad'].includes(rating)) {
            return res.status(400).json(
                ResponseBuilder.badRequest('rating must be "good" or "bad"')
            );
        }

        const feedback = await FeedbackService.submitSessionFeedback({
            sessionId: session_id,
            rating,
            comment
        });

        res.json(rb.success(feedback));

    } catch (error) {
        console.error('Submit session feedback error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route POST /api/feedback/message
 * @desc Submit message feedback (public - no auth required)
 * @access Public
 */
router.post('/message', async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const { message_id, rating, comment } = req.body;

        // Validate
        if (!message_id || !rating) {
            return res.status(400).json(
                ResponseBuilder.badRequest('message_id and rating are required')
            );
        }

        if (!['useful', 'not_useful'].includes(rating)) {
            return res.status(400).json(
                ResponseBuilder.badRequest('rating must be "useful" or "not_useful"')
            );
        }

        const feedback = await FeedbackService.submitMessageFeedback({
            messageId: message_id,
            rating,
            comment
        });

        res.json(rb.success(feedback));

    } catch (error) {
        console.error('Submit message feedback error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route GET /api/feedback/session/:sessionId
 * @desc Get session feedback (public)
 * @access Public
 */
router.get('/session/:sessionId', async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const feedback = await FeedbackService.getSessionFeedback(req.params.sessionId);

        if (!feedback) {
            return res.status(404).json(
                ResponseBuilder.notFound('Feedback')
            );
        }

        res.json(rb.success(feedback));

    } catch (error) {
        console.error('Get session feedback error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route GET /api/feedback/message/:messageId
 * @desc Get message feedback (public)
 * @access Public
 */
router.get('/message/:messageId', async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const feedback = await FeedbackService.getMessageFeedback(req.params.messageId);

        if (!feedback) {
            return res.status(404).json(
                ResponseBuilder.notFound('Feedback')
            );
        }

        res.json(rb.success(feedback));

    } catch (error) {
        console.error('Get message feedback error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route GET /api/feedback/agent/:agentId/stats
 * @desc Get feedback statistics for an agent
 * @access Private
 */
router.get('/agent/:agentId/stats', authenticate, async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const { start_date, end_date } = req.query;

        const stats = await FeedbackService.getAgentFeedbackStats(
            req.params.agentId,
            {
                startDate: start_date,
                endDate: end_date
            }
        );

        res.json(rb.success(stats));

    } catch (error) {
        console.error('Get agent feedback stats error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route GET /api/feedback/tenant/stats
 * @desc Get tenant-wide feedback statistics
 * @access Private
 */
router.get('/tenant/stats', authenticate, async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const tenantId = req.user.tenant_id || req.user.id;
        const { start_date, end_date } = req.query;

        const stats = await FeedbackService.getTenantFeedbackStats(
            tenantId,
            {
                startDate: start_date,
                endDate: end_date
            }
        );

        res.json(rb.success(stats));

    } catch (error) {
        console.error('Get tenant feedback stats error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

/**
 * @route GET /api/feedback/recent
 * @desc Get recent feedback with comments
 * @access Private
 */
router.get('/recent', authenticate, async (req, res) => {
    const rb = new ResponseBuilder();

    try {
        const tenantId = req.user.tenant_id || req.user.id;
        const { limit, agent_id } = req.query;

        const feedback = await FeedbackService.getRecentFeedbackWithComments(
            tenantId,
            {
                limit: limit ? parseInt(limit) : 20,
                agentId: agent_id
            }
        );

        res.json(rb.success({ feedback }));

    } catch (error) {
        console.error('Get recent feedback error:', error);
        res.status(500).json(
            ResponseBuilder.serverError(error.message)
        );
    }
});

module.exports = router;