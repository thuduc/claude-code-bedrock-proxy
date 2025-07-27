const express = require('express');
const axios = require('axios');
const morgan = require('morgan');
const cors = require('cors');
const logger = require('./logger');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 3000;

// AWS Bedrock Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_BEARER_TOKEN_BEDROCK = process.env.AWS_BEARER_TOKEN_BEDROCK;
const BEDROCK_ENDPOINT = process.env.BEDROCK_ENDPOINT || `https://bedrock-runtime.${AWS_REGION}.amazonaws.com`;

// Model IDs for Claude on Bedrock
const CLAUDE_MODEL_IDS = {
  'claude-4-sonnet': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'claude-4-opus': 'us.anthropic.claude-opus-4-20250514-v1:0'
};

// Default model
const DEFAULT_MODEL = CLAUDE_MODEL_IDS['claude-4-sonnet'];

if (!AWS_BEARER_TOKEN_BEDROCK) {
  logger.error('Error: AWS_BEARER_TOKEN_BEDROCK environment variable is not set');
  logger.error('Please set the bearer token in your .env file');
  process.exit(1);
}

// Create axios instance for Bedrock
const bedrockAPI = axios.create({
  baseURL: BEDROCK_ENDPOINT,
  headers: {
    'Authorization': `Bearer ${AWS_BEARER_TOKEN_BEDROCK}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Convert Claude API format to Bedrock format
const convertToBedrockFormat = (claudePayload, endpoint) => {
  if (endpoint === '/v1/messages') {
    // we prefer to use the current payload and remove unnecessary elements
    const bedrockPayload = structuredClone(claudePayload);
    bedrockPayload['anthropic_version'] = "bedrock-2023-05-31";
    // extra elements in payload are not allowed by Bedrock
    delete bedrockPayload['model'];
    delete bedrockPayload['stream'];
    return

    // the other approach is to manually construc the bedrock payload
/*
    // Convert messages API format to Bedrock format
    response = {
      max_tokens: claudePayload.max_tokens,
      messages: claudePayload.messages,
      temperature: claudePayload.temperature,
      metadata: claudePayload.metadata,
      anthropic_version: "bedrock-2023-05-31",
      anthropic_beta: claudePayload.anthropic_beta
    };
    if ('system' in claudePayload) {
      response.system = claudePayload.system;
    }
    if ('tools' in claudePayload) {
      response.tools = claudePayload.tools;
    }
    return response;
*/    
  }
  return claudePayload;
};

// Generic handler for Bedrock API calls
const handleBedrockCall = async (req, res, endpoint) => {
  try {
    let payload = req.body;
    
    // Modify payload if modifier function is provided
    // if (payloadModifier) {
    //   payload = payloadModifier(payload, req);
    //   console.log(`[${endpoint}] Modified payload:`, JSON.stringify(payload, null, 2));
    // }

    // Convert to Bedrock format
    console.log(`[${endpoint}] Anthropic Request payload:`, JSON.stringify(payload, null, 2));
    const bedrockPayload = convertToBedrockFormat(payload, endpoint);
    logger.info(`[${endpoint}] Bedrock Request payload: ${JSON.stringify(bedrockPayload, null, 2)}`)

    // Determine model ID
    const modelId = payload.model && CLAUDE_MODEL_IDS[payload.model] 
      ? CLAUDE_MODEL_IDS[payload.model] 
      : DEFAULT_MODEL;

    logger.info(`[${endpoint}] Calling Bedrock with model: ${modelId}`);

    // Make the Bedrock API call
    const bedrockEndpoint = `/model/${modelId}/invoke`;
    
    try {
      const response = await bedrockAPI.post(bedrockEndpoint, bedrockPayload);
      
      logger.info(`[${bedrockEndpoint}] Response payload: ${JSON.stringify(response.data, null, 2)}`);

      // Send response back to client
      res.status(200).json(response.data);
    } catch (error) {
      // Handle Bedrock API errors
      logger.error(`[${endpoint}] Bedrock API error: ${JSON.stringify(error.response?.data || error.message)}`);
      
      if (error.response) {
        res.status(error.response.status).json({
          error: {
            type: 'bedrock_error',
            message: error.response.data?.message || error.message,
            details: error.response.data
          }
        });
      } else {
        res.status(500).json({
          error: {
            type: 'network_error',
            message: error.message
          }
        });
      }
    }
  } catch (error) {
    logger.error(`[${endpoint}] Request processing failed: ${error}`);
    res.status(500).json({
      error: {
        type: 'internal_error',
        message: error.message
      }
    });
  }
};

// Handle /v1/messages endpoint
app.post('/v1/messages', async (req, res) => {
  await handleBedrockCall(
    req, 
    res, 
    '/v1/messages'
  );
});

// Handle /v1/complete endpoint  
app.post('/v1/complete', async (req, res) => {
  await handleBedrockCall(
    req, 
    res, 
    '/v1/complete'
  );
});

// Handle /v1/models endpoint
app.get('/v1/models', (req, res) => {
  // Return available models
  res.json({
    data: Object.entries(CLAUDE_MODEL_IDS).map(([key, value]) => ({
      id: key,
      object: "model",
      created: Date.now(),
      owned_by: "anthropic",
      bedrock_model_id: value
    }))
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test the bearer token by making a simple request
    const testModel = DEFAULT_MODEL;
    const testResponse = await bedrockAPI.get(`/model/${testModel}`, {
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      aws_region: AWS_REGION,
      bedrock_endpoint: BEDROCK_ENDPOINT,
      auth_configured: !!AWS_BEARER_TOKEN_BEDROCK,
      auth_valid: testResponse.status < 400
    });
  } catch (error) {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      aws_region: AWS_REGION,
      bedrock_endpoint: BEDROCK_ENDPOINT,
      auth_configured: !!AWS_BEARER_TOKEN_BEDROCK,
      auth_valid: false,
      auth_error: error.message
    });
  }
});

// Info endpoint
app.get('/info', (req, res) => {
  res.json({
    server_type: 'AWS Bedrock Claude Handler (Bearer Token Auth)',
    aws_region: AWS_REGION,
    bedrock_endpoint: BEDROCK_ENDPOINT,
    available_models: Object.keys(CLAUDE_MODEL_IDS),
    default_model: DEFAULT_MODEL,
    auth_method: 'Bearer Token',
    endpoints: {
      messages: {
        method: 'POST',
        path: '/v1/messages',
        payload_modified: true,
        response_modified: true
      },
      complete: {
        method: 'POST', 
        path: '/v1/complete',
        payload_modified: true,
        response_modified: true
      },
      models: {
        method: 'GET',
        path: '/v1/models',
        description: 'List available Claude models on Bedrock'
      }
    },
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info(`AWS Bedrock Claude API Handler (Bearer Token Auth)`);
  logger.info('='.repeat(60));
  logger.info(`Server URL: http://localhost:${PORT}`);
  logger.info(`AWS Region: ${AWS_REGION}`);
  logger.info(`Bedrock Endpoint: ${BEDROCK_ENDPOINT}`);
  logger.info(`Default Model: ${DEFAULT_MODEL}`);
  logger.info(`Auth Method: Bearer Token`);
  logger.info('\nConfigured Endpoints:');
  logger.info(`  POST http://localhost:${PORT}/v1/messages    [Claude Messages API → Bedrock]`);
  logger.info(`  POST http://localhost:${PORT}/v1/complete    [Claude Completions API → Bedrock]`);
  logger.info(`  GET  http://localhost:${PORT}/v1/models      [List Available Models]`);
  logger.info('\nUtility Endpoints:');
  logger.info(`  GET  http://localhost:${PORT}/health`);
  logger.info(`  GET  http://localhost:${PORT}/info`);
  logger.info('\nPayload modifications can be customized in bedrock-payload-modifiers.js');
  logger.info('='.repeat(60));
});