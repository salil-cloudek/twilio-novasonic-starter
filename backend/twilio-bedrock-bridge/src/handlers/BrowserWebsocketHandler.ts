// Node.js built-ins
import http, { IncomingMessage } from 'http';

// External packages
import { WebSocketServer, WebSocket } from 'ws';

// Internal modules - client
import { NovaSonicBidirectionalStreamClient } from '../client';

// Internal modules - config
import { config } from '../config/AppConfig';

// Internal modules - tools (RAG via tool use)
import { getEnabledKnowledgeBaseTools, validateToolConfiguration } from '../tools/KnowledgeBaseTools';
import { ToolExecutor } from '../tools/ToolExecutor';

// Internal modules - errors
import { extractErrorDetails } from '../errors/ClientErrors';

// Internal modules - observability
import logger from '../observability/logger';
import { SessionMetrics } from '../observability/sessionMetrics';
import { WebSocketMetrics } from '../observability/websocketMetrics';

// Internal modules - types
import { ExtendedWebSocket } from '../types/SharedTypes';

// Internal modules - utils
import { setTimeoutWithCorrelation } from '../utils/asyncCorrelation';
import { DefaultAudioInputConfiguration, DefaultTextConfiguration } from '../utils/constants';
import { CorrelationIdManager } from '../utils/correlationId';

// Initialize tool executor for RAG via tool use
const toolExecutor = new ToolExecutor();

// Enhanced Bedrock client with orchestrator capabilities
const bedrockClient = new NovaSonicBidirectionalStreamClient({
  clientConfig: { 
    region: config.bedrock?.region || 'us-east-1'
  },
  bedrock: {
    region: config.bedrock?.region || 'us-east-1',
    modelId: config.bedrock?.modelId || 'amazon.nova-sonic-v1:0'
  }
});

/**
 * Initialize WebSocket server for browser clients at /ws endpoint.
 * Handles binary PCM audio at 16kHz from browsers and returns 24kHz PCM audio.
 */
