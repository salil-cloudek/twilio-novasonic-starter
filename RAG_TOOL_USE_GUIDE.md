# RAG via Tool Use - Implementation Guide

## Overview

This implementation enables Amazon Nova Sonic to use tools to retrieve information from knowledge bases during voice conversations. Unlike traditional orchestrator-based RAG, Nova Sonic **decides when to search** and seamlessly incorporates the results into its response without announcing tool use.

## Key Features

✅ **Transparent to Users**: Nova Sonic searches knowledge bases silently  
✅ **Production-Ready**: Robust error handling, logging, and fallback mechanisms  
✅ **Configurable**: Feature flags for gradual rollout  
✅ **Type-Safe**: Full TypeScript implementation with strict typing  
✅ **Scalable**: Supports multiple knowledge bases with priority routing  

## Architecture

```
┌─────────────┐
│   User      │
│ (Phone Call)│
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────────────┐
│  Twilio Media Stream → WebsocketHandler            │
└──────┬──────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│  Nova Sonic Client                                   │
│  • Sends tool configuration on session start        │
│  • Receives tool use requests from Nova Sonic       │
│  • Dispatches to ToolExecutor                       │
└──────┬──────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│  ToolExecutor                                        │
│  • Validates tool request                           │
│  • Queries knowledge base                           │
│  • Formats results for Nova Sonic                   │
└──────┬──────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────┐
│  Knowledge Base Client                               │
│  • Executes vector search                           │
│  • Returns relevant documents                        │
└──────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AWS_RAG_USE_TOOL_BASED` | Enable RAG via tool use | `false` | No |
| `AWS_RAG_AUTO_EXECUTE_TOOLS` | Auto-execute tool requests | `true` | No |
| `AWS_RAG_TOOL_TIMEOUT_MS` | Tool execution timeout (ms) | `10000` | No |
| `AWS_RAG_ENABLE_FALLBACK` | Enable orchestrator fallback | `true` | No |
| `AWS_RAG_MAX_RESULTS` | Max KB results to return | `3` | No |
| `AWS_RAG_MIN_RELEVANCE_SCORE` | Min relevance score (0-1) | `0.5` | No |
| `BEDROCK_KNOWLEDGE_BASE_ID` | AWS Knowledge Base ID | - | Yes (if using KB) |

### Knowledge Base Configuration

Knowledge bases are configured via environment variables. The system automatically creates tools for enabled knowledge bases.

```bash
# Example configuration
export BEDROCK_KNOWLEDGE_BASE_ID="KB12345ABCDE"
export AWS_RAG_USE_TOOL_BASED="true"
export AWS_RAG_MAX_RESULTS="3"
export AWS_RAG_MIN_RELEVANCE_SCORE="0.5"
```

## How It Works

### 1. Session Initialization

When a call starts, the handler:
1. Checks if RAG via tool use is enabled (`configManager.rag.useToolBasedRAG`)
2. Generates tool definitions from configured knowledge bases
3. Creates a session with tool configuration
4. Tool definitions are sent to Nova Sonic during `promptStart`

### 2. Tool Use Flow

```
User: "What's our vacation policy?"
       ↓
Nova Sonic: (decides it needs KB information)
       ↓
Nova Sonic → System: toolUse event
       {
         name: "main_knowledge_base",
         toolUseId: "abc123",
         input: { query: "vacation policy" }
       }
       ↓
ToolExecutor: Executes KB query
       ↓
ToolExecutor → Nova Sonic: toolResult
       {
         toolUseId: "abc123",
         content: [{ text: "Employees receive 15 days..." }],
         status: "success"
       }
       ↓
Nova Sonic: "Based on company policy, you receive 15 days of vacation..."
```

### 3. Tool Definition Format

Tools are automatically generated from your knowledge base configuration:

```typescript
{
  name: "main_knowledge_base",
  description: "Information from Main Knowledge Base",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The information needed to answer the question"
      }
    },
    required: ["query"]
  }
}
```

**Important**: Tool descriptions are neutral to avoid Nova Sonic announcing tool use. Instead of "Search the knowledge base for X", we use "Information about X".

## Implementation Files

### Core Files

