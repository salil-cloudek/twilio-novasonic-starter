/**
 * Tests for StreamProcessor
 */

import { StreamProcessor } from '../streaming/StreamProcessor';
import { EventDispatcher } from '../events/EventDispatcher';

// Mock dependencies
jest.mock('../utils/logger');

describe('StreamProcessor', () => {
  let streamProcessor: StreamProcessor;
  let mockEventDispatcher: jest.Mocked<EventDispatcher>;

  beforeEach(() => {
    mockEventDispatcher = {
      dispatchEvent: jest.fn(),
      normalizeEventData: jest.fn(),
      publishToResponseSubject: jest.fn(),
      dispatchToEventHandlers: jest.fn(),
      handleAudioOutput: jest.fn(),
      handleTextOutput: jest.fn()
    } as any;
    
    streamProcessor = new StreamProcessor(mockEventDispatcher);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with EventDispatcher', () => {
      expect(streamProcessor).toBeDefined();
    });
  });

  describe('Session Async Iterable', () => {
    it('should create async iterable for active session', () => {
      const sessionId = 'test-session';
      const mockSession = {
        isActive: true,
        queue: [],
        queueSignal: { pipe: jest.fn(() => ({ pipe: jest.fn() })) },
        closeSignal: { pipe: jest.fn(() => ({ pipe: jest.fn() })) },
        isWaitingForResponse: false
      } as any;

      const iterable = streamProcessor.createSessionAsyncIterable(sessionId, mockSession);
      
      expect(iterable).toBeDefined();
      expect(iterable[Symbol.asyncIterator]).toBeDefined();
    });

    it('should return empty iterable for inactive session', () => {
      const sessionId = 'test-session';
      const mockSession = {
        isActive: false,
        queue: [],
        queueSignal: { pipe: jest.fn() },
        closeSignal: { pipe: jest.fn() },
        isWaitingForResponse: false
      } as any;

      const iterable = streamProcessor.createSessionAsyncIterable(sessionId, mockSession);
      
      expect(iterable).toBeDefined();
    });
  });

  describe('Response Stream Processing', () => {
    it('should process response stream', async () => {
      const sessionId = 'test-session';
      const mockSession = {
        isActive: true,
        queue: [],
        queueSignal: { pipe: jest.fn() },
        closeSignal: { pipe: jest.fn() },
        isWaitingForResponse: false
      } as any;

      const mockResponse = {
        body: []
      };

      await streamProcessor.processResponseStream(sessionId, mockSession, mockResponse);
      
      expect(mockEventDispatcher.dispatchEvent).toHaveBeenCalledWith(
        sessionId, 
        mockSession, 
        'streamComplete', 
        expect.any(Object)
      );
    });

    it('should handle response stream with events', async () => {
      const sessionId = 'test-session';
      const mockSession = {
        isActive: true,
        queue: [],
        queueSignal: { pipe: jest.fn() },
        closeSignal: { pipe: jest.fn() },
        isWaitingForResponse: false
      } as any;

      const mockEvent = {
        chunk: {
          bytes: new TextEncoder().encode(JSON.stringify({
            event: {
              textOutput: { text: 'Hello' }
            }
          }))
        }
      };

      const mockResponse = {
        body: [mockEvent]
      };

      await streamProcessor.processResponseStream(sessionId, mockSession, mockResponse);
      
      expect(mockEventDispatcher.dispatchEvent).toHaveBeenCalled();
    });

    it('should handle stream errors', async () => {
      const sessionId = 'test-session';
      const mockSession = {
        isActive: true,
        queue: [],
        queueSignal: { pipe: jest.fn() },
        closeSignal: { pipe: jest.fn() },
        isWaitingForResponse: false
      } as any;

      const mockResponse = {
        body: {
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(new Error('Stream error'))
          })
        }
      };

      await streamProcessor.processResponseStream(sessionId, mockSession, mockResponse);
      
      expect(mockEventDispatcher.dispatchEvent).toHaveBeenCalledWith(
        sessionId,
        mockSession,
        'error',
        expect.objectContaining({
          source: 'responseStream'
        })
      );
    });
  });
});