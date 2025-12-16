/**
 * Response Builder Utility
 * Creates consistent, structured API responses
 */
require('dotenv').config();

const { v4: uuidv4 } = require('uuid');

class ResponseBuilder {
  constructor() {
    this.startTime = Date.now();
    this.requestId = uuidv4();
  }

  /**
   * Build success response
   * @param {Object} data - Response data
   * @param {Object|null} credits - Credit information
   * @param {number} statusCode - HTTP status code (default: 200)
   * @returns {Object} Formatted response
   */
  success(data, credits = null, statusCode = 200) {
    const response = {
      success: true,
      status_code: statusCode,
      data: data,
      meta: {
        request_id: this.requestId,
        timestamp: new Date().toISOString(),
        processing_time_ms: Date.now() - this.startTime,
        version: process.env.API_VERSION || 'v1.0.0'
      }
    };

    if (credits) {
      response.credits = credits;
    }

    return response;
  }

  /**
   * Build error response
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {Object|null} details - Additional error details
   * @param {number} statusCode - HTTP status code (default: 500)
   * @returns {Object} Formatted error response
   */
  error(code, message, details = null, statusCode = 500) {
    const response = {
      success: false,
      status_code: statusCode,
      data: null,
      meta: {
        request_id: this.requestId,
        timestamp: new Date().toISOString(),
        processing_time_ms: Date.now() - this.startTime,
        version: process.env.API_VERSION || 'v1.0.0'
      },
      error: {
        code: code,
        message: message
      }
    };

    if (details) {
      response.error.details = details;
    }

    return response;
  }

  /**
   * Build credits information object
   * @param {string} operation - Operation name
   * @param {number} cost - Final cost
   * @param {number} remainingBalance - Remaining credit balance
   * @param {Object} breakdown - Cost breakdown details
   * @returns {Object} Credits information
   */
  buildCreditsInfo(operation, cost, remainingBalance, breakdown) {
    // Safely handle undefined/null values
    const safeCost = parseFloat(cost) || 0;
    const safeBalance = parseFloat(remainingBalance) || 0;
    const safeBreakdown = breakdown || {};
    
    return {
      operation: operation,
      cost: parseFloat(safeCost.toFixed(6)),
      remaining_balance: parseFloat(safeBalance.toFixed(6)),
      breakdown: {
        base_cost: parseFloat((parseFloat(safeBreakdown.base_cost) || 0).toFixed(6)),
        profit_amount: parseFloat((parseFloat(safeBreakdown.profit_amount) || 0).toFixed(6)),
        final_cost: parseFloat((parseFloat(safeBreakdown.final_cost) || 0).toFixed(6)),
        operations: safeBreakdown.operations || []
      }
    };
  }

  /**
   * Build paginated response
   * @param {Array} items - Data items
   * @param {number} total - Total count
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {Object|null} credits - Credit information
   * @returns {Object} Paginated response
   */
  paginated(items, total, page, limit, credits = null) {
    return this.success(
      {
        items: items,
        pagination: {
          total: total,
          page: page,
          limit: limit,
          pages: Math.ceil(total / limit),
          has_next: page * limit < total,
          has_prev: page > 1
        }
      },
      credits
    );
  }

  /**
   * Build chat message response
   * @param {Object} messageData - Message data including response, sources, etc.
   * @param {Object} credits - Credit information
   * @returns {Object} Chat response
   */
  chatResponse(messageData, credits) {
    return this.success(messageData, credits);
  }

  /**
   * Build knowledge search response
   * @param {Object} searchData - Search results and metadata
   * @param {Object} credits - Credit information
   * @returns {Object} Search response
   */
  searchResponse(searchData, credits) {
    return this.success(searchData, credits);
  }

  /**
   * Build document upload response
   * @param {Object} documentData - Document processing results
   * @param {Object} credits - Credit information
   * @returns {Object} Upload response
   */
  documentUploadResponse(documentData, credits) {
    return this.success(documentData, credits, 201);
  }

  /**
   * Common error responses
   */
  static notFound(resource = 'Resource') {
    const rb = new ResponseBuilder();
    return rb.error(
      'NOT_FOUND',
      `${resource} not found`,
      null,
      404
    );
  }

  static unauthorized(message = 'Unauthorized access') {
    const rb = new ResponseBuilder();
    return rb.error(
      'UNAUTHORIZED',
      message,
      null,
      401
    );
  }

  static forbidden(message = 'Insufficient permissions') {
    const rb = new ResponseBuilder();
    return rb.error(
      'FORBIDDEN',
      message,
      null,
      403
    );
  }

  static badRequest(message = 'Invalid request', details = null) {
    const rb = new ResponseBuilder();
    return rb.error(
      'BAD_REQUEST',
      message,
      details,
      400
    );
  }

  static insufficientCredits(balance = 0) {
    const rb = new ResponseBuilder();
    return rb.error(
      'INSUFFICIENT_CREDITS',
      'Insufficient credits to perform this operation',
      { current_balance: balance },
      402
    );
  }

  static validationError(errors) {
    const rb = new ResponseBuilder();
    return rb.error(
      'VALIDATION_ERROR',
      'Request validation failed',
      { validation_errors: errors },
      422
    );
  }

  static serverError(message = 'Internal server error', details = null) {
    const rb = new ResponseBuilder();
    return rb.error(
      'INTERNAL_ERROR',
      message,
      details,
      500
    );
  }

  static serviceUnavailable(service = 'Service') {
    const rb = new ResponseBuilder();
    return rb.error(
      'SERVICE_UNAVAILABLE',
      `${service} is currently unavailable`,
      null,
      503
    );
  }
 
  static conflict(message = 'Service') {
    const rb = new ResponseBuilder();
    return rb.error(
      'SERVICE_UNAVAILABLE',
      `${message}`,
      null,
      401
    );
  }
}

module.exports = ResponseBuilder;