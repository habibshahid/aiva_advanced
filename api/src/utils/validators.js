/**
 * Request Validators Utility
 * Validation helpers for API requests
 */
require('dotenv').config();
/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(errors) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.errors = errors;
    this.statusCode = 422;
  }
}

/**
 * Validate required fields
 * @param {Object} data - Data object to validate
 * @param {Array<string>} requiredFields - Array of required field names
 * @returns {Array} Array of validation errors
 */
function validateRequired(data, requiredFields) {
  const errors = [];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push({
        field: field,
        message: `${field} is required`,
        code: 'REQUIRED'
      });
    }
  }

  return errors;
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid
 */
function isValidUUID(uuid) {
  if (!uuid) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate string length
 * @param {string} str - String to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @returns {boolean} True if valid
 */
function isValidLength(str, min, max) {
  if (!str) return false;
  const len = str.length;
  return len >= min && len <= max;
}

/**
 * Validate number range
 * @param {number} num - Number to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {boolean} True if valid
 */
function isInRange(num, min, max) {
  return num >= min && num <= max;
}

/**
 * Validate enum value
 * @param {*} value - Value to validate
 * @param {Array} allowedValues - Array of allowed values
 * @returns {boolean} True if valid
 */
function isValidEnum(value, allowedValues) {
  return allowedValues.includes(value);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid
 */
function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate file type
 * @param {string} filename - Filename to validate
 * @param {Array<string>} allowedTypes - Array of allowed extensions
 * @returns {boolean} True if valid
 */
function isValidFileType(filename, allowedTypes) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return allowedTypes.includes(ext);
}

/**
 * Validate JSON string
 * @param {string} jsonString - JSON string to validate
 * @returns {boolean} True if valid
 */
function isValidJson(jsonString) {
  if (!jsonString) return false;
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate pagination parameters
 * @param {Object} params - Query parameters
 * @returns {Object} Validated and sanitized pagination params
 */
function validatePagination(params) {
  const errors = [];
  let page = parseInt(params.page) || 1;
  let limit = parseInt(params.limit) || 20;

  if (page < 1) {
    errors.push({
      field: 'page',
      message: 'Page must be greater than 0',
      code: 'INVALID_RANGE'
    });
    page = 1;
  }

  if (limit < 1 || limit > 100) {
    errors.push({
      field: 'limit',
      message: 'Limit must be between 1 and 100',
      code: 'INVALID_RANGE'
    });
    limit = Math.min(Math.max(limit, 1), 100);
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    errors
  };
}

/**
 * Validate agent creation/update data
 * @param {Object} data - Agent data
 * @param {boolean} isUpdate - True if validating update (makes some fields optional)
 * @returns {Array} Array of validation errors
 */
function validateAgent(data, isUpdate = false) {
  const errors = [];

  // Required fields for creation
  if (!isUpdate) {
    const required = ['name', 'type', 'instructions'];
    errors.push(...validateRequired(data, required));
  }

  // Name validation
  if (data.name !== undefined) {
    if (!isValidLength(data.name, 1, 255)) {
      errors.push({
        field: 'name',
        message: 'Name must be between 1 and 255 characters',
        code: 'INVALID_LENGTH'
      });
    }
  }

  // Type validation
  if (data.type !== undefined) {
    const validTypes = ['customer_support', 'sales', 'technical', 'general'];
    if (!isValidEnum(data.type, validTypes)) {
      errors.push({
        field: 'type',
        message: `Type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // Provider validation
  if (data.provider !== undefined) {
    const validProviders = ['openai', 'deepgram'];
    if (!isValidEnum(data.provider, validProviders)) {
      errors.push({
        field: 'provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // Temperature validation
  if (data.temperature !== undefined) {
    const temp = parseFloat(data.temperature);
    if (isNaN(temp) || !isInRange(temp, 0, 2)) {
      errors.push({
        field: 'temperature',
        message: 'Temperature must be between 0 and 2',
        code: 'INVALID_RANGE'
      });
    }
  }

  // Max tokens validation
  if (data.max_tokens !== undefined) {
    const tokens = parseInt(data.max_tokens);
    if (isNaN(tokens) || !isInRange(tokens, 1, 16000)) {
      errors.push({
        field: 'max_tokens',
        message: 'Max tokens must be between 1 and 16000',
        code: 'INVALID_RANGE'
      });
    }
  }

  // Model validation
  if (data.model !== undefined) {
    const validModels = [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4o-mini-realtime-preview-2024-12-17'
    ];
    if (!isValidEnum(data.model, validModels)) {
      errors.push({
        field: 'model',
        message: `Model must be one of: ${validModels.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // KB ID validation (if provided)
  if (data.kb_id !== undefined && data.kb_id !== null) {
    if (!isValidUUID(data.kb_id)) {
      errors.push({
        field: 'kb_id',
        message: 'Invalid knowledge base ID format',
        code: 'INVALID_FORMAT'
      });
    }
  }

  return errors;
}

/**
 * Validate function creation/update data
 * @param {Object} data - Function data
 * @param {boolean} isUpdate - True if validating update
 * @returns {Array} Array of validation errors
 */
function validateFunction(data, isUpdate = false) {
  const errors = [];

  // Required fields for creation
  if (!isUpdate) {
    const required = ['name', 'description', 'handler_type'];
    errors.push(...validateRequired(data, required));
  }

  // Name validation
  if (data.name !== undefined) {
    if (!isValidLength(data.name, 1, 100)) {
      errors.push({
        field: 'name',
        message: 'Name must be between 1 and 100 characters',
        code: 'INVALID_LENGTH'
      });
    }

    // Function names should be snake_case
    if (!/^[a-z_][a-z0-9_]*$/.test(data.name)) {
      errors.push({
        field: 'name',
        message: 'Name must be snake_case (lowercase letters, numbers, underscores)',
        code: 'INVALID_FORMAT'
      });
    }
  }

  // Handler type validation
  if (data.handler_type !== undefined) {
    const validTypes = ['api', 'inline'];
    if (!isValidEnum(data.handler_type, validTypes)) {
      errors.push({
        field: 'handler_type',
        message: `Handler type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // API endpoint validation (for API handlers)
  if (data.handler_type === 'api' && data.api_endpoint !== undefined) {
    if (!isValidUrl(data.api_endpoint)) {
      errors.push({
        field: 'api_endpoint',
        message: 'Invalid API endpoint URL',
        code: 'INVALID_URL'
      });
    }
  }

  // API method validation
  if (data.api_method !== undefined) {
    const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    if (!isValidEnum(data.api_method, validMethods)) {
      errors.push({
        field: 'api_method',
        message: `API method must be one of: ${validMethods.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // Execution mode validation
  if (data.execution_mode !== undefined) {
    const validModes = ['sync', 'async'];
    if (!isValidEnum(data.execution_mode, validModes)) {
      errors.push({
        field: 'execution_mode',
        message: `Execution mode must be one of: ${validModes.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  // Timeout validation
  if (data.timeout_ms !== undefined) {
    const timeout = parseInt(data.timeout_ms);
    if (isNaN(timeout) || !isInRange(timeout, 1000, 300000)) {
      errors.push({
        field: 'timeout_ms',
        message: 'Timeout must be between 1000 and 300000 milliseconds',
        code: 'INVALID_RANGE'
      });
    }
  }

  // Parameters validation (must be valid JSON object)
  if (data.parameters !== undefined) {
    if (typeof data.parameters === 'string') {
      if (!isValidJson(data.parameters)) {
        errors.push({
          field: 'parameters',
          message: 'Parameters must be valid JSON',
          code: 'INVALID_JSON'
        });
      }
    } else if (typeof data.parameters !== 'object') {
      errors.push({
        field: 'parameters',
        message: 'Parameters must be an object',
        code: 'INVALID_TYPE'
      });
    }
  }

  return errors;
}

/**
 * Validate chat message data
 * @param {Object} data - Message data
 * @returns {Array} Array of validation errors
 */
function validateChatMessage(data) {
  const errors = [];

  // Required fields
  const required = ['agent_id', 'message'];
  errors.push(...validateRequired(data, required));

  // Agent ID validation
  if (data.agent_id !== undefined && !isValidUUID(data.agent_id)) {
    errors.push({
      field: 'agent_id',
      message: 'Invalid agent ID format',
      code: 'INVALID_FORMAT'
    });
  }

  // Session ID validation (if provided)
  if (data.session_id !== undefined && data.session_id !== null) {
    if (!isValidUUID(data.session_id)) {
      errors.push({
        field: 'session_id',
        message: 'Invalid session ID format',
        code: 'INVALID_FORMAT'
      });
    }
  }

  // Message validation
  if (data.message !== undefined) {
    if (!isValidLength(data.message, 1, 10000)) {
      errors.push({
        field: 'message',
        message: 'Message must be between 1 and 10000 characters',
        code: 'INVALID_LENGTH'
      });
    }
  }

  // Image validation (if provided)
  if (data.image !== undefined && data.image !== null) {
    // Check if it's a valid base64 or URL
    const isBase64 = /^data:image\/(png|jpg|jpeg|gif|webp);base64,/.test(data.image);
    const isUrl = isValidUrl(data.image);

    if (!isBase64 && !isUrl) {
      errors.push({
        field: 'image',
        message: 'Image must be a valid base64 string or URL',
        code: 'INVALID_FORMAT'
      });
    }
  }

  return errors;
}

/**
 * Validate knowledge base creation/update data
 * @param {Object} data - KB data
 * @param {boolean} isUpdate - True if validating update
 * @returns {Array} Array of validation errors
 */
function validateKnowledgeBase(data, isUpdate = false) {
  const errors = [];

  // Required fields for creation
  if (!isUpdate) {
    const required = ['name'];
    errors.push(...validateRequired(data, required));
  }

  // Name validation
  if (data.name !== undefined) {
    if (!isValidLength(data.name, 1, 255)) {
      errors.push({
        field: 'name',
        message: 'Name must be between 1 and 255 characters',
        code: 'INVALID_LENGTH'
      });
    }
  }

  // Type validation
  if (data.type !== undefined) {
    const validTypes = ['general', 'product_catalog', 'faq', 'documentation'];
    if (!isValidEnum(data.type, validTypes)) {
      errors.push({
        field: 'type',
        message: `Type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  return errors;
}

/**
 * Validate document upload
 * @param {Object} file - File object from multer
 * @returns {Array} Array of validation errors
 */
function validateDocumentUpload(file) {
  const errors = [];

  if (!file) {
    errors.push({
      field: 'file',
      message: 'No file provided',
      code: 'REQUIRED'
    });
    return errors;
  }

  // File type validation
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,docx,pptx,xlsx,csv,txt,md,json,html')
    .split(',')
    .map(t => t.trim());

  if (!isValidFileType(file.originalname, allowedTypes)) {
    errors.push({
      field: 'file',
      message: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      code: 'INVALID_FILE_TYPE'
    });
  }

  // File size validation
  const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB || 50);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    errors.push({
      field: 'file',
      message: `File size exceeds maximum of ${maxSizeMB}MB`,
      code: 'FILE_TOO_LARGE'
    });
  }

  return errors;
}

/**
 * Validate credit addition
 * @param {Object} data - Credit data
 * @returns {Array} Array of validation errors
 */
function validateCreditAddition(data) {
  const errors = [];

  // Required fields
  const required = ['tenant_id', 'amount'];
  errors.push(...validateRequired(data, required));

  // Tenant ID validation
  if (data.tenant_id !== undefined && !isValidUUID(data.tenant_id)) {
    errors.push({
      field: 'tenant_id',
      message: 'Invalid tenant ID format',
      code: 'INVALID_FORMAT'
    });
  }

  // Amount validation
  if (data.amount !== undefined) {
    const amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0 || amount > 10000) {
      errors.push({
        field: 'amount',
        message: 'Amount must be between 0 and 10000',
        code: 'INVALID_RANGE'
      });
    }
  }

  return errors;
}

/**
 * Validate search query
 * @param {Object} data - Search data
 * @returns {Array} Array of validation errors
 */
function validateSearchQuery(data) {
  const errors = [];

  // Required fields
  const required = ['kb_id', 'query'];
  errors.push(...validateRequired(data, required));

  // KB ID validation
  if (data.kb_id !== undefined && !isValidUUID(data.kb_id)) {
    errors.push({
      field: 'kb_id',
      message: 'Invalid knowledge base ID format',
      code: 'INVALID_FORMAT'
    });
  }

  // Query validation
  if (data.query !== undefined) {
    if (!isValidLength(data.query, 1, 1000)) {
      errors.push({
        field: 'query',
        message: 'Query must be between 1 and 1000 characters',
        code: 'INVALID_LENGTH'
      });
    }
  }

  // Top K validation
  if (data.top_k !== undefined) {
    const topK = parseInt(data.top_k);
    const maxTopK = parseInt(process.env.MAX_TOP_K || 20);
    if (isNaN(topK) || !isInRange(topK, 1, maxTopK)) {
      errors.push({
        field: 'top_k',
        message: `Top K must be between 1 and ${maxTopK}`,
        code: 'INVALID_RANGE'
      });
    }
  }

  // Search type validation
  if (data.search_type !== undefined) {
    const validTypes = ['text', 'image', 'hybrid'];
    if (!isValidEnum(data.search_type, validTypes)) {
      errors.push({
        field: 'search_type',
        message: `Search type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_ENUM'
      });
    }
  }

  return errors;
}

/**
 * Validation middleware factory
 * Returns Express middleware that validates request data
 * @param {Function} validator - Validator function
 * @param {string} source - Source of data ('body', 'query', 'params')
 * @returns {Function} Express middleware
 */
function validate(validator, source = 'body') {
  return (req, res, next) => {
    const data = req[source];
    const errors = validator(data);

    if (errors.length > 0) {
      const ResponseBuilder = require('./response-builder');
      return res.status(422).json(
        ResponseBuilder.validationError(errors)
      );
    }

    next();
  };
}

module.exports = {
  // Validation error class
  ValidationError,

  // Basic validators
  validateRequired,
  isValidEmail,
  isValidUUID,
  isValidLength,
  isInRange,
  isValidEnum,
  isValidUrl,
  isValidFileType,
  isValidJson,

  // Complex validators
  validatePagination,
  validateAgent,
  validateFunction,
  validateChatMessage,
  validateKnowledgeBase,
  validateDocumentUpload,
  validateCreditAddition,
  validateSearchQuery,

  // Middleware factory
  validate
};