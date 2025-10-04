/**
 * Tests for BedrockObservability
 */

import { bedrockObservability } from '../observability/bedrockObservability';

// Mock dependencies
jest.mock('../utils/logger');
jest.mock('../observability/metrics');
jest.mock('../observability/cloudWatchMetrics');
jest.mock('../observability/smartSampling', () => {
  const mockSmartSampler = {
    shouldSample: jest.fn(() => ({
      shouldSample: true,
      reason: 'test',
      sampleRate: 1.0
    })),
    startSpanWithSampling: jest.fn(() => ({
      end: jest.fn(),
      setAttributes: jest.fn(),
      setStatus: jest.fn(),
      recordException: jest.fn()
    }))
  };
  
  return {
    SmartSampler: {
      getInstance: jest.fn(() => mockSmartSampler)
    },
    smartSampler: mockSmartSampler
  };
});
jest.mock('@opentelemetry/api');

describe('BedrockObservability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Session Management', () => {
    it('should start a new session', () => {
      const sessionId = 'test-session-123';
      const modelId = 'amazon.nova-sonic-v1:0';

      expect(() => {
        bedrockObservability.startSession(sessionId, modelId);
      }).not.toThrow();
    });

    it('should complete a session', () => {
      const sessionId = 'test-session-123';
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.completeSession(sessionId, 'completed');
      }).not.toThrow();
    });

    it('should handle completing non-existent session', () => {
      expect(() => {
        bedrockObservability.completeSession('non-existent', 'completed');
      }).not.toThrow();
    });
  });

  describe('Event Recording', () => {
    it('should record events for active session', () => {
      const sessionId = 'test-session-123';
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.recordEvent(sessionId, 'audioOutput', { chunkSize: 1024 });
      }).not.toThrow();
      
      expect(() => {
        bedrockObservability.recordEvent(sessionId, 'textOutput', { text: 'Hello' });
      }).not.toThrow();
    });

    it('should handle events for non-existent session', () => {
      expect(() => {
        bedrockObservability.recordEvent('non-existent', 'audioOutput');
      }).not.toThrow();
    });
  });

  describe('Error Recording', () => {
    it('should record errors for active session', () => {
      const sessionId = 'test-session-123';
      const error = new Error('Test error');
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.recordError(sessionId, error);
      }).not.toThrow();
    });

    it('should record string errors', () => {
      const sessionId = 'test-session-123';
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.recordError(sessionId, 'String error message');
      }).not.toThrow();
    });

    it('should handle errors for non-existent session', () => {
      expect(() => {
        bedrockObservability.recordError('non-existent', 'Error message');
      }).not.toThrow();
    });
  });

  describe('Usage Recording', () => {
    it('should record token usage', () => {
      const sessionId = 'test-session-123';
      const usage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      };
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.recordUsage(sessionId, usage);
      }).not.toThrow();
    });

    it('should handle usage for non-existent session', () => {
      const usage = {
        inputTokens: 100,
        outputTokens: 50
      };
      
      expect(() => {
        bedrockObservability.recordUsage('non-existent', usage);
      }).not.toThrow();
    });
  });

  describe('Session Lifecycle', () => {
    it('should handle complete session lifecycle', () => {
      const sessionId = 'lifecycle-session';
      const modelId = 'amazon.nova-sonic-v1:0';
      
      // Start session
      bedrockObservability.startSession(sessionId, modelId);
      
      // Record some events
      bedrockObservability.recordEvent(sessionId, 'audioOutput');
      bedrockObservability.recordEvent(sessionId, 'textOutput');
      
      // Record usage
      bedrockObservability.recordUsage(sessionId, {
        inputTokens: 100,
        outputTokens: 50
      });
      
      // Complete session
      bedrockObservability.completeSession(sessionId, 'completed');
      
      // Should not throw any errors
      expect(true).toBe(true);
    });

    it('should handle session timeout', () => {
      const sessionId = 'timeout-session';
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.completeSession(sessionId, 'timeout');
      }).not.toThrow();
    });

    it('should handle session error', () => {
      const sessionId = 'error-session';
      
      bedrockObservability.startSession(sessionId);
      
      expect(() => {
        bedrockObservability.completeSession(sessionId, 'error');
      }).not.toThrow();
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should shutdown gracefully', () => {
      expect(() => {
        bedrockObservability.shutdown();
      }).not.toThrow();
    });

    it('should handle multiple shutdowns', () => {
      bedrockObservability.shutdown();
      
      expect(() => {
        bedrockObservability.shutdown();
      }).not.toThrow();
    });
  });
});