const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
require('dotenv').config();

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AIVA API Documentation',
      version: '1.0.0',
      description: `
Complete API documentation for AIVA - AI Voice & Chat Platform

## Authentication

This API supports two authentication methods:

### 1. Bearer Token (JWT)
Use for dashboard/frontend applications:
- Login to get token: POST /api/auth/login
- Use in Authorization header: \`Authorization: Bearer YOUR_TOKEN\`

### 2. API Key
Use for server-to-server integrations:
- Generate API key: POST /api/auth/api-key/generate (requires Bearer token)
- Use in X-API-Key header: \`X-API-Key: YOUR_API_KEY\`

**Important:** Chat endpoints accept BOTH authentication methods. Choose whichever fits your use case.
      `,
      contact: {
        name: 'AIVA Support',
        email: 'support@aiva.ai',
        url: 'https://aiva.ai'
      }
    },
    servers: [
      {
        url: process.env.MANAGEMENT_API_URL || 'http://localhost:62001',
        description: 'API Server'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token from /api/auth/login - Use for frontend/dashboard access'
        },
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API Key for programmatic access - Generate via /api/auth/api-key/generate'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  example: 'Invalid request'
                },
                details: {
                  type: 'object'
                }
              }
            }
          }
        },
        ChatSession: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            tenant_id: {
              type: 'string',
              format: 'uuid'
            },
            agent_id: {
              type: 'string',
              format: 'uuid'
            },
            user_id: {
              type: 'string',
              format: 'uuid'
            },
            session_name: {
              type: 'string',
              example: 'Customer Support Chat'
            },
            status: {
              type: 'string',
              enum: ['active', 'ended'],
              example: 'active'
            },
            total_messages: {
              type: 'integer',
              example: 5
            },
            total_cost: {
              type: 'number',
              example: 0.0025
            },
            start_time: {
              type: 'string',
              format: 'date-time'
            },
            end_time: {
              type: 'string',
              format: 'date-time',
              nullable: true
            }
          }
        },
        ChatMessageRequest: {
          type: 'object',
          required: ['agent_id', 'message'],
          properties: {
            session_id: {
              type: 'string',
              format: 'uuid',
              description: 'Existing session ID (optional for first message)'
            },
            agent_id: {
              type: 'string',
              format: 'uuid',
              description: 'Agent ID to use for this conversation'
            },
            message: {
              type: 'string',
              minLength: 1,
              maxLength: 4000,
              example: 'What are your business hours?'
            },
            image: {
              type: 'string',
              description: 'Base64 encoded image (optional)',
              format: 'byte'
            }
          }
        },
        ChatMessageResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  format: 'uuid'
                },
                message_id: {
                  type: 'string',
                  format: 'uuid'
                },
                agent_transfer: {
                  type: 'boolean',
                  description: 'True if agent transfer to human is requested',
                  example: false
                },
                response: {
                  type: 'object',
                  properties: {
                    text: {
                      type: 'string',
                      example: 'Our business hours are Monday-Friday, 9 AM - 5 PM EST.'
                    },
                    html: {
                      type: 'string',
                      example: '<p>Our business hours are Monday-Friday, 9 AM - 5 PM EST.</p>'
                    },
                    markdown: {
                      type: 'string',
                      example: 'Our business hours are **Monday-Friday**, 9 AM - 5 PM EST.'
                    }
                  }
                },
                sources: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        type: 'string',
                        example: 'document'
                      },
                      source_id: {
                        type: 'string'
                      },
                      title: {
                        type: 'string'
                      },
                      content: {
                        type: 'string'
                      },
                      relevance_score: {
                        type: 'number'
                      }
                    }
                  }
                },
                images: {
                  type: 'array',
                  items: {
                    type: 'object'
                  }
                },
                products: {
                  type: 'array',
                  items: {
                    type: 'object'
                  }
                },
                cost: {
                  type: 'number',
                  example: 0.0005
                }
              }
            },
            credits: {
              type: 'object',
              properties: {
                cost: {
                  type: 'number',
                  example: 0.0005
                },
                remaining_balance: {
                  type: 'number',
                  example: 9.9995
                }
              }
            }
          }
        },
        Agent: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid'
            },
            tenant_id: {
              type: 'string',
              format: 'uuid'
            },
            name: {
              type: 'string',
              example: 'Customer Support Bot'
            },
            type: {
              type: 'string',
              enum: ['customer_support', 'sales', 'technical', 'general']
            },
            provider: {
              type: 'string',
              enum: ['openai', 'deepgram'],
              default: 'openai'
            },
            model: {
              type: 'string',
              example: 'gpt-4o-mini'
            },
            voice: {
              type: 'string',
              example: 'alloy'
            },
            instructions: {
              type: 'string'
            },
            greeting: {
              type: 'string'
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive']
            },
            created_at: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required - Missing or invalid token/API key',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'UNAUTHORIZED',
                  message: 'No token provided'
                }
              }
            }
          }
        },
        InsufficientCredits: {
          description: 'Insufficient credits to perform operation',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error'
              },
              example: {
                success: false,
                error: {
                  code: 'INSUFFICIENT_CREDITS',
                  message: 'Insufficient credits to perform this operation',
                  details: {
                    current_balance: 0.0001
                  }
                }
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and API key management'
      },
      {
        name: 'Chat',
        description: 'Chat sessions and messaging (Supports both Bearer and API Key auth)'
      },
      {
        name: 'Agents',
        description: 'AI agent management'
      },
      {
        name: 'Knowledge',
        description: 'Knowledge base management'
      }
    ]
  },
  apis: ['./src/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };


