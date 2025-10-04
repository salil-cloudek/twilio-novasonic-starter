/**
 * @fileoverview Tests for Correlation ID System
 */

import { CorrelationIdManager, CorrelationContext } from '../utils/correlationId';
import { CorrelationScope, withContext, setTimeoutWithCorrelation } from '../utils/asyncCorrelation';

describe('CorrelationIdManager', () => {
  beforeEach(() => {
    // Clear any existing correlation context
    CorrelationIdManager.setContext(undefined as any);
  });

  describe('generateCorrelationId', () => {
    it('should generate a UUID without prefix', () => {
      const id = CorrelationIdManager.generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should generate a UUID with prefix', () => {
      const id = CorrelationIdManager.generateCorrelationId('test');
      expect(id).toMatch(/^test-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('generateFromCallSid', () => {
    it('should generate correlation ID from CallSid', () => {
      const callSid = 'CA123456789abcdef';
      const id = CorrelationIdManager.generateFromCallSid(callSid);
      expect(id).toMatch(/^twilio-CA123456789abcdef-[0-9a-f]{8}$/);
    });
  });

  describe('generateForBedrock', () => {
    it('should generate correlation ID for Bedrock session', () => {
      const sessionId = 'session-123';
      const id = CorrelationIdManager.generateForBedrock(sessionId);
      expect(id).toMatch(/^bedrock-session-123-[0-9a-f]{8}$/);
    });
  });

  describe('createContext', () => {
    it('should create correlation context with required fields', () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789'
      });

      expect(context).toMatchObject({
        source: 'webhook',
        callSid: 'CA123456789',
        timestamp: expect.any(Number)
      });
      expect(context.correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should use provided correlation ID', () => {
      const correlationId = 'custom-correlation-id';
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        correlationId
      });

      expect(context.correlationId).toBe(correlationId);
    });
  });

  describe('context management', () => {
    it('should set and get current context', () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789'
      });

      CorrelationIdManager.setContext(context);
      const retrieved = CorrelationIdManager.getCurrentContext();

      expect(retrieved).toEqual(context);
    });

    it('should run function within correlation context', () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789'
      });

      let capturedContext: CorrelationContext | undefined;

      CorrelationIdManager.runWithContext(context, () => {
        capturedContext = CorrelationIdManager.getCurrentContext();
      });

      expect(capturedContext).toEqual(context);
    });

    it('should handle async operations within context', async () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789'
      });

      let capturedContext: CorrelationContext | undefined;

      await CorrelationIdManager.runWithContext(context, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        capturedContext = CorrelationIdManager.getCurrentContext();
      });

      expect(capturedContext).toEqual(context);
    });
  });

  describe('createChildContext', () => {
    it('should create child context with parent correlation ID', () => {
      const parentContext = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789'
      });

      CorrelationIdManager.setContext(parentContext);

      const childContext = CorrelationIdManager.createChildContext('bedrock', {
        sessionId: 'session-123'
      });

      expect(childContext.parentCorrelationId).toBe(parentContext.correlationId);
      expect(childContext.callSid).toBe(parentContext.callSid);
      expect(childContext.source).toBe('bedrock');
      expect(childContext.sessionId).toBe('session-123');
    });
  });

  describe('createWebSocketContext', () => {
    it('should create WebSocket correlation context', () => {
      const context = CorrelationIdManager.createWebSocketContext({
        callSid: 'CA123456789',
        streamSid: 'MZ123456789',
        sessionId: 'ws-session-123'
      });

      expect(context.source).toBe('websocket');
      expect(context.callSid).toBe('CA123456789');
      expect(context.streamSid).toBe('MZ123456789');
      expect(context.sessionId).toBe('ws-session-123');
      expect(context.correlationId).toMatch(/^twilio-CA123456789-[0-9a-f]{8}$/);
    });
  });

  describe('createBedrockContext', () => {
    it('should create Bedrock correlation context', () => {
      const sessionId = 'bedrock-session-123';
      const context = CorrelationIdManager.createBedrockContext(sessionId);

      expect(context.source).toBe('bedrock');
      expect(context.sessionId).toBe(sessionId);
      expect(context.correlationId).toMatch(/^bedrock-bedrock-session-123-[0-9a-f]{8}$/);
    });

    it('should inherit from parent context', () => {
      const parentContext = CorrelationIdManager.createContext({
        source: 'webhook',
        callSid: 'CA123456789',
        accountSid: 'AC123456789'
      });

      const sessionId = 'bedrock-session-123';
      const bedrockContext = CorrelationIdManager.createBedrockContext(sessionId, parentContext);

      expect(bedrockContext.source).toBe('bedrock');
      expect(bedrockContext.sessionId).toBe(sessionId);
      expect(bedrockContext.parentCorrelationId).toBe(parentContext.correlationId);
      expect(bedrockContext.callSid).toBe(parentContext.callSid);
      expect(bedrockContext.accountSid).toBe(parentContext.accountSid);
    });
  });

  describe('extractFromHeaders', () => {
    it('should extract correlation context from headers', () => {
      const headers = {
        'x-correlation-id': 'test-correlation-id',
        'x-twilio-call-sid': 'CA123456789',
        'x-session-id': 'session-123',
        'x-parent-correlation-id': 'parent-correlation-id'
      };

      const extracted = CorrelationIdManager.extractFromHeaders(headers);

      expect(extracted).toEqual({
        correlationId: 'test-correlation-id',
        callSid: 'CA123456789',
        sessionId: 'session-123',
        parentCorrelationId: 'parent-correlation-id'
      });
    });

    it('should handle array header values', () => {
      const headers = {
        'x-correlation-id': ['test-correlation-id', 'second-value']
      };

      const extracted = CorrelationIdManager.extractFromHeaders(headers);

      expect(extracted.correlationId).toBe('test-correlation-id');
    });
  });

  describe('createHeaders', () => {
    it('should create headers from correlation context', () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        correlationId: 'test-correlation-id',
        callSid: 'CA123456789',
        sessionId: 'session-123',
        parentCorrelationId: 'parent-correlation-id'
      });

      const headers = CorrelationIdManager.createHeaders(context);

      expect(headers).toEqual({
        'x-correlation-id': 'test-correlation-id',
        'x-twilio-call-sid': 'CA123456789',
        'x-session-id': 'session-123',
        'x-parent-correlation-id': 'parent-correlation-id'
      });
    });

    it('should use current context if none provided', () => {
      const context = CorrelationIdManager.createContext({
        source: 'webhook',
        correlationId: 'test-correlation-id'
      });

      CorrelationIdManager.setContext(context);
      const headers = CorrelationIdManager.createHeaders();

      expect(headers['x-correlation-id']).toBe('test-correlation-id');
    });
  });
});

