/**
 * Agent Editor Constants
 */

import { FileText, MessageSquare, Volume2, GitBranch, Database, Zap, Cpu } from 'lucide-react';

export const TABS = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'voice', label: 'Voice', icon: Volume2 },
  //{ id: 'pipecat', label: 'Pipecat', icon: Cpu },
  { id: 'flows', label: 'Flows', icon: GitBranch },
  { id: 'knowledge', label: 'Knowledge', icon: Database },
  { id: 'functions', label: 'Functions', icon: Zap },
];

export const chatModelGroups = [
  {
    label: '⚡ Groq (Fastest & Cheapest)',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', cost: '$0.59 / $0.79', badge: '🔥 Reliable' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', cost: '$0.05 / $0.08', badge: '💰 Cheapest' },
      { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout (Preview)', cost: '$0.11 / $0.34', badge: '🆕 Preview' },
      { value: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick (Preview)', cost: '$0.20 / $0.60', badge: '🆕 Preview' },
      { value: 'qwen/qwen3-32b', label: 'Qwen3 32B', cost: '$0.29 / $0.59', badge: '🧠 Reasoning' },
      { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', cost: '$0.15 / $0.60', badge: '🆕 OpenAI OSS' },
      { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', cost: '$0.075 / $0.30', badge: '⚡ Fast' },
    ]
  },
  {
    label: '🤖 OpenAI',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini', cost: '$0.15 / $0.60', badge: '⭐ Default' },
      { value: 'gpt-4o', label: 'GPT-4o', cost: '$2.50 / $10.00', badge: '🏆 Best Quality' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', cost: '$10.00 / $30.00' },
      { value: 'o1-mini', label: 'o1 Mini (Reasoning)', cost: '$3.00 / $12.00' },
      { value: 'o1', label: 'o1 (Advanced Reasoning)', cost: '$15.00 / $60.00' },
    ]
  },
  {
    label: '🧠 Anthropic (Claude)',
    models: [
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', cost: '$0.80 / $4.00', badge: '⚡ Fast' },
      { value: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet', cost: '$3.00 / $15.00', badge: '✨ Great Quality' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus', cost: '$15.00 / $75.00' },
    ]
  },
  {
    label: '🇨🇳 DeepSeek (Very Cheap)',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat', cost: '$0.14 / $0.28', badge: '💰 Budget' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)', cost: '$0.55 / $2.19', badge: '🧠 Reasoning' },
    ]
  },
  {
    label: '🌙 Moonshot/Kimi (Chinese AI)',
    models: [
      { value: 'moonshot-v1-8k', label: 'Moonshot v1 8K', cost: '$0.17 / $0.17' },
      { value: 'moonshot-v1-32k', label: 'Moonshot v1 32K', cost: '$0.34 / $0.34' },
      { value: 'moonshot-v1-128k', label: 'Moonshot v1 128K', cost: '$0.85 / $0.85', badge: '📚 Long Context' },
    ]
  },
];

export const chatModels = chatModelGroups.flatMap(group => group.models);

export const DEFAULT_AGENT = {
  name: '',
  type: 'sales',
  instructions: '',
  voice: 'shimmer',
  language: 'ur',
  model: 'gpt-4o-mini',
  provider: 'openai',
  deepgram_model: 'nova-2',
  deepgram_voice: 'aura-asteria-en',
  deepgram_language: 'en',
  temperature: 0.6,
  max_tokens: 4096,
  vad_threshold: 0.5,
  silence_duration_ms: 500,
  greeting: '',
  kb_id: null,
  use_flow_engine: false,
  message_buffer_seconds: 2,
  session_timeout_minutes: 30,
  flow_mode: 'intelligent',
  chat_model: 'gpt-4o-mini',
  knowledge_search_mode: 'auto',
};

export const DEFAULT_FUNCTION_FORM = {
  name: '',
  description: '',
  execution_mode: 'sync',
  handler_type: 'inline',
  api_endpoint: '',
  api_method: 'POST',
  api_headers: [],
  api_body_type: 'json',
  api_body: null,
  timeout_ms: 30000,
  retries: 2,
  skip_ssl_verify: false,
  parameters: { type: 'object', properties: {}, required: [] }
};

export const FUNCTION_EXAMPLES = {
  checkBalance: {
    name: 'check_balance',
    description: 'Check customer account balance',
    execution_mode: 'sync',
    handler_type: 'api',
    api_endpoint: 'https://api.example.com/customers/{{customer_id}}/balance',
    api_method: 'GET',
    api_headers: [{ key: 'Authorization', value: 'Bearer YOUR_API_KEY' }],
    api_body_type: 'none',
    api_body: null,
    timeout_ms: 10000,
    retries: 2,
    skip_ssl_verify: false,
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer ID or phone number' }
      },
      required: ['customer_id']
    }
  },
  bookAppointment: {
    name: 'book_appointment',
    description: 'Book an appointment for the customer',
    execution_mode: 'sync',
    handler_type: 'api',
    api_endpoint: 'https://api.example.com/appointments',
    api_method: 'POST',
    api_headers: [
      { key: 'Authorization', value: 'Bearer YOUR_API_KEY' },
      { key: 'Content-Type', value: 'application/json' }
    ],
    api_body_type: 'json',
    api_body: { customer_id: '{{customer_id}}', date: '{{date}}', time: '{{time}}', service: '{{service}}' },
    timeout_ms: 15000,
    retries: 1,
    skip_ssl_verify: false,
    parameters: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Customer ID' },
        date: { type: 'string', description: 'Appointment date (YYYY-MM-DD)' },
        time: { type: 'string', description: 'Appointment time (HH:MM)' },
        service: { type: 'string', description: 'Service type', enum: ['consultation', 'follow-up', 'new-patient'] }
      },
      required: ['customer_id', 'date', 'time']
    }
  },
  sendSMS: {
    name: 'send_sms',
    description: 'Send an SMS notification to customer',
    execution_mode: 'async',
    handler_type: 'api',
    api_endpoint: 'https://api.example.com/sms/send',
    api_method: 'POST',
    api_headers: [{ key: 'Authorization', value: 'Bearer YOUR_API_KEY' }],
    api_body_type: 'json',
    api_body: { phone: '{{phone}}', message: '{{message}}' },
    timeout_ms: 5000,
    retries: 3,
    skip_ssl_verify: false,
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Phone number with country code' },
        message: { type: 'string', description: 'Message content' }
      },
      required: ['phone', 'message']
    }
  },
  transferCall: {
    name: 'transfer_call',
    description: 'Transfer the call to a human agent',
    execution_mode: 'sync',
    handler_type: 'inline',
    api_endpoint: '',
    api_method: 'POST',
    api_headers: [],
    api_body_type: 'none',
    api_body: null,
    timeout_ms: 30000,
    retries: 0,
    skip_ssl_verify: false,
    parameters: {
      type: 'object',
      properties: {
        department: { type: 'string', description: 'Department to transfer to', enum: ['sales', 'support', 'billing', 'technical'] },
        reason: { type: 'string', description: 'Reason for transfer' }
      },
      required: ['department']
    }
  }
};