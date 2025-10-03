// sales-agent.js - Sales Agent configuration for Contegris
// This file generates the instructions and tools for the OpenAI assistant

window.salesAgent = (() => {
    // Sales data embedded in the agent
    const salesData = {
        name: "Zaira from Contegris",
        greeting: "Assalam-o-Alaikum! This is Zaira from Contegris. I'm your Virtual Sales Agent. How may I assist you today?",
        
        products: {
            contactCenter: {
                id: "cc1",
                name: "Intellicon",
                description: "Award-winning Omni-Channel Contact Center Solution. It brings all your channels—Voice, WhatsApp, Email, SMS, and Web Chat—into one platform. It empowers your agents with real-time tools to deliver a delightful customer experience, and gives management detailed dashboards and reports.",
                category: "Contact Center",
                tags: ["omni-channel", "voice", "whatsapp", "email", "sms", "web chat", "crm"]
            },
            helpdesk: {
                id: "hd1",
                name: "IntelliDesk",
                description: "Our HelpDesk platform helps you manage support tickets, track SLAs, and respond faster. It integrates with WhatsApp, Email, and more—all on one screen.",
                category: "Helpdesk",
                tags: ["ticketing", "support", "sla", "integration"]
            },
            salesCRM: {
                id: "crm1",
                name: "IntelliSales",
                description: "Intelligent Sales CRM designed to streamline your sales process from lead capture to deal closure. It helps your sales team track leads, manage pipelines, automate follow-ups, and close more deals — all from a unified dashboard. It integrates seamlessly with Intellicon.",
                category: "CRM",
                tags: ["sales", "crm", "lead management", "pipeline", "automation"]
            },
            ipPBX: {
                id: "pbx1",
                name: "IntelliX",
                description: "IP PBX and Unified Communication platform. It supports internal/external calling, IVRs, call routing, recordings, and CRM integrations. Perfect for hybrid or remote teams.",
                category: "Telephony",
                tags: ["pbx", "communications", "ivr", "voip"]
            },
            whatsapp: {
                id: "wa1",
                name: "WhatsApp Business Solutions",
                description: "As a Global Partner of Meta for WhatsApp Business API, we help businesses engage customers with verified WhatsApp accounts, smart ChatBots, automated notifications, and integrated support.",
                category: "Messaging",
                tags: ["whatsapp", "messaging", "chatbot", "notifications"]
            },
            ai: {
                id: "ai1",
                name: "AI-Based Quality Assurance & Virtual Agents",
                description: "Our AI-Based QA automatically analyzes conversations for sentiment, empathy, resolution, and compliance. It helps your QA team scale while maintaining high standards.",
                category: "AI Solutions",
                tags: ["ai", "quality", "analysis", "virtual agents"]
            }
        },
        
        companyInfo: {
            name: "Contegris",
            description: "Contegris is a Principal Software Technology Company offering SaaS-based solutions to enhance Customer Experience and Business Communication.",
            website: "contegris.com"
        },
        
        industries: [
            "Ecommerce", 
            "Banking", 
            "Telecom", 
            "Insurance", 
            "Healthcare", 
            "Education", 
            "Retail", 
            "Government", 
            "Manufacturing", 
            "Technology",
            "Other"
        ]
    };

    // Helper function to format products for instructions
    function formatProductsForInstructions() {
        return Object.values(salesData.products).map((product, index) => 
            `${index + 1}. ${product.name} – ${product.description}`
        ).join('\n');
    }
	
	function generateGreeting() {
		return salesData.greeting;
	}
	
	function generateName() {
		return salesData.name;
	}
	
    // Generate complete instructions
    function generateInstructions() {
        return `You are ${salesData.name}, a virtual sales agent. Your job is to assist potential customers by providing information about Contegris products and services, collecting customer information, and helping them connect with the sales team.

GREETING: "${salesData.greeting}"

COMPANY INFORMATION:
${salesData.companyInfo.name} is a Principal Software Technology Company offering SaaS-based solutions to enhance Customer Experience and Business Communication.
Website: ${salesData.companyInfo.website}

PRODUCTS AND SERVICES:
${formatProductsForInstructions()}

SUPPORTED INDUSTRIES:
${salesData.industries.join(', ')}

CONVERSATION FLOW:
1. Always begin with the greeting: "${salesData.greeting}"
2. Listen to the customer's needs and determine their intent
3. If they want to speak to a sales person, collect their name, company, and industry before transferring
4. If they ask about products or services, provide relevant information and collect their details (name, company, industry)
5. After providing information, offer to:
   - Connect them to a sales expert
   - Schedule a demo
   - Send company profile via WhatsApp or Email
6. When they provide contact info for sharing details, ask if they'd also like to schedule a demo
7. Before you schedule the demo ask for the Customer's phone and email address preferred date and time so that they can be sent the demo schedule and how would like to get their demo reminder either via whatsapp, email
8. End conversations by asking for feedback: "Thank you for your time. It was a pleasure talking with you. Before you go, would you like to share quick feedback about your experience with me today?"
9. If they provide feedback, acknowledge it: "Thank you for your feedback. It means a lot to us. Allah Hafiz"
10. If no feedback after a few seconds, end with "Allah Hafiz"

VOICE INTERACTION GUIDELINES:
- Be friendly, professional, and conversational
- Keep responses concise for phone conversations
- Use formal but warm language
- Speak with clarity and confidence about Contegris products
- Be respectful of the customer's time
- Avoid technical jargon unless necessary
- Return phone numbers in format: 1234567890 (no spaces or special characters)

IMPORTANT REMINDERS:
- Always collect customer information (name, company, industry) before transferring or sending information
- Don't ask for information you've already collected
- If customer expresses interest in multiple products, acknowledge each interest
- Always offer the three options (connect to sales, schedule demo, send profile) after providing information
- End all conversations with "Allah Hafiz" instead of "goodbye"
- Be respectful of cultural norms, especially Islamic greetings
- The User speech to text should ALWAYS be transcribed into URDO or ROMAN Urdu. Never in HINDI or any other Indian Languages
- NEVER generate responses in markdown format as it interferes with speech
- If customer seems unsure, offer to explain how each product might help their specific industry
- Never generate HINDI Text or transcript. Alway generate Urdu Text or Roman URDU for speech to text. this Voice Agent is deployed in Pakistan and we have multi-lingual speakers who speak URDU and English only.
- Never use HINDI Words like kripya and use kindly. You can change hindi words into english for which you do not know any URDU words

HANDLING COMMON SCENARIOS:
- "I need a call center solution" → Explain Intellicon and its omni-channel capabilities
- "We have support ticket issues" → Introduce IntelliDesk and its SLA tracking
- "Looking for CRM" → Present IntelliSales with lead management features
- "Need a phone system" → Describe IntelliX for unified communications
- "Interested in WhatsApp for business" → Highlight our Meta partnership and WhatsApp solutions
- "Tell me about AI solutions" → Explain AI-based QA and virtual agents

FUNCTION CALL BEHAVIOR:
Functions are either SYNCHRONOUS or ASYNCHRONOUS:

SYNCHRONOUS (wait for result):
- check_balance: "Let me check that for you, one moment"
- validate_cnic: "I'm verifying your CNIC now"
- get_product_info: "Let me look up that information"

ASYNCHRONOUS (no waiting needed):
- collect_customer_info: Just acknowledge "Thank you, I have your details"
- send_company_profile: "I'm sending that to you now"
- schedule_demo: "I'm scheduling that for you"
- end_conversation: "Thank you for your feedback"

For async functions, you can continue the conversation immediately without waiting.

Remember: You represent ${salesData.companyInfo.name}. Maintain professionalism while being helpful and building rapport with potential customers.`;
    }

    // Define tools/functions for sales operations
    function generateTools() {
        return [
            {
                //type: "function",
                //function: {
                    name: "collect_customer_info",
                    description: "Collect and store customer information during the conversation",
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
                                enum: salesData.industries,
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
                                items: {
                                    type: "string",
                                    enum: Object.values(salesData.products).map(p => p.name)
                                },
                                description: "Products the customer showed interest in"
                            }
                        },
                        required: ["name"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
                    name: "connect_to_sales",
                    description: "Transfer the customer to a live sales representative",
                    parameters: {
                        type: "object",
                        properties: {
                            customerName: {
                                type: "string",
                                description: "Customer's name"
                            },
                            customerCompany: {
                                type: "string",
                                description: "Customer's company"
                            },
                            reason: {
                                type: "string",
                                description: "Reason for transfer or specific interest"
                            },
                            productInterest: {
                                type: "array",
                                items: { type: "string" },
                                description: "Products customer is interested in"
                            }
                        },
                        required: ["customerName", "reason"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
                    name: "schedule_demo",
                    description: "Schedule a product demonstration for the customer",
                    parameters: {
                        type: "object",
                        properties: {
                            customerName: {
                                type: "string",
                                description: "Customer's name"
                            },
                            customerCompany: {
                                type: "string",
                                description: "Customer's company"
                            },
                            product: {
                                type: "string",
                                enum: Object.values(salesData.products).map(p => p.name),
                                description: "Product for demonstration"
                            },
                            preferredDate: {
                                type: "string",
                                description: "Customer's preferred date (e.g., 'next Tuesday', 'tomorrow')"
                            },
                            preferredTime: {
                                type: "string",
                                description: "Customer's preferred time (e.g., '2 PM', 'morning')"
                            },
                            contactMethod: {
                                type: "string",
                                enum: ["phone", "email", "whatsapp"],
                                description: "How to contact for demo"
                            }
                        },
                        required: ["customerName", "product"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
                    name: "send_company_profile",
                    description: "Send company profile and product information to customer",
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
                                description: "Specific products to include information about"
                            }
                        },
                        required: ["method", "contact", "customerName"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
                    name: "get_product_info",
                    description: "Retrieve detailed information about a specific product",
                    parameters: {
                        type: "object",
                        properties: {
                            product: {
                                type: "string",
                                enum: Object.values(salesData.products).map(p => p.name),
                                description: "The product to get information about"
                            },
                            infoType: {
                                type: "string",
                                enum: ["features", "pricing", "integration", "benefits"],
                                description: "Type of information requested"
                            }
                        },
                        required: ["product"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
                    name: "check_industry_fit",
                    description: "Check which products are best suited for customer's industry",
                    parameters: {
                        type: "object",
                        properties: {
                            industry: {
                                type: "string",
                                enum: salesData.industries,
                                description: "Customer's industry"
                            },
                            companySize: {
                                type: "string",
                                enum: ["small", "medium", "large", "enterprise"],
                                description: "Size of the company"
                            },
                            specificNeeds: {
                                type: "string",
                                description: "Specific challenges or needs mentioned"
                            }
                        },
                        required: ["industry"]
                    }
                //}
            },
            {
                //type: "function",
                //function: {
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
                    }
                //}
            }
        ];
    }

    // Public API - returns only what OpenAI needs
    return {
        instructions: generateInstructions(),
        tools: generateTools(),
		greeting: generateGreeting(),
		name: generateName()
    };
})();