describe('CorrelationScope', () => {
  it('should create scope with context', () => {
    const context = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789'
    });

    const scope = new CorrelationScope(context);
    expect(scope.getContext()).toEqual(context);
  });

  it('should run function within scope', () => {
    const context = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789'
    });

    const scope = new CorrelationScope(context);
    let capturedContext: CorrelationContext | undefined;

    scope.run(() => {
      capturedContext = CorrelationIdManager.getCurrentContext();
    });

    expect(capturedContext).toEqual(context);
  });

  it('should create child scope', () => {
    const parentContext = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789'
    });

    const parentScope = new CorrelationScope(parentContext);
    const childScope = parentScope.createChild({ sessionId: 'session-123' });

    const childContext = childScope.getContext();
    expect(childContext.parentCorrelationId).toBe(parentContext.correlationId);
    expect(childContext.sessionId).toBe('session-123');
  });
});

describe('Async Correlation Utilities', () => {
  it('should preserve context in wrapped callback', () => {
    const context = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789'
    });

    let capturedContext: CorrelationContext | undefined;
    const wrappedCallback = withContext(() => {
      capturedContext = CorrelationIdManager.getCurrentContext();
    }, context);

    // Execute callback outside of correlation context
    wrappedCallback();

    expect(capturedContext).toEqual(context);
  });

  it('should preserve context in setTimeout', (done) => {
    const context = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789'
    });

    CorrelationIdManager.runWithContext(context, () => {
      setTimeoutWithCorrelation(() => {
        const capturedContext = CorrelationIdManager.getCurrentContext();
        expect(capturedContext).toEqual(context);
        done();
      }, 10);
    });
  });
});

describe('Integration Tests', () => {
  it('should maintain correlation context through complex async flow', async () => {
    const webhookContext = CorrelationIdManager.createContext({
      source: 'webhook',
      callSid: 'CA123456789',
      accountSid: 'AC123456789'
    });

    const results: CorrelationContext[] = [];

    await CorrelationIdManager.runWithContext(webhookContext, async () => {
      // Capture webhook context
      results.push(CorrelationIdManager.getCurrentContext()!);

      // Create WebSocket context
      const wsContext = CorrelationIdManager.createWebSocketContext({
        callSid: 'CA123456789',
        sessionId: 'ws-session-123',
        parentCorrelationId: webhookContext.correlationId
      });

      await CorrelationIdManager.runWithContext(wsContext, async () => {
        // Capture WebSocket context
        results.push(CorrelationIdManager.getCurrentContext()!);

        // Create Bedrock context
        const bedrockContext = CorrelationIdManager.createBedrockContext(
          'bedrock-session-123',
          CorrelationIdManager.getCurrentContext()
        );

        await CorrelationIdManager.runWithContext(bedrockContext, async () => {
          // Capture Bedrock context
          results.push(CorrelationIdManager.getCurrentContext()!);

          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          results.push(CorrelationIdManager.getCurrentContext()!);
        });
      });
    });

    // Verify all contexts were captured correctly
    expect(results).toHaveLength(4);
    
    // Webhook context
    expect(results[0].source).toBe('webhook');
    expect(results[0].callSid).toBe('CA123456789');
    
    // WebSocket context
    expect(results[1].source).toBe('websocket');
    expect(results[1].callSid).toBe('CA123456789');
    expect(results[1].parentCorrelationId).toBe(results[0].correlationId);
    
    // Bedrock context
    expect(results[2].source).toBe('bedrock');
    expect(results[2].callSid).toBe('CA123456789');
    expect(results[2].parentCorrelationId).toBe(results[1].correlationId);
    
    // Async operation within Bedrock context
    expect(results[3]).toEqual(results[2]);
  });
});