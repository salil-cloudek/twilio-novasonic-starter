/**
 * @fileoverview Distributed Tracing Correlation ID Management
 * 
 * This module provides utilities for generating, managing, and propagating correlation IDs
 * across the entire request lifecycle. Correlation IDs help trace requests through
 * multiple services and components for better observability and debugging.
 * 
 * Features:
 * - Automatic correlation ID generation and propagation
 * - Integration with OpenTelemetry tracing
 * - Context-aware correlation ID storage using AsyncLocalStorage
 * - Support for both HTTP requests and WebSocket connections
 * - Twilio-specific correlation ID extraction from CallSid
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { trace, context, SpanKind } from '@opentelemetry/api';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface CorrelationContext {
  correlationId: string;
  callSid?: string;
  sessionId?: string;
  accountSid?: string;
  streamSid?: string;
  parentCorrelationId?: string;
  timestamp: number;
  source: 'webhook' | 'websocket' | 'internal' | 'bedrock';
}

export interface CorrelationHeaders {
  'x-correlation-id'?: string;
  'x-twilio-call-sid'?: string;
  'x-session-id'?: string;
  'x-parent-correlation-id'?: string;
}

// ============================================================================
// ASYNC LOCAL STORAGE FOR CORRELATION CONTEXT
// ============================================================================

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

// ============================================================================
// CORRELATION ID UTILITIES
// ============================================================================

export class CorrelationIdManager {
  private static readonly CORRELATION_ID_HEADER = 'x-correlation-id';
  private static readonly PARENT_CORRELATION_ID_HEADER = 'x-parent-correlation-id';
  private static readonly CALL_SID_HEADER = 'x-twilio-call-sid';
  private static readonly SESSION_ID_HEADER = 'x-session-id';

  /**
   * Generate a new correlation ID with optional prefix
   */
  public static generateCorrelationId(prefix?: string): string {
    const uuid = randomUUID();
    return prefix ? `${prefix}-${uuid}` : uuid;
  }

  /**
   * Generate a correlation ID from Twilio CallSid for consistency
   */
  public static generateFromCallSid(callSid: string): string {
    // Use CallSid as base but add a short UUID suffix for uniqueness
    const suffix = randomUUID().split('-')[0];
    return `twilio-${callSid}-${suffix}`;
  }

  /**
   * Generate a correlation ID for Bedrock sessions
   */
  public static generateForBedrock(sessionId: string): string {
    const suffix = randomUUID().split('-')[0];
    return `bedrock-${sessionId}-${suffix}`;
  }

  /**
   * Get the current correlation context from AsyncLocalStorage
   */
  public static getCurrentContext(): CorrelationContext | undefined {
    return correlationStorage.getStore();
  }

  /**
   * Get the current correlation ID
   */
  public static getCurrentCorrelationId(): string | undefined {
    return correlationStorage.getStore()?.correlationId;
  }

  /**
   * Set correlation context for the current async context
   */
  public static setContext(context: CorrelationContext): void {
    correlationStorage.enterWith(context);
  }

  /**
   * Run a function within a correlation context
   */
  public static runWithContext<T>(
    context: CorrelationContext,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    return correlationStorage.run(context, fn);
  }

  /**
   * Create a new correlation context
   */
  public static createContext(options: {
    correlationId?: string;
    callSid?: string;
    sessionId?: string;
    accountSid?: string;
    streamSid?: string;
    parentCorrelationId?: string;
    source: CorrelationContext['source'];
  }): CorrelationContext {
    return {
      correlationId: options.correlationId || this.generateCorrelationId(),
      callSid: options.callSid,
      sessionId: options.sessionId,
      accountSid: options.accountSid,
      streamSid: options.streamSid,
      parentCorrelationId: options.parentCorrelationId,
      timestamp: Date.now(),
      source: options.source
    };
  }

  /**
   * Extract correlation context from HTTP headers
   */
  public static extractFromHeaders(headers: Record<string, string | string[] | undefined>): Partial<CorrelationContext> {
    const getHeader = (key: string): string | undefined => {
      const value = headers[key.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    return {
      correlationId: getHeader(this.CORRELATION_ID_HEADER),
      callSid: getHeader(this.CALL_SID_HEADER),
      sessionId: getHeader(this.SESSION_ID_HEADER),
      parentCorrelationId: getHeader(this.PARENT_CORRELATION_ID_HEADER)
    };
  }

  /**
   * Create headers object with correlation information
   */
  public static createHeaders(context?: CorrelationContext): CorrelationHeaders {
    const ctx = context || this.getCurrentContext();
    if (!ctx) return {};

    const headers: CorrelationHeaders = {
      [this.CORRELATION_ID_HEADER]: ctx.correlationId
    };

    if (ctx.callSid) {
      headers[this.CALL_SID_HEADER] = ctx.callSid;
    }

    if (ctx.sessionId) {
      headers[this.SESSION_ID_HEADER] = ctx.sessionId;
    }

    if (ctx.parentCorrelationId) {
      headers[this.PARENT_CORRELATION_ID_HEADER] = ctx.parentCorrelationId;
    }

    return headers;
  }

  /**
   * Add correlation context to OpenTelemetry span
   */
  public static addToSpan(span: any, context?: CorrelationContext): void {
    const ctx = context || this.getCurrentContext();
    if (!ctx || !span) return;

    span.setAttributes({
      'correlation.id': ctx.correlationId,
      'correlation.source': ctx.source,
      'correlation.timestamp': ctx.timestamp,
      ...(ctx.callSid && { 'twilio.call_sid': ctx.callSid }),
      ...(ctx.sessionId && { 'session.id': ctx.sessionId }),
      ...(ctx.accountSid && { 'twilio.account_sid': ctx.accountSid }),
      ...(ctx.streamSid && { 'twilio.stream_sid': ctx.streamSid }),
      ...(ctx.parentCorrelationId && { 'correlation.parent_id': ctx.parentCorrelationId })
    });
  }

  /**
   * Create a child correlation context for nested operations
   */
  public static createChildContext(
    source: CorrelationContext['source'],
    additionalData?: Partial<CorrelationContext>
  ): CorrelationContext {
    const parentContext = this.getCurrentContext();
    
    return this.createContext({
      source,
      parentCorrelationId: parentContext?.correlationId,
      callSid: parentContext?.callSid,
      accountSid: parentContext?.accountSid,
      sessionId: parentContext?.sessionId,
      streamSid: parentContext?.streamSid,
      ...additionalData
    });
  }

  /**
   * Middleware for Express to handle correlation IDs in HTTP requests
   */
  public static middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        // Extract existing correlation info from headers
        const headerContext = CorrelationIdManager.extractFromHeaders(req.headers);
        
        // Extract Twilio-specific information from request body
        const callSid = req.body?.CallSid || headerContext.callSid;
        const accountSid = req.body?.AccountSid;

        // Create correlation context
        const correlationContext = CorrelationIdManager.createContext({
          correlationId: headerContext.correlationId || (callSid ? CorrelationIdManager.generateFromCallSid(callSid) : undefined),
          callSid,
          accountSid,
          parentCorrelationId: headerContext.parentCorrelationId,
          source: 'webhook'
        });

        // Add correlation ID to response headers
        res.setHeader(CorrelationIdManager.CORRELATION_ID_HEADER, correlationContext.correlationId);
        if (correlationContext.callSid) {
          res.setHeader(CorrelationIdManager.CALL_SID_HEADER, correlationContext.callSid);
        }

        // Add to OpenTelemetry span if available
        try {
          const { getSafeActiveSpan } = require('../observability/safeTracing');
          const activeSpan = getSafeActiveSpan();
          if (activeSpan) {
            CorrelationIdManager.addToSpan(activeSpan, correlationContext);
          }
        } catch (error) {
          // Safe tracing failed, continue without span context
        }

        // Run the rest of the request in this correlation context
        CorrelationIdManager.runWithContext(correlationContext, () => {
          next();
        });
      } catch (error) {
        // If correlation middleware fails, continue without correlation context
        console.error('Correlation middleware error:', error);
        next();
      }
    };
  }

  /**
   * Create correlation context for WebSocket connections
   */
  public static createWebSocketContext(options: {
    callSid?: string;
    accountSid?: string;
    streamSid?: string;
    sessionId?: string;
    parentCorrelationId?: string;
  }): CorrelationContext {
    const correlationId = options.callSid 
      ? this.generateFromCallSid(options.callSid)
      : this.generateCorrelationId('ws');

    return this.createContext({
      correlationId,
      source: 'websocket',
      ...options
    });
  }

  /**
   * Create correlation context for Bedrock operations
   */
  public static createBedrockContext(sessionId: string, parentContext?: CorrelationContext): CorrelationContext {
    return this.createContext({
      correlationId: this.generateForBedrock(sessionId),
      sessionId,
      source: 'bedrock',
      parentCorrelationId: parentContext?.correlationId,
      callSid: parentContext?.callSid,
      accountSid: parentContext?.accountSid
    });
  }

  /**
   * Trace a function execution with correlation context
   */
  public static traceWithCorrelation<T>(
    operationName: string,
    fn: () => T | Promise<T>,
    attributes?: Record<string, any>
  ): T | Promise<T> {
    const correlationContext = this.getCurrentContext();
    
    try {
      const { safeTrace } = require('../observability/safeTracing');
      const tracer = safeTrace.getTracer('twilio-bedrock-bridge');

      return tracer.startActiveSpan(operationName, {
        kind: SpanKind.INTERNAL,
        attributes: {
          ...attributes,
          ...(correlationContext && {
            'correlation.id': correlationContext.correlationId,
            'correlation.source': correlationContext.source
          })
        }
      }, (span: any) => {
        try {
          // Add correlation context to span
          if (correlationContext) {
            this.addToSpan(span, correlationContext);
          }

          const result = fn();
          
          if (result instanceof Promise) {
            return result
              .then((value) => {
                span.setStatus({ code: 1 }); // OK
                return value;
              })
              .catch((error) => {
                span.setStatus({ code: 2, message: error.message }); // ERROR
                span.recordException(error);
                throw error;
              })
              .finally(() => {
                span.end();
              });
          } else {
            span.setStatus({ code: 1 }); // OK
            span.end();
            return result;
          }
        } catch (error) {
          span.setStatus({ code: 2, message: (error as Error).message }); // ERROR
          span.recordException(error as Error);
          span.end();
          throw error;
        }
      });
    } catch (error) {
      // Safe tracing failed, execute function without tracing
      return fn();
    }
  }
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const {
  generateCorrelationId,
  generateFromCallSid,
  generateForBedrock,
  getCurrentContext,
  getCurrentCorrelationId,
  setContext,
  runWithContext,
  createContext,
  createChildContext,
  createWebSocketContext,
  createBedrockContext,
  traceWithCorrelation
} = CorrelationIdManager;

// Export middleware with proper binding
export const correlationMiddleware = CorrelationIdManager.middleware.bind(CorrelationIdManager);

// Default export
export default CorrelationIdManager;