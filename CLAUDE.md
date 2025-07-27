# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a local proxy server that acts as an intermediary between Claude API clients and AWS Bedrock's Claude models. It translates requests from the standard Claude API format to AWS Bedrock's format, enabling applications designed for Claude's API to work with AWS Bedrock.

## Commands

### Technical Stack
- node version 18+

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server with hot-reload (uses nodemon)
- `npm start` - Start production server

### Environment Setup
Before running, create a `.env` file with:
```
AWS_BEARER_TOKEN_BEDROCK=your-bearer-token
AWS_REGION=us-east-1  # Optional, defaults to us-east-1
PORT=3000  # Optional, defaults to 3000
LOG_LEVEL=info  # Optional, defaults to info
```

### Starting Claude Code
ANTHROPIC_BASE_URL=http://localhost:3000/ claude --dangerously-skip-permissions

## Architecture

### Core Components

1. **server.js** - Main Express server that:
   - Handles API translation between Claude and Bedrock formats
   - Routes requests to appropriate Bedrock endpoints
   - Manages model ID mapping between Claude and Bedrock conventions
   - Provides health checks and model listing endpoints

2. **logger.js** - Winston-based logging system that:
   - Outputs to both console and `proxy_log.txt` file
   - Uses JSON format for file logs and colorized simple format for console
   - Respects LOG_LEVEL environment variable

### API Endpoints

- `POST /v1/messages` - Claude Messages API → Bedrock conversion
- `POST /v1/complete` - Claude Completions API → Bedrock conversion  
- `GET /v1/models` - Lists available Claude models with their Bedrock IDs
- `GET /health` - Health check with bearer token validation
- `GET /info` - Server configuration and endpoint information

### Key Implementation Details

- Model mapping is handled via `CLAUDE_MODEL_IDS` object in server.js:18-26
- Request payload conversion adds `anthropic_version: "bedrock-2023-05-31"` and removes Claude-specific fields
- Bearer token authentication is required via `AWS_BEARER_TOKEN_BEDROCK` environment variable
- All requests/responses are logged with full payloads for debugging