| File | Purpose | Size |
|------|---------|------|
| `src/tools/types.ts` | TypeScript type definitions | ~150 lines |
| `src/tools/KnowledgeBaseTools.ts` | Tool schema generation | ~250 lines |
| `src/tools/ToolExecutor.ts` | Tool execution logic | ~350 lines |
| `src/config/ConfigurationTypes.ts` | RAG configuration types | +50 lines |
| `src/config/ConfigurationManager.ts` | Config loading | +50 lines |
| `src/client.ts` | Nova Sonic client extensions | +100 lines |
| `src/handlers/WebsocketHandler.ts` | Tool use event handling | +100 lines |

## Enabling the Feature

### Development Environment

```bash
# Enable RAG via tool use
export AWS_RAG_USE_TOOL_BASED=true

# Ensure knowledge base is configured
export BEDROCK_KNOWLEDGE_BASE_ID=your-kb-id

# Start the application
npm start
```

### Production Deployment

#### Option 1: Environment Variables (Lambda)

```typescript
// In CDK/CloudFormation
environment: {
  AWS_RAG_USE_TOOL_BASED: 'true',
  AWS_RAG_AUTO_EXECUTE_TOOLS: 'true',
  AWS_RAG_TOOL_TIMEOUT_MS: '10000',
  AWS_RAG_MAX_RESULTS: '3',
  AWS_RAG_MIN_RELEVANCE_SCORE: '0.5',
  BEDROCK_KNOWLEDGE_BASE_ID: 'your-kb-id'
}
```

#### Option 2: AWS Systems Manager (Recommended)

Create parameters in SSM Parameter Store:

```bash
# Enable tool-based RAG
aws ssm put-parameter \
  --name /twilio-bedrock-bridge/prod/rag/use-tool-based \
  --value "true" \
  --type String

# Configure max results
aws ssm put-parameter \
  --name /twilio-bedrock-bridge/prod/rag/max-results \
  --value "3" \
  --type String
```

## Validation and Testing

### Validate Configuration

The system provides built-in validation:

```typescript
import { validateToolConfiguration } from './tools/KnowledgeBaseTools';

const validation = validateToolConfiguration();
if (!validation.isValid) {
  console.error('Tool configuration issues:', validation.issues);
}
```

### Test Tool Execution

```typescript
import { ToolExecutor } from './tools/ToolExecutor';

const executor = new ToolExecutor();
const validation = executor.validateConfiguration();

if (validation.isValid) {
  console.log('Tool executor configured correctly');
} else {
  console.error('Issues:', validation.issues);
}
```

### Manual Testing

1. **Make a test call** to your Twilio number
2. **Check logs** for tool initialization:
   ```
   RAG via tool use enabled for session
   toolCount: 1
   toolNames: ["main_knowledge_base"]
   ```
3. **Ask a question** that requires knowledge base info:
   - "What's our vacation policy?"
   - "Tell me about our return policy"
4. **Check logs** for tool use:
   ```
   Nova Sonic requesting tool use
   Tool execution completed
   status: success
   ```
5. **Verify response** incorporates knowledge base information naturally

## Monitoring

### Key Metrics to Track

- **Tool Use Rate**: How often Nova Sonic uses tools
- **Tool Success Rate**: Percentage of successful tool executions
- **Tool Latency**: Time to execute and return results
- **KB Query Performance**: Knowledge base query time

### Log Events

| Event | Log Level | Description |
|-------|-----------|-------------|
| `RAG via tool use enabled for session` | INFO | Tools initialized |
| `Nova Sonic requesting tool use` | INFO | Tool requested |
| `Tool execution completed` | INFO | Tool succeeded |
| `Tool execution failed` | ERROR | Tool failed |
| `Knowledge base query completed` | INFO | KB query stats |

## Troubleshooting

### Tool Use Not Working

**Problem**: Nova Sonic doesn't use tools

**Checks**:
1. Verify `AWS_RAG_USE_TOOL_BASED=true`
2. Check knowledge base is configured and enabled
3. Review logs for tool initialization
4. Ensure tool definitions are sent in `promptStart` event

```bash
# Check configuration
grep "RAG via tool use enabled" logs/app.log

# Verify tool count
grep "toolCount" logs/app.log
```

### Knowledge Base Queries Failing

**Problem**: Tool execution returns errors

**Checks**:
1. Verify knowledge base ID is correct
2. Check IAM permissions for Bedrock Agent Runtime
3. Review knowledge base query timeout settings
4. Check minimum relevance score isn't too high

