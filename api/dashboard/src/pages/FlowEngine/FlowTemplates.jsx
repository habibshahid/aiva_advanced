/**
 * Flow Engine - Flow Templates
 * 
 * Pre-built flow templates for common use cases:
 * - Lead Capture
 * - Appointment Booking
 * - Support Ticket
 * - Product Inquiry
 * - Feedback Collection
 * - E-commerce flows (Order Status, Complaints, etc.)
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Calendar,
  HeadphonesIcon,
  Package,
  Star,
  FileText,
  Check,
  ArrowRight,
  Truck,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Image,
  MessageSquare,
  PhoneForwarded,
  Palette,
  Wrench,
  PackageX
} from 'lucide-react';
import toast from 'react-hot-toast';
import { createFlow } from '../../services/flowEngineApi';

// Template definitions
const FLOW_TEMPLATES = [
  // ============================================================================
  // GENERAL TEMPLATES
  // ============================================================================
  {
    id: 'lead_capture',
    name: 'Lead Capture',
    description: 'Collect contact information from potential customers',
    icon: Users,
    color: 'blue',
    category: 'general',
    config: {
      trigger_examples: [
        'I want more information',
        'Contact me',
        'I\'m interested',
        'Call me back',
        'Get in touch'
      ],
      steps: [
        {
          id: 'collect_name',
          type: 'collect',
          config: {
            param: 'name',
            prompt: 'I\'d be happy to help! May I have your name?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_phone',
          type: 'collect',
          config: {
            param: 'phone',
            prompt: 'Thanks {{name}}! What\'s the best number to reach you?',
            param_type: 'phone'
          }
        },
        {
          id: 'collect_email',
          type: 'collect',
          config: {
            param: 'email',
            prompt: 'And your email address?',
            param_type: 'email'
          }
        }
      ],
      completion_message: 'Perfect! Our team will contact you shortly at {{phone}}. Is there anything else I can help with?',
      allow_kb_search: true,
      allow_context_switch: true
    }
  },
  {
    id: 'appointment_booking',
    name: 'Appointment Booking',
    description: 'Schedule appointments with customers',
    icon: Calendar,
    color: 'green',
    category: 'general',
    config: {
      trigger_examples: [
        'Book an appointment',
        'Schedule a meeting',
        'I want to make an appointment',
        'Can I schedule a call?',
        'Set up a consultation'
      ],
      steps: [
        {
          id: 'collect_name',
          type: 'collect',
          config: {
            param: 'name',
            prompt: 'I\'d be happy to schedule an appointment for you! May I have your name?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_service',
          type: 'collect',
          config: {
            param: 'service_type',
            prompt: 'What type of service are you interested in?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_date',
          type: 'collect',
          config: {
            param: 'preferred_date',
            prompt: 'What date works best for you?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_time',
          type: 'collect',
          config: {
            param: 'preferred_time',
            prompt: 'And what time would you prefer?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_phone',
          type: 'collect',
          config: {
            param: 'phone',
            prompt: 'Finally, what\'s your contact number in case we need to reach you?',
            param_type: 'phone'
          }
        }
      ],
      completion_message: 'Great! I\'ve noted your appointment request for {{preferred_date}} at {{preferred_time}}. Our team will confirm shortly. Thank you, {{name}}!',
      allow_kb_search: true,
      allow_context_switch: false
    }
  },
  {
    id: 'support_ticket',
    name: 'Support Ticket',
    description: 'Create support tickets for customer issues',
    icon: HeadphonesIcon,
    color: 'orange',
    category: 'general',
    config: {
      trigger_examples: [
        'I have a problem',
        'Something is broken',
        'I need help',
        'Report an issue',
        'Create a ticket'
      ],
      steps: [
        {
          id: 'collect_issue',
          type: 'collect',
          config: {
            param: 'issue_description',
            prompt: 'I\'m sorry to hear you\'re having trouble. Could you please describe the issue you\'re experiencing?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_priority',
          type: 'collect',
          config: {
            param: 'priority',
            prompt: 'How urgent is this issue? (low, medium, or high)',
            param_type: 'string'
          }
        },
        {
          id: 'collect_contact',
          type: 'collect',
          config: {
            param: 'contact_email',
            prompt: 'What email should we use to update you on this issue?',
            param_type: 'email'
          }
        }
      ],
      completion_message: 'I\'ve created a support ticket for your issue. Our team will review it and get back to you at {{contact_email}}. Is there anything else I can help with?',
      allow_kb_search: true,
      allow_context_switch: true
    }
  },
  {
    id: 'feedback_collection',
    name: 'Feedback Collection',
    description: 'Collect customer feedback and reviews',
    icon: Star,
    color: 'yellow',
    category: 'general',
    config: {
      trigger_examples: [
        'I want to give feedback',
        'Leave a review',
        'Rate my experience',
        'Share my opinion',
        'Provide feedback'
      ],
      steps: [
        {
          id: 'collect_rating',
          type: 'collect',
          config: {
            param: 'rating',
            prompt: 'We\'d love to hear your feedback! On a scale of 1-5, how would you rate your experience?',
            param_type: 'number'
          }
        },
        {
          id: 'collect_feedback',
          type: 'collect',
          config: {
            param: 'feedback_text',
            prompt: 'Thank you! Could you share more details about your experience?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_improvements',
          type: 'collect',
          config: {
            param: 'improvement_suggestions',
            prompt: 'Is there anything we could have done better?',
            param_type: 'string'
          }
        }
      ],
      completion_message: 'Thank you so much for your feedback! We truly appreciate you taking the time to help us improve.',
      allow_kb_search: false,
      allow_context_switch: true
    }
  },
  {
    id: 'quote_request',
    name: 'Quote Request',
    description: 'Collect information for price quotes',
    icon: FileText,
    color: 'teal',
    category: 'general',
    config: {
      trigger_examples: [
        'Get a quote',
        'How much does it cost?',
        'Price estimate',
        'Request pricing',
        'I need a quote'
      ],
      steps: [
        {
          id: 'collect_service',
          type: 'collect',
          config: {
            param: 'service_needed',
            prompt: 'I\'d be happy to provide a quote! What service are you interested in?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_details',
          type: 'collect',
          config: {
            param: 'project_details',
            prompt: 'Can you tell me more about your specific requirements?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_timeline',
          type: 'collect',
          config: {
            param: 'timeline',
            prompt: 'When do you need this completed?',
            param_type: 'string'
          }
        },
        {
          id: 'collect_contact',
          type: 'collect',
          config: {
            param: 'contact_info',
            prompt: 'Where should we send the quote? (email or phone)',
            param_type: 'string'
          }
        }
      ],
      completion_message: 'Thank you! We\'ll prepare a detailed quote and send it to {{contact_info}} within 24 hours.',
      allow_kb_search: true,
      allow_context_switch: true
    }
  },
  
  // ============================================================================
  // E-COMMERCE TEMPLATES
  // ============================================================================
  {
    id: 'order_status',
    name: 'Order Status',
    description: 'Check delivery status, tracking info, and order details',
    icon: Truck,
    color: 'blue',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'where is my order',
        'track my order',
        'order status',
        'when will my order arrive',
        'check order',
        'delivery status',
        'mera order kahan hai',
        'order ka status',
        'tracking',
        'parcel kahan hai'
      ],
      steps: [
        {
          id: 'step_collect_identifier',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I\'d be happy to check your order status! Please share your order number, phone number, or email address.',
            param_type: 'string',
            retry_prompt: 'Please provide a valid order number (e.g., CZ-247020), phone number (e.g., 03001234567), or email address.'
          }
        },
        {
          id: 'step_lookup_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            params_map: {
              order_identifier: '{{order_identifier}}'
            },
            auto_respond: true,
            response_instructions: 'Share order details: Order Number, Order Date, Status, Tracking info if available. Write URLs directly without markdown.'
          }
        }
      ],
      completion_message: 'Is there anything else I can help you with?',
      allow_kb_search: true,
      allow_context_switch: true,
      required_functions: ['check_order_status']
    }
  },
  {
    id: 'product_inquiry_ecom',
    name: 'Product Search',
    description: 'Search products by SKU, description, or image. Show availability and prices.',
    icon: ShoppingBag,
    color: 'purple',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'show me',
        'find',
        'search for',
        'looking for',
        'do you have',
        'I want',
        'can I see',
        'price',
        'available',
        'sizes',
        'dikhao',
        'chahiye',
        'kitne ka hai'
      ],
      steps: [
        {
          id: 'step_search_products',
          type: 'function',
          config: {
            function: 'search_products',
            params_map: {
              query: '{{user_message}}',
              image: '{{image_url}}'
            },
            auto_respond: true,
            response_instructions: 'Present product results: Product Name, Available Sizes, Price. If no products found, offer to show latest collection.'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: true,
      allow_context_switch: true,
      required_functions: ['search_products']
    }
  },
  {
    id: 'damaged_article',
    name: 'Damaged Article Complaint',
    description: 'Handle complaints about damaged/broken/defective items. Requires pictures.',
    icon: AlertTriangle,
    color: 'red',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'damaged',
        'broken',
        'defective',
        'torn',
        'crack',
        'scratched',
        'toot gaya',
        'nuqsan',
        'kharab',
        'phat gaya',
        'damage ho gaya'
      ],
      steps: [
        {
          id: 'step_get_order',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I\'m sorry to hear that your item is damaged. Please provide your Order ID, email, or phone number.',
            next_step: 'step_verify_order',
            param_type: 'string',
            accept_image_input: true,
            image_extraction_hints: 'Look for Order Number (CZ-XXXXX), Phone Number, or Email'
          }
        },
        {
          id: 'step_verify_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_ask_pictures',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: true,
            store_result_as: 'order_details'
          }
        },
        {
          id: 'step_ask_pictures',
          type: 'collect',
          config: {
            param: 'complaint_images',
            prompt: 'Please share pictures of the damaged article so we can process your complaint.',
            next_step: 'step_create_ticket',
            param_type: 'image[]'
          }
        },
        {
          id: 'step_create_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              images: '{{complaint_images}}',
              order_number: '{{order_details.order.order_number}}',
              complaint_type: 'DAMAGED_ARTICLE',
              customer_email: '{{order_details.order.customer_email}}',
              customer_phone: '{{order_details.order.customer_phone}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [ticket_number]. Our team will contact you shortly."'
          }
        }
      ],
      completion_message: 'Is there anything else I can help you with?',
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['check_order_status', 'create_ticket']
    }
  },
  {
    id: 'delivery_issue',
    name: 'Delivery Issue',
    description: 'Handle complaints about delivery issues or orders marked delivered but not received.',
    icon: PackageX,
    color: 'orange',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'not received',
        'order not delivered',
        'delivery issue',
        'didn\'t receive',
        'shows delivered',
        'marked delivered',
        'where is my delivery',
        'nahi mila',
        'deliver nahi hua',
        'mila nahi'
      ],
      steps: [
        {
          id: 'step_get_order',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I understand you haven\'t received your order. Please provide your Order ID, email, or phone number.',
            next_step: 'step_check_status',
            param_type: 'string'
          }
        },
        {
          id: 'step_check_status',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_evaluate_status',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: false,
            store_result_as: 'order_details'
          }
        },
        {
          id: 'step_evaluate_status',
          type: 'condition',
          config: {
            check: '{{order_details.order.status}}',
            branches: {
              'delivered': 'step_delivered_not_received',
              'default': 'step_in_transit'
            }
          }
        },
        {
          id: 'step_in_transit',
          type: 'message',
          config: {
            text: 'Your order is currently in transit. Expected delivery is within 3-5 working days from order date. Please wait for the delivery.',
            auto_respond: true
          }
        },
        {
          id: 'step_delivered_not_received',
          type: 'collect',
          config: {
            param: 'customer_contact',
            prompt: 'I see your order is marked as delivered but you haven\'t received it. This is concerning. Please provide your full name and phone number so we can escalate this matter.',
            next_step: 'step_create_delivery_ticket',
            param_type: 'string'
          }
        },
        {
          id: 'step_create_delivery_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              order_number: '{{order_details.order.order_number}}',
              complaint_type: 'DELIVERY_ISSUE',
              delivery_status: '{{order_details.order.status}}',
              customer_contact: '{{customer_contact}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [ticket_number]. Our team will contact you shortly."'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['check_order_status', 'create_ticket']
    }
  },
  {
    id: 'size_exchange',
    name: 'Size Exchange',
    description: 'Handle size exchange requests - guide customer through return process.',
    icon: RefreshCw,
    color: 'teal',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'size exchange',
        'wrong size',
        'size issue',
        'doesn\'t fit',
        'too big',
        'too small',
        'exchange size',
        'change size',
        'size galat',
        'fit nahi ho raha',
        'tight hai',
        'loose hai'
      ],
      steps: [
        {
          id: 'step_size_response',
          type: 'message',
          config: {
            text: 'Please return the parcel to the address mentioned on the package and share the return tracking ID within 3 days. Once received, we\'ll send the required size or a coupon of equal value within 10-15 working days.',
            text_urdu: 'Please parcel ko package par likhe address par return karein aur 3 din ke andar return tracking ID share karein. Receipt ke baad, hum required size ya equal value ka coupon 10-15 working days mein send karenge.',
            llm_instructions: 'Respond with the defined message text in the User\'s language and move on.'
          }
        }
      ],
      completion_message: 'Is there anything else I can help you with?',
      allow_kb_search: true,
      allow_context_switch: true,
      required_functions: []
    }
  },
  {
    id: 'color_issue',
    name: 'Color Issue Complaint',
    description: 'Handle complaints about wrong color received. Requires pictures.',
    icon: Palette,
    color: 'pink',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'wrong color',
        'color issue',
        'different color',
        'color not matching',
        'galat color',
        'ghalat color',
        'rang galat',
        'color different hai'
      ],
      steps: [
        {
          id: 'step_get_order',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I\'m sorry to hear that you received the wrong color. Please provide your Order ID, email, or phone number.',
            next_step: 'step_verify_order',
            param_type: 'string'
          }
        },
        {
          id: 'step_verify_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_ask_pictures',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: false,
            store_result_as: 'order_details'
          }
        },
        {
          id: 'step_ask_pictures',
          type: 'collect',
          config: {
            param: 'complaint_images',
            prompt: 'Please share pictures showing the color difference so we can process your complaint.',
            next_step: 'step_create_ticket',
            param_type: 'image[]'
          }
        },
        {
          id: 'step_create_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              images: '{{complaint_images}}',
              order_number: '{{order_details.order.order_number}}',
              complaint_type: 'COLOR_ISSUE',
              customer_email: '{{order_details.order.customer_email}}',
              customer_phone: '{{order_details.order.customer_phone}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [ticket_number]. Our team will contact you shortly."'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['check_order_status', 'create_ticket']
    }
  },
  {
    id: 'manufacturing_issue',
    name: 'Manufacturing Issue',
    description: 'Handle complaints about manufacturing defects, stitching issues, quality problems.',
    icon: Wrench,
    color: 'gray',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'manufacturing defect',
        'stitching issue',
        'quality problem',
        'defect',
        'stitching',
        'seam',
        'sole coming off',
        'glue issue',
        'silai kharab',
        'quality issue'
      ],
      steps: [
        {
          id: 'step_get_order',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I\'m sorry to hear about the manufacturing issue. Please provide your Order ID, email, or phone number.',
            next_step: 'step_verify_order',
            param_type: 'string'
          }
        },
        {
          id: 'step_verify_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_ask_pictures',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: false,
            store_result_as: 'order_details'
          }
        },
        {
          id: 'step_ask_pictures',
          type: 'collect',
          config: {
            param: 'complaint_images',
            prompt: 'Please share pictures of the manufacturing defect so we can process your complaint.',
            next_step: 'step_create_ticket',
            param_type: 'image[]'
          }
        },
        {
          id: 'step_create_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              images: '{{complaint_images}}',
              order_number: '{{order_details.order.order_number}}',
              complaint_type: 'MANUFACTURING_ISSUE',
              customer_email: '{{order_details.order.customer_email}}',
              customer_phone: '{{order_details.order.customer_phone}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [ticket_number]. Our team will contact you shortly."'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['check_order_status', 'create_ticket']
    }
  },
  {
    id: 'missing_article',
    name: 'Missing Article',
    description: 'Handle complaints about missing items in package. No pictures needed.',
    icon: Package,
    color: 'orange',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'missing item',
        'item not in package',
        'incomplete order',
        'missing',
        'item nahi mila',
        'package mein nahi tha',
        'incomplete',
        'missing article'
      ],
      steps: [
        {
          id: 'step_get_order',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I\'m sorry to hear that an item is missing from your order. Please provide your Order ID, email, or phone number.',
            next_step: 'step_verify_order',
            param_type: 'string'
          }
        },
        {
          id: 'step_verify_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_ask_parcel_condition',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: false,
            store_result_as: 'order_details'
          }
        },
        {
          id: 'step_ask_parcel_condition',
          type: 'collect',
          config: {
            param: 'parcel_opened',
            prompt: 'Was the parcel already opened when you received it?',
            next_step: 'step_create_ticket',
            param_type: 'string'
          }
        },
        {
          id: 'step_create_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              order_number: '{{order_details.order.order_number}}',
              parcel_opened: '{{parcel_opened}}',
              complaint_type: 'MISSING_ARTICLE',
              customer_email: '{{order_details.order.customer_email}}',
              customer_phone: '{{order_details.order.customer_phone}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "We apologize for the inconvenience. Your concern has been noted. Here is your ticket number: [ticket_number]. Our team will contact you shortly."'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['check_order_status', 'create_ticket']
    }
  },
  {
    id: 'service_complaint',
    name: 'Service Complaint',
    description: 'Handle complaints about service, staff behavior, or courier issues.',
    icon: HeadphonesIcon,
    color: 'red',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'bad service',
        'rude',
        'staff behavior',
        'courier issue',
        'service complaint',
        'unprofessional',
        'poor service',
        'badtameez',
        'service kharab',
        'courier ne',
        'delivery boy'
      ],
      steps: [
        {
          id: 'step_get_details',
          type: 'collect',
          config: {
            param: 'complaint_details',
            prompt: 'I\'m sorry to hear about your experience. Please tell me the specific details of the issue you faced.',
            next_step: 'step_get_name',
            param_type: 'string'
          }
        },
        {
          id: 'step_get_name',
          type: 'collect',
          config: {
            param: 'customer_name',
            prompt: 'May I have your name please?',
            next_step: 'step_get_contact',
            param_type: 'string'
          }
        },
        {
          id: 'step_get_contact',
          type: 'collect',
          config: {
            param: 'customer_contact',
            prompt: 'Please share your phone number or email for correspondence.',
            next_step: 'step_create_ticket',
            param_type: 'string'
          }
        },
        {
          id: 'step_create_ticket',
          type: 'function',
          config: {
            function: 'create_ticket',
            params_map: {
              customer_name: '{{customer_name}}',
              complaint_type: 'SERVICE_COMPLAINT',
              customer_contact: '{{customer_contact}}',
              complaint_details: '{{complaint_details}}'
            },
            auto_respond: true,
            response_instructions: 'Respond: "Your query has been noted and forwarded to the concerned department. You will receive a response as soon as possible."'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: false,
      allow_context_switch: false,
      required_functions: ['create_ticket']
    }
  },
  {
    id: 'human_handoff',
    name: 'Human Handoff',
    description: 'Transfer conversation to human agent',
    icon: PhoneForwarded,
    color: 'blue',
    category: 'ecommerce',
    config: {
      trigger_examples: [
        'talk to human',
        'speak to agent',
        'connect me to support',
        'I want to talk to a person',
        'real person please'
      ],
      steps: [
        {
          id: 'confirm_handoff',
          type: 'message',
          config: {
            text: 'I\'ll connect you with our support team right away.'
          }
        },
        {
          id: 'execute_handoff',
          type: 'function',
          config: {
            function: 'transfer_to_agent'
          }
        }
      ],
      completion_message: null,
      allow_kb_search: true,
      allow_context_switch: false,
      required_functions: ['transfer_to_agent']
    }
  },
  {
    id: 'image_intent_classifier',
    name: 'Image Intent Classifier',
    description: 'Analyze uploaded images to determine user intent (order lookup vs product search)',
    icon: Image,
    color: 'indigo',
    category: 'ecommerce',
    config: {
      trigger_examples: [],
      steps: [
        {
          id: 'step_analyze_image',
          type: 'collect',
          config: {
            param: 'order_identifier',
            prompt: 'I see you have shared an image. Let me check if I can find any order information from it...',
            next_step: 'step_check_identifier',
            param_type: 'string',
            llm_instructions: 'Analyze the image and extract order identifiers. If you find an order number, phone, or email - extract it as the value.',
            accept_image_input: true,
            image_extraction_hints: 'Look for: Order Number (CZ-XXXXX), Phone Number (Pakistani format), Email Address, Tracking Number'
          }
        },
        {
          id: 'step_check_identifier',
          type: 'condition',
          config: {
            check: '{{order_identifier}}',
            branches: {
              '_empty': 'step_ask_intent',
              '_hasValue': 'step_lookup_order'
            }
          }
        },
        {
          id: 'step_lookup_order',
          type: 'function',
          config: {
            function: 'check_order_status',
            next_step: 'step_ask_next_action',
            params_map: { order_identifier: '{{order_identifier}}' },
            auto_respond: true,
            store_result_as: 'order_details',
            response_instructions: 'Share the order details with the customer. Ask how you can help them with this order.'
          }
        },
        {
          id: 'step_ask_next_action',
          type: 'collect',
          config: {
            param: 'user_intent',
            prompt: 'How can I help you with this order?\n\n1. Track delivery\n2. Report a problem\n3. Request return/exchange\n4. Something else',
            param_type: 'string',
            llm_instructions: 'Understand what the user wants to do with their order and route accordingly'
          }
        },
        {
          id: 'step_ask_intent',
          type: 'collect',
          config: {
            param: 'image_intent',
            prompt: 'I see you have shared an image! How can I help?\n\n1. Find similar products\n2. Report a problem with this item\n3. Something else\n\nJust reply with 1, 2, or 3, or describe what you need.',
            param_type: 'string'
          }
        }
      ],
      completion_message: 'Is there anything else I can help you with?',
      allow_kb_search: true,
      allow_context_switch: true,
      required_functions: ['check_order_status']
    }
  }
];

const colorClasses = {
  blue: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    border: 'border-blue-300',
    hover: 'hover:border-blue-400'
  },
  green: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    hover: 'hover:border-green-400'
  },
  orange: {
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    border: 'border-orange-300',
    hover: 'hover:border-orange-400'
  },
  purple: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    border: 'border-purple-300',
    hover: 'hover:border-purple-400'
  },
  yellow: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    hover: 'hover:border-yellow-400'
  },
  teal: {
    bg: 'bg-teal-100',
    text: 'text-teal-700',
    border: 'border-teal-300',
    hover: 'hover:border-teal-400'
  },
  red: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    hover: 'hover:border-red-400'
  },
  pink: {
    bg: 'bg-pink-100',
    text: 'text-pink-700',
    border: 'border-pink-300',
    hover: 'hover:border-pink-400'
  },
  gray: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    border: 'border-gray-300',
    hover: 'hover:border-gray-400'
  },
  indigo: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-700',
    border: 'border-indigo-300',
    hover: 'hover:border-indigo-400'
  }
};

const FlowTemplates = () => {
  const { agentId } = useParams();
  const navigate = useNavigate();
  
  const [creating, setCreating] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  
  const handleCreateFromTemplate = async (template) => {
    try {
      setCreating(template.id);
      
      await createFlow(agentId, {
        name: template.name,
        description: template.description,
        config: template.config
      });
      
      toast.success(`${template.name} flow created!`);
      navigate(`/agents/${agentId}/flows`);
      
    } catch (error) {
      console.error('Error creating flow:', error);
      toast.error('Failed to create flow');
    } finally {
      setCreating(null);
    }
  };
  
  // Filter templates by category
  const filteredTemplates = activeCategory === 'all' 
    ? FLOW_TEMPLATES 
    : FLOW_TEMPLATES.filter(t => t.category === activeCategory);
  
  // Get category counts
  const generalCount = FLOW_TEMPLATES.filter(t => t.category === 'general').length;
  const ecommerceCount = FLOW_TEMPLATES.filter(t => t.category === 'ecommerce').length;
  
  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(`/agents/${agentId}/flows`)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Flow Templates</h1>
          <p className="text-gray-500 mt-1">
            Choose a template to quickly create a new conversation flow
          </p>
        </div>
      </div>
      
      {/* Category Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeCategory === 'all' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Templates ({FLOW_TEMPLATES.length})
        </button>
        <button
          onClick={() => setActiveCategory('general')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeCategory === 'general' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          General ({generalCount})
        </button>
        <button
          onClick={() => setActiveCategory('ecommerce')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeCategory === 'ecommerce' 
              ? 'bg-purple-600 text-white' 
              : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
          }`}
        >
          🛒 E-Commerce ({ecommerceCount})
        </button>
      </div>
      
      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => {
          const Icon = template.icon;
          const colors = colorClasses[template.color] || colorClasses.blue;
          const isSelected = selectedTemplate === template.id;
          
          return (
            <div
              key={template.id}
              className={`bg-white rounded-lg border-2 p-5 cursor-pointer transition-all ${
                isSelected ? colors.border : 'border-gray-200'
              } ${colors.hover}`}
              onClick={() => setSelectedTemplate(isSelected ? null : template.id)}
            >
              {/* Icon and Title */}
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${colors.bg}`}>
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>
                <div className="flex items-center gap-2">
                  {template.category === 'ecommerce' && (
                    <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                      E-Commerce
                    </span>
                  )}
                  {isSelected && (
                    <Check className={`w-5 h-5 ${colors.text}`} />
                  )}
                </div>
              </div>
              
              <h3 className="font-semibold text-gray-800 mt-3">{template.name}</h3>
              <p className="text-gray-500 text-sm mt-1">{template.description}</p>
              
              {/* Triggers Preview */}
              <div className="mt-3">
                <div className="flex flex-wrap gap-1">
                  {template.config.trigger_examples.slice(0, 3).map((trigger, i) => (
                    <span 
                      key={i}
                      className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
                    >
                      "{trigger}"
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Steps Count & Required Functions */}
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                <span>{template.config.steps.length} steps</span>
                {template.config.required_functions?.length > 0 && (
                  <span className="text-orange-500">
                    ⚡ {template.config.required_functions.length} function{template.config.required_functions.length > 1 ? 's' : ''} required
                  </span>
                )}
              </div>
              
              {/* Expanded Content */}
              {isSelected && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Steps:</h4>
                  <div className="space-y-2">
                    {template.config.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-5 h-5 flex items-center justify-center bg-gray-100 rounded-full text-xs">
                          {i + 1}
                        </span>
                        <span className="capitalize">
                          {step.type === 'collect' && `Collect ${step.config.param}`}
                          {step.type === 'function' && `Call ${step.config.function}`}
                          {step.type === 'message' && 'Send message'}
                          {step.type === 'condition' && 'Check condition'}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Required Functions Warning */}
                  {template.config.required_functions?.length > 0 && (
                    <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                      ⚠️ Requires: {template.config.required_functions.join(', ')}
                    </div>
                  )}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateFromTemplate(template);
                    }}
                    disabled={creating === template.id}
                    className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-colors ${colors.bg} ${colors.text} hover:opacity-80`}
                  >
                    {creating === template.id ? (
                      <>Creating...</>
                    ) : (
                      <>
                        Use This Template
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Custom Flow Option */}
      <div className="mt-6 text-center">
        <p className="text-gray-500 text-sm">
          Want to build from scratch?{' '}
          <button
            onClick={() => navigate(`/agents/${agentId}/flows/new`)}
            className="text-blue-500 hover:text-blue-600 font-medium"
          >
            Create a custom flow
          </button>
        </p>
      </div>
    </div>
  );
};

export default FlowTemplates;