export function initBrowserWebsocketServer(server?: http.Server): WebSocketServer {
  logger.info('Initializing Browser WebSocket server on /ws path...');
  
  const wss = new WebSocketServer({ 
    ...(server ? { server } : { noServer: true }),
    path: '/ws',
    perMessageDeflate: false, // Disable compression for real-time audio streaming
    verifyClient: (info: { req: http.IncomingMessage }) => {
      // Log connection details for debugging
      logger.info('🔵 BROWSER WebSocket connection attempt detected', {
        url: info.req.url,
        method: info.req.method,
        userAgent: info.req.headers['user-agent'],
        ip: info.req.socket.remoteAddress,
        origin: info.req.headers.origin,
        upgrade: info.req.headers.upgrade,
        connection: info.req.headers.connection,
        headers: Object.keys(info.req.headers)
      });

      // Basic validation - accept browser connections
      // Allow connections from localhost and the domain
      const origin = info.req.headers.origin;
      if (origin) {
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'https://voice-ai.cloudek.au',
          'https://frontend-setup.d3disynd4oei0a.amplifyapp.com'
        ];
        
        if (!allowedOrigins.some(allowed => origin.startsWith(allowed))) {
          logger.warn('🔴 Browser WebSocket connection REJECTED - invalid origin', {
            origin,
            allowedOrigins
          });
          return false;
        }
      }

      logger.info('🟢 Browser WebSocket connection ACCEPTED - returning true', { origin });
      return true;
    }
  });

  // Log when server starts listening for connections
  logger.info('Browser WebSocket server initialized on /ws');

  // Add error handler for the server
  wss.on('error', (error) => {
    logger.error('❌ Browser WebSocket SERVER error', {
      error: extractErrorDetails(error),
      stack: error.stack
    });
  });

  // Add headers event to log upgrade requests
  wss.on('headers', (headers, req) => {
    logger.info('📤 Browser WebSocket sending upgrade response headers', {
      url: req.url,
      headers: headers,
      statusCode: 101
    });
  });

  // WebSocket connection handling
  wss.on('connection', (ws: ExtendedWebSocket, req: IncomingMessage) => {
    const tempWsId = `browser-ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    logger.info('✅ Browser WebSocket CONNECTION EVENT FIRED', {
      id: tempWsId,
      url: req.url,
      ip: req.socket.remoteAddress,
      origin: req.headers.origin
    });
    
    // Create initial correlation context for WebSocket connection
    const wsCorrelationContext = CorrelationIdManager.createWebSocketContext({
      sessionId: tempWsId
    });
    
    // Run WebSocket handling within correlation context
    CorrelationIdManager.runWithContext(wsCorrelationContext, () => {
      logger.info('🎉 Browser WebSocket FULLY CONNECTED', { 
        id: tempWsId, 
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      ws.id = tempWsId;
      ws.correlationContext = wsCorrelationContext;
    
      // Initialize WebSocket metrics tracking
      WebSocketMetrics.onConnection(ws);
      
      // Initialize session tracking
      SessionMetrics.createSession(tempWsId, ws);
      let sessionId: string = '';

      // Add error handler for individual WebSocket
      ws.on('error', (error) => {
        logger.error('❌ Browser WebSocket connection error', {
          id: tempWsId,
          error: extractErrorDetails(error),
          stack: error.stack
        });
      });

      ws.on('close', (code, reason) => {
        logger.info('🔌 Browser WebSocket closed', {
          id: tempWsId,
          code,
          reason: reason.toString()
        });
      });

      // Turn management variables
      let isUserTurnActive = false;
      let isRecording = false;

      // Handle incoming messages (text commands or binary audio)
      ws.on('message', async (data: Buffer | string) => {
        CorrelationIdManager.runWithContext(ws.correlationContext || { correlationId: 'unknown', source: 'websocket', timestamp: Date.now() }, async () => {
          
          // Handle text messages (commands)
          if (typeof data === 'string') {
            try {
              const command = data.trim();
              
              if (command === 'start_audio') {
                logger.info('Browser client started recording', { sessionId: tempWsId });
                isRecording = true;
                
                // Start Bedrock session if not already active
                if (!sessionId || !bedrockClient.isSessionActive(sessionId)) {
                  sessionId = tempWsId;
                  
                  // Get enabled knowledge base tools
                  const knowledgeBaseTools = getEnabledKnowledgeBaseTools();
                  validateToolConfiguration();
                  
                  // Build tool config if tools are available
                  const toolConfig = knowledgeBaseTools.length > 0 ? {
                    tools: knowledgeBaseTools.map(t => ({
                      toolSpec: {
                        name: t.name,
                        description: t.description,
                        inputSchema: {
                          json: typeof t.inputSchema === 'string' ? t.inputSchema : JSON.stringify(t.inputSchema)
                        }
                      }
                    }))
                  } : undefined;
                  
                  try {
                    // Create session using the same pattern as Twilio handler
                    const sessionConfig: any = {
                      clientConfig: { 
                        region: config.bedrock?.region || 'us-east-1'
                      },
                      bedrock: {
                        region: config.bedrock?.region || 'us-east-1',
                        modelId: config.bedrock?.modelId || 'amazon.nova-sonic-v1:0'
                      }
                    };
                    
                    // Add tool config if tools are available
                    if (toolConfig) {
                      sessionConfig.toolConfig = toolConfig;
                    }
                    
                    bedrockClient.createStreamSession(sessionId, sessionConfig);
                    
                    logger.info('Created stream session for browser client', { sessionId, hasTools: !!toolConfig });
                    
                    // Start the bidirectional stream in background
                    bedrockClient.initiateSession(sessionId).catch((e: unknown) => {
                      const errorDetails = extractErrorDetails(e);
                      logger.error('Bedrock initiateSession failed (async)', { 
                        sessionId, 
                        ...errorDetails
                      });
                    });
                    
                    // Setup session events
                    bedrockClient.setupSessionStartEvent(sessionId);
                    logger.info('Queued sessionStart for browser session', { sessionId });
                    
                    bedrockClient.setupPromptStartEvent(sessionId);
                    logger.info('Queued promptStart for browser session', { sessionId });
                    
                    // System prompt for browser chat
                    const systemPrompt = 'You are a helpful voice assistant. Respond conversationally and naturally. Keep responses concise and clear.';
                    bedrockClient.setupSystemPromptEvent(sessionId, DefaultTextConfiguration, systemPrompt);
                    logger.info('Queued systemPrompt for browser session', { sessionId });
                    
                    // Queue audio contentStart for user input
                    bedrockClient.setupStartAudioEvent(sessionId, DefaultAudioInputConfiguration);
                    logger.info('Queued audio contentStart for browser session', { sessionId });
                    
                    // Register audio output handler
                    bedrockClient.registerEventHandler(sessionId, 'audioOutput', (data: unknown) => {
                      const audioOut = data as { content?: string; audio?: string; contentId?: string; contentName?: string; role?: string };
                      const audioPayload = audioOut?.content ?? audioOut?.audio;
                      if (audioPayload && ws.readyState === WebSocket.OPEN) {
                        const audioEvent = {
                          event: {
                            audioOutput: {
                              content: audioPayload,
                              contentId: audioOut?.contentId || audioOut?.contentName || '',
                              role: audioOut?.role || 'ASSISTANT'
                            }
                          }
                        };
                        ws.send(JSON.stringify(audioEvent));
                      }
                    });
                    
                    // Register text output handler (Nova Sonic sends `content`)
                    bedrockClient.registerEventHandler(sessionId, 'textOutput', (data: unknown) => {
                      const textOut = data as { content?: string; text?: string; contentId?: string };
                      const textPayload = textOut?.content ?? textOut?.text;
                      if (textPayload && ws.readyState === WebSocket.OPEN) {
                        const textEvent = {
                          event: {
                            textOutput: {
                              content: textPayload,
                              contentId: textOut?.contentId || ''
                            }
                          }
                        };
                        ws.send(JSON.stringify(textEvent));
                      }
                    });
                    
                    // Register content start handler
                    bedrockClient.registerEventHandler(sessionId, 'contentStart', (data: unknown) => {
                      const contentStart = data as { contentId?: string; role?: string; type?: string };
                      if (ws.readyState === WebSocket.OPEN) {
                        const contentStartEvent = {
                          event: {
                            contentStart: {
                              contentId: contentStart.contentId || '',
                              stage: contentStart.role || 'unknown'
                            }
                          }
                        };
                        ws.send(JSON.stringify(contentStartEvent));
                      }
                    });
                    
                    // Register tool use handler
                    bedrockClient.registerEventHandler(sessionId, 'toolUse', async (data: unknown) => {
                      const toolUse = data as { toolName?: string; toolInput?: string; toolUseId?: string; contentId?: string };
                      if (toolUse?.toolName) {
                        logger.info('Tool use requested', { 
                          sessionId, 
                          toolName: toolUse.toolName,
                          toolUseId: toolUse.toolUseId
                        });
                        
                        try {
                          // Parse tool input if it's a string
                          const toolInput = typeof toolUse.toolInput === 'string' 
                            ? JSON.parse(toolUse.toolInput) 
                            : toolUse.toolInput || {};
                          
                          const result = await toolExecutor.executeTool({
                            name: toolUse.toolName,
                            input: toolInput,
                            toolUseId: toolUse.toolUseId || ''
                          }, sessionId);
                          
                          if (bedrockClient.isSessionActive(sessionId)) {
                            bedrockClient.sendToolResult(sessionId, result.toolUseId, result.content);
                            logger.info('Tool result sent to Bedrock', { 
                              sessionId, 
                              toolName: toolUse.toolName 
                            });
                          }
                        } catch (toolErr) {
                          logger.error('Tool execution failed', { 
                            sessionId, 
                            error: extractErrorDetails(toolErr) 
                          });
                        }
                      }
                    });
                    
                    isUserTurnActive = true;
                    
                  } catch (err) {
                    logger.error('Failed to start Bedrock session', { 
                      sessionId, 
                      error: extractErrorDetails(err) 
                    });
                    ws.send(JSON.stringify({ error: 'Failed to start session' }));
                    return;
                  }
                }
                
              } else if (command === 'stop_audio') {
                logger.info('Browser client stopped recording', { sessionId: tempWsId });
                isRecording = false;
                
                // End the current user turn
                if (isUserTurnActive && sessionId && bedrockClient.isSessionActive(sessionId)) {
                  try {
                    bedrockClient.sendContentEnd(sessionId);
                    
                    setTimeoutWithCorrelation(() => {
                      if (bedrockClient.isSessionActive(sessionId)) {
                        bedrockClient.sendPromptEnd(sessionId);
                        logger.info('Ended user turn for browser client', { sessionId });
                      }
                    }, 100);
                    
                    isUserTurnActive = false;
                  } catch (err) {
                    logger.error('Failed to end user turn', { 
                      sessionId, 
                      error: extractErrorDetails(err) 
                    });
                  }
                }
              }
              
            } catch (err) {
              logger.warn('Error processing browser command', { 
                client: tempWsId, 
                error: extractErrorDetails(err)
              });
            }
            return;
          }
          
          // Handle binary audio data (PCM 16kHz from browser)
          if (Buffer.isBuffer(data) && isRecording && sessionId && bedrockClient.isSessionActive(sessionId)) {
            try {
              // Browser sends 16-bit PCM at 16kHz, which is what Bedrock expects
              // Send directly to Bedrock
              await bedrockClient.streamAudioChunk(sessionId, data);
              
              logger.debug('Forwarded browser audio to Bedrock', {
                client: tempWsId,
                sessionId,
                bytes: data.length
              });
              
            } catch (err) {
              logger.warn('Error processing browser audio', { 
                client: tempWsId, 
                error: extractErrorDetails(err)
              });
            }
          }
        });
      });

      ws.on('close', () => {
        CorrelationIdManager.runWithContext(ws.correlationContext || { correlationId: 'unknown', source: 'websocket', timestamp: Date.now() }, () => {
          logger.info('Browser WebSocket disconnected', { id: tempWsId });
          
          // Cleanup Bedrock session
          if (sessionId && bedrockClient.isSessionActive(sessionId)) {
            bedrockClient.closeSession(sessionId).catch((err) => {
              logger.warn('Error closing Bedrock session', { sessionId, error: extractErrorDetails(err) });
            });
            logger.info('Ended Bedrock session for browser client', { sessionId });
          }
          
          // Cleanup metrics
          SessionMetrics.endSession(tempWsId);
          WebSocketMetrics.onDisconnection(ws);
        });
      });

      ws.on('error', (err) => {
        CorrelationIdManager.runWithContext(ws.correlationContext || { correlationId: 'unknown', source: 'websocket', timestamp: Date.now() }, () => {
          logger.error('Browser WebSocket error', { 
            id: tempWsId, 
            error: extractErrorDetails(err) 
          });
        });
      });
    });
  });

  logger.info('Browser WebSocket server initialized on /ws');
  return wss;
}
