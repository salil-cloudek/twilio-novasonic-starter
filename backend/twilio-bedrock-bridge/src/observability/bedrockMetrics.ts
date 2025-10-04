import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { metricsUtils } from './metrics';
import { trace } from '@opentelemetry/api';

// Bedrock metrics wrapper
export class BedrockMetrics {
  private static extractTokenCounts(response: any): { inputTokens?: number; outputTokens?: number } {
    try {
      // Different models have different response formats
      if (response.usage) {
        return {
          inputTokens: response.usage.input_tokens || response.usage.inputTokens,
          outputTokens: response.usage.output_tokens || response.usage.outputTokens,
        };
      }
      
      // Nova Sonic specific format (if available)
      if (response.metrics) {
        return {
          inputTokens: response.metrics.inputTokenCount,
          outputTokens: response.metrics.outputTokenCount,
        };
      }
      
      return {};
    } catch (error) {
      return {};
    }
  }
  
  static async wrapInvokeModel(
    client: BedrockRuntimeClient,
    command: InvokeModelCommand,
    modelId: string
  ): Promise<any> {
    const startTime = Date.now();
    const { safeTrace } = require('./safeTracing');
    const tracer = safeTrace.getTracer('bedrock-metrics');
    
    return tracer.startActiveSpan('bedrock.invoke_model', async (span: any) => {
      try {
        span.setAttributes({
          'bedrock.model_id': modelId,
          'bedrock.operation': 'invoke_model',
        });
        
        const response = await client.send(command);
        const duration = (Date.now() - startTime) / 1000;
        
        // Parse response to extract token counts
        let responseBody: any = {};
        if (response.body) {
          const bodyText = new TextDecoder().decode(response.body);
          responseBody = JSON.parse(bodyText);
        }
        
        const { inputTokens, outputTokens } = this.extractTokenCounts(responseBody);
        
        // Record metrics
        metricsUtils.recordBedrockRequest(
          modelId,
          'invoke_model',
          duration,
          true,
          inputTokens,
          outputTokens
        );
        
        span.setAttributes({
          'bedrock.success': true,
          'bedrock.input_tokens': inputTokens || 0,
          'bedrock.output_tokens': outputTokens || 0,
          'bedrock.duration_ms': duration * 1000,
        });
        
        return response;
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        
        // Record error metrics
        metricsUtils.recordBedrockRequest(modelId, 'invoke_model', duration, false);
        metricsUtils.recordError('bedrock_api_error', 'bedrock', 'high');
        
        span.setAttributes({
          'bedrock.success': false,
          'bedrock.error': (error as Error).message,
        });
        
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  static async wrapInvokeModelWithResponseStream(
    client: BedrockRuntimeClient,
    command: InvokeModelWithResponseStreamCommand,
    modelId: string
  ): Promise<any> {
    const startTime = Date.now();
    let firstTokenTime: number | undefined;
    let totalTokens = 0;
    const { safeTrace } = require('./safeTracing');
    const tracer = safeTrace.getTracer('bedrock-metrics');
    
    return tracer.startActiveSpan('bedrock.invoke_model_stream', async (span: any) => {
      try {
        span.setAttributes({
          'bedrock.model_id': modelId,
          'bedrock.operation': 'invoke_model_stream',
        });
        
        const response = await client.send(command);
        
        // Wrap the response stream to capture metrics
        if (response.body) {
          const originalStream = response.body;
          const wrappedStream = this.wrapResponseStream(
            originalStream,
            modelId,
            startTime,
            (firstToken: number, tokens: number) => {
              firstTokenTime = firstToken;
              totalTokens = tokens;
            }
          );
          response.body = wrappedStream;
        }
        
        const duration = (Date.now() - startTime) / 1000;
        
        // Record initial metrics (final metrics recorded in stream wrapper)
        metricsUtils.recordBedrockRequest(
          modelId,
          'invoke_model_stream',
          duration,
          true,
          undefined, // Input tokens not available immediately
          undefined, // Output tokens counted in stream
          firstTokenTime ? (firstTokenTime - startTime) / 1000 : undefined
        );
        
        span.setAttributes({
          'bedrock.success': true,
          'bedrock.streaming': true,
          'bedrock.duration_ms': duration * 1000,
        });
        
        return response;
      } catch (error) {
        const duration = (Date.now() - startTime) / 1000;
        
        // Record error metrics
        metricsUtils.recordBedrockRequest(modelId, 'invoke_model_stream', duration, false);
        metricsUtils.recordError('bedrock_stream_error', 'bedrock', 'high');
        
        span.setAttributes({
          'bedrock.success': false,
          'bedrock.error': (error as Error).message,
        });
        
        throw error;
      } finally {
        span.end();
      }
    });
  }
  
  private static wrapResponseStream(
    originalStream: any,
    modelId: string,
    startTime: number,
    onMetrics: (firstTokenTime: number, totalTokens: number) => void
  ): any {
    let firstTokenTime: number | undefined;
    let totalTokens = 0;
    let chunkCount = 0;
    
    // Create a new async iterator that wraps the original
    const wrappedStream = {
      [Symbol.asyncIterator]: async function* () {
        try {
          for await (const chunk of originalStream) {
            chunkCount++;
            
            // Record first token time
            if (!firstTokenTime) {
              firstTokenTime = Date.now();
            }
            
            // Try to extract token information from chunk
            if (chunk.chunk?.bytes) {
              try {
                const chunkText = new TextDecoder().decode(chunk.chunk.bytes);
                const chunkData = JSON.parse(chunkText);
                
                // Count tokens (format varies by model)
                if (chunkData.outputText) {
                  totalTokens += chunkData.outputText.length; // Rough approximation
                }
                
                // Record chunk processing
                metricsUtils.recordAudioProcessing(
                  'bedrock_stream_chunk',
                  0, // Duration not meaningful for individual chunks
                  chunk.chunk.bytes.length
                );
              } catch (parseError) {
                // Ignore parsing errors for individual chunks
              }
            }
            
            yield chunk;
          }
        } finally {
          // Record final metrics when stream completes
          if (firstTokenTime) {
            const streamingLatency = (firstTokenTime - startTime) / 1000;
            onMetrics(firstTokenTime, totalTokens);
            
            // Record streaming-specific metrics
            metricsUtils.recordBedrockRequest(
              modelId,
              'invoke_model_stream_complete',
              (Date.now() - startTime) / 1000,
              true,
              undefined,
              totalTokens,
              streamingLatency
            );
          }
        }
      }
    };
    
    return wrappedStream;
  }
  
  // Helper method to record conversation metrics
  static recordConversationMetrics(callSid: string, turnNumber: number, responseLatency: number): void {
    metricsUtils.recordConversationTurn(callSid, turnNumber);
    metricsUtils.recordResponseLatency(callSid, responseLatency, 'end_to_end');
  }
  
  // Helper method to record audio processing metrics
  static recordAudioMetrics(operation: string, duration: number, audioSize: number, sampleRate?: number): void {
    metricsUtils.recordAudioProcessing(operation, duration, audioSize, sampleRate);
  }
}