```bash
# Check for errors
grep "Tool execution failed" logs/app.log

# Check KB client errors
grep "Knowledge base query failed" logs/app.log
```

### Tool Results Not Reaching Nova Sonic

**Problem**: Tool executes but Nova Sonic doesn't get results

**Checks**:
1. Verify `toolUseId` matches between request and result
2. Check result format matches expected structure
3. Review logs for `sendToolResult` calls

### Performance Issues

**Problem**: Tool execution is slow

**Solutions**:
1. Reduce `AWS_RAG_MAX_RESULTS` (default: 3)
2. Increase `minRelevanceScore` to filter low-quality results
3. Optimize knowledge base index
4. Consider caching frequent queries

## Best Practices

### 1. Tool Descriptions

✅ **Good**: "Information about company policies"  
❌ **Bad**: "Search the knowledge base for company policies"

**Why**: Neutral descriptions prevent Nova Sonic from announcing tool use

### 2. Result Filtering

- Set `minRelevanceScore` to 0.5 or higher
- Limit `maxResults` to 3-5 for voice conversations
- Filter out duplicate or redundant results

### 3. Error Handling

- Always return graceful error messages
- Enable `enableOrchestratorFallback` during migration
- Log all tool execution failures for monitoring

### 4. Gradual Rollout

1. **Dev**: Enable for all sessions
2. **Staging**: Test with production-like data
3. **Production**: Start with `useToolBasedRAG=false`
4. **Production**: Enable for 10% of sessions
5. **Production**: Gradually increase to 100%

## Migration from Orchestrator

If you're currently using the orchestrator-based approach:

### Phase 1: Parallel Testing

```typescript
// Enable both systems
AWS_RAG_USE_TOOL_BASED=true
AWS_RAG_ENABLE_FALLBACK=true
```

Compare results between tool-based and orchestrator approaches.

### Phase 2: A/B Testing

Route 50% of sessions to tool-based RAG, monitor metrics.

### Phase 3: Full Migration

Once confident:
```typescript
AWS_RAG_USE_TOOL_BASED=true
AWS_RAG_ENABLE_FALLBACK=false
```

### Phase 4: Cleanup

Remove orchestrator code (optional - can keep for backward compatibility).

## Security Considerations

### IAM Permissions

Ensure your Lambda/ECS task role has:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:Retrieve",
        "bedrock:RetrieveAndGenerate"
      ],
      "Resource": "arn:aws:bedrock:*:*:knowledge-base/*"
    }
  ]
}
```

### Input Validation

All tool inputs are sanitized before execution. The system:
- Validates query parameters
- Checks for SQL injection attempts
- Limits query length
- Sanitizes special characters

### Rate Limiting

Consider implementing rate limits:
- Max tool uses per session
- Max KB queries per minute
- Timeout for long-running queries

## Performance Optimization

### 1. Connection Pooling

Knowledge base client uses connection pooling by default.

### 2. Caching

Consider adding caching for frequent queries:

```typescript
// Example: Redis cache for common queries
const cachedResult = await redis.get(`kb:${query}`);
if (cachedResult) return JSON.parse(cachedResult);
```

### 3. Parallel Execution

If querying multiple KBs, execute in parallel:

```typescript
const results = await Promise.all(
  knowledgeBases.map(kb => queryKnowledgeBase(kb, query))
);
```

## Future Enhancements

Potential improvements to consider:

1. **Multi-KB Support**: Query multiple knowledge bases in one tool use
2. **Semantic Caching**: Cache semantically similar queries
3. **Query Rewriting**: Improve queries before sending to KB
4. **Result Ranking**: ML-based relevance scoring
5. **Streaming Results**: Stream KB results as they arrive

## Support and Feedback

For issues or questions:
- Check logs with correlation IDs
- Review CloudWatch metrics
- Enable DEBUG logging: `LOG_LEVEL=DEBUG`

## Summary

This implementation provides production-ready RAG via tool use for Nova Sonic voice conversations. Key benefits:

- ✅ Seamless user experience (no tool use announcement)
- ✅ Type-safe TypeScript implementation
- ✅ Comprehensive error handling and logging
- ✅ Feature flags for safe rollout
- ✅ Compatible with existing knowledge base setup

The feature is **disabled by default** for safe deployment. Enable with `AWS_RAG_USE_TOOL_BASED=true` when ready.
