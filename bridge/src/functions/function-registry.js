/**
 * Function Registry - Define all available functions with schemas
 */

const FunctionMode = require('./function-modes');

class FunctionRegistry {
    constructor() {
        this.functions = new Map();
    }
    
    /**
     * Register all standard functions
     */
    registerAll(executor, redisClient) {
        // Customer Information Collection
        this.register({
            name: "collect_customer_info",
			mode: FunctionMode.ASYNC,
            description: "Collect and store customer information during the conversation IMPORTANT: Before calling this function, tell the user 'I am setting up your account details, one moment please' or similar. This operation takes 2-3 seconds.",
            parameters: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Customer's full name"
                    },
                    company: {
                        type: "string",
                        description: "Customer's company name"
                    },
                    industry: {
                        type: "string",
                        description: "Customer's industry"
                    },
                    phone: {
                        type: "string",
                        description: "Customer's phone number (format: 1234567890)"
                    },
                    email: {
                        type: "string",
                        description: "Customer's email address"
                    },
                    interestedProducts: {
                        type: "array",
                        items: { type: "string" },
                        description: "Products the customer showed interest in"
                    }
                },
                required: ["name"]
            },
            handler: async (args, context) => {
                // Store in Redis
                const sessionKey = `customer_info:${context.sessionId}`;
                await redisClient.hSet(sessionKey, {
                    ...args,
                    collectedAt: new Date().toISOString(),
                    callerId: context.callerId
                });
                
                return {
                    stored: true,
                    customerName: args.name,
                    message: `Information collected for ${args.name}`
                };
            }
        }, executor);
        
        // External API Example - Check Balance
        this.register({
            name: "check_balance",
			mode: FunctionMode.SYNC, 
            description: "Check account balance for a customer",
            parameters: {
                type: "object",
                properties: {
                    last4digits: {
                        type: "string",
                        description: "Last 4 digits of account number"
                    }
                },
                required: ["last4digits"]
            },
            handler: async (args, context, executor) => {
                // Example: Call external banking API
                try {
                    const response = await executor.apiCall({
                        url: `${process.env.BANKING_API_URL}/accounts/balance`,
                        method: 'POST',
                        data: {
                            last4digits: args.last4digits,
                            customerId: context.callerId
                        },
                        headers: {
                            'Authorization': `Bearer ${process.env.BANKING_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    return response;
                    
                } catch (error) {
                    // Fallback to mock data for demo
                    const mockAccounts = {
                        '1234': {
                            accountNumber: "****1234",
                            accountType: "Savings",
                            balance: 45250.75,
                            currency: "PKR",
                            lastTransaction: "Deposit of PKR 5,000 on " + new Date().toLocaleDateString()
                        },
                        '5678': {
                            accountNumber: "****5678",
                            accountType: "Current",
                            balance: 125000.50,
                            currency: "PKR",
                            lastTransaction: "ATM withdrawal of PKR 10,000 on " + new Date().toLocaleDateString()
                        }
                    };
                    
                    return mockAccounts[args.last4digits] || { error: "Account not found" };
                }
            }
        }, executor);
        
        // CNIC Validation with External API
        this.register({
            name: "validate_cnic",
			mode: FunctionMode.SYNC, 
            description: "Validate customer's CNIC number",
            parameters: {
                type: "object",
                properties: {
                    cnicNumber: {
                        type: "string",
                        description: "CNIC number (with or without dashes)"
                    }
                },
                required: ["cnicNumber"]
            },
            handler: async (args, context, executor) => {
                try {
                    // Call external NADRA/verification API
                    const response = await executor.apiCall({
                        url: `${process.env.VERIFICATION_API_URL}/validate-cnic`,
                        method: 'POST',
                        data: {
                            cnic: args.cnicNumber.replace(/-/g, ''),
                            requestId: context.sessionId
                        },
                        headers: {
                            'Authorization': `Bearer ${process.env.VERIFICATION_API_KEY}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000,
                        retries: 2
                    });
                    
                    return response;
                    
                } catch (error) {
                    // Fallback for demo
                    const cleanCnic = args.cnicNumber.replace(/-/g, '');
                    if (cleanCnic === '3520227540581') {
                        return {
                            cnic_verified: true,
                            dob: '1983-09-14',
                            motherName: 'Zahida'
                        };
                    }
                    
                    return {
                        cnic_verified: false,
                        error: "CNIC not found or invalid"
                    };
                }
            }
        }, executor);
        
        // Schedule Demo with CRM API
        this.register({
            name: "schedule_demo",
			mode: FunctionMode.SYNC, 
            description: "Schedule a product demonstration for the customer. IMPORTANT: Before calling this function, tell the user 'I am scheduling your demo, one moment please' or similar. This operation takes 2-3 seconds.",
            parameters: {
                type: "object",
                properties: {
                    customerName: {
                        type: "string",
                        description: "Customer's name"
                    },
                    customerEmail: {
                        type: "string",
                        description: "Customer's email address"
                    },
                    customerPhone: {
                        type: "string",
                        description: "Customer's phone number"
                    },
                    product: {
                        type: "string",
                        description: "Product for demonstration"
                    },
                    preferredDate: {
                        type: "string",
                        description: "Preferred date (e.g., 'next Tuesday', 'tomorrow')"
                    },
                    preferredTime: {
                        type: "string",
                        description: "Preferred time (e.g., '2 PM', 'morning')"
                    }
                },
                required: ["customerName", "customerEmail", "product"]
            },
            handler: async (args, context, executor) => {
                try {
                    // Call CRM/Scheduling API
                    const response = await executor.apiCall({
                        url: `${process.env.CRM_API_URL}/schedule-demo`,
                        method: 'POST',
                        data: {
                            customer: {
                                name: args.customerName,
                                email: args.customerEmail,
                                phone: args.customerPhone
                            },
                            demo: {
                                product: args.product,
                                preferredDate: args.preferredDate,
                                preferredTime: args.preferredTime
                            },
                            source: 'voice_agent',
                            sessionId: context.sessionId
                        },
                        headers: {
                            'Authorization': `Bearer ${process.env.CRM_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    return {
                        scheduled: true,
                        confirmationId: response.confirmationId,
                        scheduledDate: response.scheduledDate,
                        message: `Demo scheduled for ${args.product}`
                    };
                    
                } catch (error) {
                    // Fallback: store in Redis for manual follow-up
                    const demoKey = `demo_request:${context.sessionId}`;
                    await redisClient.hSet(demoKey, {
                        ...args,
                        requestedAt: new Date().toISOString(),
                        status: 'pending'
                    });
                    
                    return {
                        scheduled: true,
                        confirmationId: `DEMO-${Date.now()}`,
                        message: `Demo request received. Our team will contact you within 24 hours.`
                    };
                }
            }
        }, executor);
        
        // Send Company Profile via WhatsApp/Email
        this.register({
            name: "send_company_profile",
			mode: FunctionMode.SYNC, 
            description: "Send company profile and product information. IMPORTANT: Before calling this function, tell the user 'I am sending you the required details, one moment please' or similar. This operation takes 2-3 seconds.",
            parameters: {
                type: "object",
                properties: {
                    method: {
                        type: "string",
                        enum: ["WhatsApp", "Email"],
                        description: "Method to send the profile"
                    },
                    contact: {
                        type: "string",
                        description: "Phone number for WhatsApp or email address"
                    },
                    customerName: {
                        type: "string",
                        description: "Customer's name"
                    },
                    specificProducts: {
                        type: "array",
                        items: { type: "string" },
                        description: "Specific products to include"
                    }
                },
                required: ["method", "contact", "customerName"]
            },
            handler: async (args, context, executor) => {
                try {
                    if (args.method === "WhatsApp") {
                        // Call WhatsApp Business API
                        await executor.apiCall({
                            url: `${process.env.WHATSAPP_API_URL}/send-template`,
                            method: 'POST',
                            data: {
                                to: args.contact,
                                template: 'company_profile',
                                parameters: {
                                    customerName: args.customerName,
                                    products: args.specificProducts
                                }
                            },
                            headers: {
                                'Authorization': `Bearer ${process.env.WHATSAPP_API_KEY}`
                            }
                        });
                    } else {
                        // Call Email API
                        await executor.apiCall({
                            url: `${process.env.EMAIL_API_URL}/send`,
                            method: 'POST',
                            data: {
                                to: args.contact,
                                subject: 'Contegris - Company Profile',
                                template: 'company_profile',
                                data: {
                                    customerName: args.customerName,
                                    products: args.specificProducts
                                }
                            },
                            headers: {
                                'Authorization': `Bearer ${process.env.EMAIL_API_KEY}`
                            }
                        });
                    }
                    
                    return {
                        sent: true,
                        method: args.method,
                        recipient: args.contact,
                        message: `Company profile sent via ${args.method}`
                    };
                    
                } catch (error) {
                    return {
                        sent: false,
                        error: error.message,
                        message: `Failed to send via ${args.method}. Our team will follow up manually.`
                    };
                }
            }
        }, executor);
        
        // Get Real-time Product Information
        this.register({
            name: "get_product_info",
			mode: FunctionMode.SYNC, 
            description: "Retrieve detailed real-time product information. IMPORTANT: Before calling this function, tell the user 'I am retrieving the required information, one moment please' or similar. This operation takes 2-3 seconds.",
            parameters: {
                type: "object",
                properties: {
                    product: {
                        type: "string",
                        description: "Product name"
                    },
                    infoType: {
                        type: "string",
                        enum: ["features", "pricing", "integration", "benefits"],
                        description: "Type of information requested"
                    }
                },
                required: ["product"]
            },
            handler: async (args, context, executor) => {
                try {
                    // Call product catalog API
                    const response = await executor.apiCall({
                        url: `${process.env.CATALOG_API_URL}/products/${encodeURIComponent(args.product)}`,
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${process.env.CATALOG_API_KEY}`
                        }
                    });
                    
                    // Filter by info type if specified
                    if (args.infoType && response[args.infoType]) {
                        return {
                            product: args.product,
                            infoType: args.infoType,
                            data: response[args.infoType]
                        };
                    }
                    
                    return response;
                    
                } catch (error) {
                    return {
                        error: "Product information temporarily unavailable",
                        message: "Please ask our sales team for detailed information"
                    };
                }
            }
        }, executor);
        
        // End Conversation with Feedback
        this.register({
            name: "end_conversation",
            description: "End the conversation and collect feedback",
            parameters: {
                type: "object",
                properties: {
                    feedback: {
                        type: "string",
                        description: "Customer feedback if provided"
                    },
                    rating: {
                        type: "integer",
                        minimum: 1,
                        maximum: 5,
                        description: "Customer rating if provided"
                    },
                    followUpRequested: {
                        type: "boolean",
                        description: "Whether customer wants a follow-up"
                    }
                }
            },
            handler: async (args, context) => {
                // Store feedback
                if (args.feedback || args.rating) {
                    const feedbackKey = `feedback:${context.sessionId}`;
                    await redisClient.hSet(feedbackKey, {
                        ...args,
                        sessionId: context.sessionId,
                        callerId: context.callerId,
                        timestamp: new Date().toISOString()
                    });
                }
                
                return {
                    acknowledged: true,
                    message: "Thank you for your feedback",
                    followUp: args.followUpRequested
                };
            }
        }, executor);
    }
    
    /**
     * Register a single function
     */
    register(functionDef, executor) {
        const { name, description, parameters, handler } = functionDef;
        
        this.functions.set(name, {
            name,
            description,
            parameters,
            handler
        });
        
        // Register with executor
        if (executor) {
            executor.registerFunction(name, handler);
        }
    }
    
    /**
     * Get OpenAI-formatted function definitions
     */
    getOpenAIFunctions() {
        return Array.from(this.functions.values()).map(func => ({
            type: "function",
            name: func.name,
            description: func.description,
            parameters: func.parameters
        }));
    }
    
    /**
     * Get function by name
     */
    getFunction(name) {
        return this.functions.get(name);
    }
    
    /**
     * List all function names
     */
    listFunctions() {
        return Array.from(this.functions.keys());
    }
}

module.exports = FunctionRegistry;