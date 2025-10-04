/**
 * Tests for EventDispatcher
 */

import { EventDispatcher } from '../events/EventDispatcher';
import { SessionData } from '../session/SessionManager';
import { Subject } from 'rxjs';

// Mock dependencies
jest.mock('../utils/logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

describe('EventDispatcher', () => {
  let eventDispatcher: EventDispatcher;
  let mockSession: SessionData;

  beforeEach(() => {
    eventDispatcher = new EventDispatcher();
    
    mockSession = {
      queue: [],
      queueSignal: new Subject<void>(),
      closeSignal: new Subject<void>(),
      responseSubject: new Subject<any>(),
      responseHandlers: new Map(),
      promptName: 'test-prompt',
      inferenceConfig: { maxTokens: 1024, topP: 0.9, temperature: 0.7 },
      isActive: true,
      isPromptStartSent: false,
      isAudioContentStartSent: false,
      audioContentId: 'test-audio-id',
      isWaitingForResponse: false
    };

    jest.clearAllMocks();
  });

  describe('normalizeEventData', () => {
    it('should normalize event data with contentId and contentName', () => {
      const eventData = { contentId: 'test-id', someField: 'value' };

      const normalized = eventDispatcher.normalizeEventData(eventData);

      expect(normalized.contentId).toBe('test-id');
      expect(normalized.contentName).toBe('test-id');
    });

    it('should use contentName if contentId is missing', () => {
      const eventData = { contentName: 'test-name', someField: 'value' };

      const normalized = eventDispatcher.normalizeEventData(eventData);

      expect(normalized.contentId).toBe('test-name');
      expect(normalized.contentName).toBe('test-name');
    });

    it('should parse additionalModelFields JSON string', () => {
      const eventData = {
        additionalModelFields: '{"key": "value", "number": 42}'
      };

      const normalized = eventDispatcher.normalizeEventData(eventData);

      expect(normalized.parsedAdditionalModelFields).toEqual({
        key: 'value',
        number: 42
      });
    });

    it('should handle invalid JSON in additionalModelFields gracefully', () => {
      const eventData = {
        additionalModelFields: 'invalid json'
      };

      const normalized = eventDispatcher.normalizeEventData(eventData);

      expect(normalized.parsedAdditionalModelFields).toBeUndefined();
    });

    it('should handle null and undefined input', () => {
      expect(eventDispatcher.normalizeEventData(null)).toBeNull();
      expect(eventDispatcher.normalizeEventData(undefined)).toBeUndefined();
      expect(eventDispatcher.normalizeEventData('string')).toBe('string');
    });
  });

  describe('dispatchEvent', () => {
    it('should dispatch event to registered handler', () => {
      const handler = jest.fn();
      const eventData = { message: 'test data' };

      mockSession.responseHandlers.set('testEvent', handler);
      eventDispatcher.dispatchEvent('session-1', mockSession, 'testEvent', eventData);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'test data' })
      );
    });

    it('should publish to response subject', () => {
      const nextSpy = jest.spyOn(mockSession.responseSubject, 'next');
      const eventData = { message: 'test data' };

      eventDispatcher.dispatchEvent('session-1', mockSession, 'testEvent', eventData);

      expect(nextSpy).toHaveBeenCalledWith({
        type: 'testEvent',
        data: expect.objectContaining({ message: 'test data' })
      });
    });

    it('should dispatch to any handlers', () => {
      const anyHandler = jest.fn();
      const eventData = { message: 'test data' };

      mockSession.responseHandlers.set('any', anyHandler);
      eventDispatcher.dispatchEvent('session-1', mockSession, 'testEvent', eventData);

      expect(anyHandler).toHaveBeenCalledWith({
        type: 'testEvent',
        data: expect.objectContaining({ message: 'test data' })
      });
    });

    it('should handle missing session gracefully', () => {
      const logger = require('../utils/logger');

      eventDispatcher.dispatchEvent('session-1', null as any, 'testEvent', {});

      expect(logger.warn).toHaveBeenCalledWith(
        'Cannot dispatch event testEvent: session session-1 not found'
      );
    });

    it('should handle handler errors gracefully', () => {
      const logger = require('../utils/logger');
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });

      mockSession.responseHandlers.set('errorEvent', errorHandler);
      eventDispatcher.dispatchEvent('session-1', mockSession, 'errorEvent', {});

      expect(logger.error).toHaveBeenCalledWith(
        'Error in errorEvent handler for session session-1:',
        expect.any(Error)
      );
    });
  });

  describe('registerEventHandler', () => {
    it('should register event handler for session', () => {
      const handler = jest.fn();

      eventDispatcher.registerEventHandler(mockSession, 'testEvent', handler);

      expect(mockSession.responseHandlers.get('testEvent')).toBe(handler);
    });

    it('should allow multiple handlers for different events', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventDispatcher.registerEventHandler(mockSession, 'event1', handler1);
      eventDispatcher.registerEventHandler(mockSession, 'event2', handler2);

      expect(mockSession.responseHandlers.get('event1')).toBe(handler1);
      expect(mockSession.responseHandlers.get('event2')).toBe(handler2);
    });

    it('should overwrite existing handler for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      eventDispatcher.registerEventHandler(mockSession, 'testEvent', handler1);
      eventDispatcher.registerEventHandler(mockSession, 'testEvent', handler2);

      expect(mockSession.responseHandlers.get('testEvent')).toBe(handler2);
    });
  });

  describe('Integration', () => {
    it('should handle complete event flow', () => {
      const specificHandler = jest.fn();
      const anyHandler = jest.fn();
      const nextSpy = jest.spyOn(mockSession.responseSubject, 'next');

      // Register handlers
      eventDispatcher.registerEventHandler(mockSession, 'audioOutput', specificHandler);
      eventDispatcher.registerEventHandler(mockSession, 'any', anyHandler);

      // Dispatch event
      const eventData = {
        contentId: 'audio-123',
        audioData: 'base64-encoded-audio',
        additionalModelFields: '{"sampleRate": 16000}'
      };

      eventDispatcher.dispatchEvent('session-1', mockSession, 'audioOutput', eventData);

      // Verify all handlers were called with normalized data
      const expectedNormalizedData = expect.objectContaining({
        contentId: 'audio-123',
        contentName: 'audio-123',
        audioData: 'base64-encoded-audio',
        parsedAdditionalModelFields: { sampleRate: 16000 }
      });

      expect(specificHandler).toHaveBeenCalledWith(expectedNormalizedData);
      expect(anyHandler).toHaveBeenCalledWith({
        type: 'audioOutput',
        data: expectedNormalizedData
      });
      expect(nextSpy).toHaveBeenCalledWith({
        type: 'audioOutput',
        data: expectedNormalizedData
      });
    });
  });
});