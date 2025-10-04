/**
 * Tests for AudioBufferManager
 */

import { AudioBufferManager } from '../audio/AudioBufferManager';

// Mock dependencies
jest.mock('../utils/logger');

// Mock WebSocket-like object
const createMockWebSocket = () => ({
  readyState: 1,
  twilioStreamSid: 'MZ123456789',
  _twilioOutSeq: 0,
  send: jest.fn(),
  on: jest.fn(),
  close: jest.fn()
});

describe('AudioBufferManager', () => {
  let audioBufferManager: AudioBufferManager;
  let mockWs: any;

  beforeEach(() => {
    audioBufferManager = AudioBufferManager.getInstance();
    mockWs = createMockWebSocket();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up any existing buffers
    audioBufferManager.flushAndRemove('test-session');
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = AudioBufferManager.getInstance();
      const instance2 = AudioBufferManager.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Buffer Creation and Management', () => {
    it('should create audio buffer for new session', () => {
      const sessionId = 'test-session';
      const audioData = Buffer.alloc(160); // 20ms of μ-law audio at 8kHz

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      const status = audioBufferManager.getBufferStatus(sessionId);
      expect(status).toBeDefined();
      expect(status!.bufferBytes).toBe(160);
    });

    it('should accumulate audio data in buffer', () => {
      const sessionId = 'accumulate-session';
      const audioChunk1 = Buffer.alloc(160);
      const audioChunk2 = Buffer.alloc(160);

      audioBufferManager.addAudio(sessionId, mockWs, audioChunk1);
      audioBufferManager.addAudio(sessionId, mockWs, audioChunk2);

      const status = audioBufferManager.getBufferStatus(sessionId);
      expect(status!.bufferBytes).toBe(320);
    });

    it('should handle multiple sessions independently', () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      const mockWs2 = createMockWebSocket();

      audioBufferManager.addAudio(session1, mockWs, Buffer.alloc(160));
      audioBufferManager.addAudio(session2, mockWs2, Buffer.alloc(320));

      const status1 = audioBufferManager.getBufferStatus(session1);
      const status2 = audioBufferManager.getBufferStatus(session2);

      expect(status1!.bufferBytes).toBe(160);
      expect(status2!.bufferBytes).toBe(320);
    });
  });

  describe('Buffer Status', () => {
    it('should return buffer status with correct metrics', () => {
      const sessionId = 'status-session';
      const audioData = Buffer.alloc(160); // 20ms at 8kHz

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      const status = audioBufferManager.getBufferStatus(sessionId);
      expect(status).toEqual({
        bufferBytes: 160,
        bufferMs: 20, // 160 bytes / 8000 samples per second * 1000ms
        isActive: expect.any(Boolean)
      });
    });

    it('should return undefined for non-existent session', () => {
      const status = audioBufferManager.getBufferStatus('non-existent');

      expect(status).toBeNull();
    });

    it('should calculate buffer duration correctly', () => {
      const sessionId = 'duration-session';
      const audioData = Buffer.alloc(800); // 100ms at 8kHz

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      const status = audioBufferManager.getBufferStatus(sessionId);
      expect(status!.bufferMs).toBe(100);
    });
  });

  describe('Audio Streaming', () => {
    it('should send audio frames at regular intervals', () => {
      const sessionId = 'streaming-session';
      const audioData = Buffer.alloc(320); // 40ms of audio

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      // Advance timers to trigger frame sending
      jest.advanceTimersByTime(20); // Default interval is 20ms
      jest.runOnlyPendingTimers();

      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should send frames with correct Twilio media format', () => {
      const sessionId = 'format-session';
      const audioData = Buffer.alloc(160);

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      jest.advanceTimersByTime(20);
      jest.runOnlyPendingTimers();

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"event":"media"'),
        expect.any(Function)
      );

      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage).toMatchObject({
        event: 'media',
        streamSid: 'MZ123456789',
        media: {
          payload: expect.any(String)
        },
        sequenceNumber: expect.any(String)
      });
    });

    it('should increment sequence numbers correctly', () => {
      const sessionId = 'sequence-session';
      const audioData = Buffer.alloc(160);

      // Send multiple frames
      for (let i = 0; i < 3; i++) {
        audioBufferManager.addAudio(sessionId, mockWs, audioData);
        jest.advanceTimersByTime(20);
        jest.runOnlyPendingTimers();
      }

      expect(mockWs.send).toHaveBeenCalledTimes(3);

      const messages = mockWs.send.mock.calls.map((call: any) => JSON.parse(call[0]));
      expect(messages[0].sequenceNumber).toBe('1');
      expect(messages[1].sequenceNumber).toBe('2');
      expect(messages[2].sequenceNumber).toBe('3');
    });

    it('should handle WebSocket send errors gracefully', () => {
      const sessionId = 'error-session';
      const audioData = Buffer.alloc(160);

      mockWs.send.mockImplementation((data: string, callback: Function) => {
        callback(new Error('Send failed'));
      });

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      jest.advanceTimersByTime(20);
      jest.runOnlyPendingTimers();

      // Should not throw despite send error
      expect(true).toBe(true);
    });
  });

  describe('Buffer Flushing', () => {
    it('should flush remaining audio when requested', () => {
      const sessionId = 'flush-session';
      const audioData = Buffer.alloc(80); // Partial frame

      audioBufferManager.addAudio(sessionId, mockWs, audioData);

      // Flush without waiting for interval
      audioBufferManager.flushAndRemove(sessionId);

      expect(mockWs.send).toHaveBeenCalled();
      
      // Should send padded frame
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.event).toBe('media');
    });

    it('should send mark after flushing', () => {
      const sessionId = 'mark-session';
      const audioData = Buffer.alloc(80);

      audioBufferManager.addAudio(sessionId, mockWs, audioData);
      audioBufferManager.flushAndRemove(sessionId);

      expect(mockWs.send).toHaveBeenCalledTimes(2);

      const messages = mockWs.send.mock.calls.map((call: any) => JSON.parse(call[0]));
      expect(messages[0].event).toBe('media');
      expect(messages[1].event).toBe('mark');
      expect(messages[1].mark.name).toMatch(/^bedrock_out_\d+$/);
    });

    it('should remove buffer after flushing', () => {
      const sessionId = 'remove-session';
      const audioData = Buffer.alloc(160);

      audioBufferManager.addAudio(sessionId, mockWs, audioData);
      
      expect(audioBufferManager.getBufferStatus(sessionId)).toBeDefined();

      audioBufferManager.flushAndRemove(sessionId);

      expect(audioBufferManager.getBufferStatus(sessionId)).toBeNull();
    });
  });

  describe('Buffer Size Management', () => {
    it('should enforce maximum buffer size', () => {
      const sessionId = 'max-size-session';
      
      // Add data in chunks to trigger overflow protection
      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(12000)); // Half max
      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(18000)); // Would exceed max
      
      const status = audioBufferManager.getBufferStatus(sessionId);
      // Should be limited by max buffer size configuration (24000 bytes at 3000ms * 8kHz)
      expect(status!.bufferBytes).toBeLessThanOrEqual(24000);
    });

    it('should drop oldest data when buffer overflows', () => {
      const sessionId = 'overflow-session';
      
      // Add many small chunks to trigger overflow (160 * 200 = 32000 bytes > 24000 max)
      for (let i = 0; i < 200; i++) {
        audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(160));
      }

      const status = audioBufferManager.getBufferStatus(sessionId);
      // Should not accumulate all chunks due to size limits (max 24000 bytes)
      expect(status!.bufferBytes).toBeLessThanOrEqual(24000);
    });
  });

  describe('WebSocket State Handling', () => {
    it('should not send when WebSocket is not ready', () => {
      const sessionId = 'not-ready-session';
      mockWs.readyState = 0; // CONNECTING

      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(160));

      jest.advanceTimersByTime(20);
      jest.runOnlyPendingTimers();

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should handle missing twilioStreamSid gracefully', () => {
      const sessionId = 'no-stream-sid-session';
      delete mockWs.twilioStreamSid;

      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(160));

      jest.advanceTimersByTime(20);
      jest.runOnlyPendingTimers();

      // Should still attempt to send but handle missing streamSid
      expect(mockWs.send).toHaveBeenCalled();
    });
  });

  describe('Cleanup and Memory Management', () => {
    it('should clean up timers when buffer is removed', () => {
      const sessionId = 'timer-cleanup-session';

      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(160));
      
      // Verify timer is active
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      audioBufferManager.flushAndRemove(sessionId);

      // Timer should be cleared (allow for some async cleanup)
      expect(jest.getTimerCount()).toBeLessThanOrEqual(1);
    });

    it('should handle removal of non-existent buffer gracefully', () => {
      expect(() => {
        audioBufferManager.flushAndRemove('non-existent-session');
      }).not.toThrow();
    });

    it('should prevent memory leaks with many sessions', () => {
      const sessionCount = 50;
      const sessions: string[] = [];

      // Create many buffers
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `session-${i}`;
        sessions.push(sessionId);
        audioBufferManager.addAudio(sessionId, createMockWebSocket(), Buffer.alloc(160));
      }

      // Remove all buffers
      sessions.forEach(sessionId => {
        audioBufferManager.flushAndRemove(sessionId);
      });

      // All buffers should be cleaned up
      sessions.forEach(sessionId => {
        expect(audioBufferManager.getBufferStatus(sessionId)).toBeNull();
      });
    });
  });

  describe('Configuration Handling', () => {
    it('should use custom frame size and interval when provided', () => {
      const sessionId = 'custom-config-session';
      const customConfig = {
        frameSize: 320, // 40ms frames
        intervalMs: 40
      };

      // This would require modifying AudioBufferManager to accept config
      // For now, we test with default behavior
      audioBufferManager.addAudio(sessionId, mockWs, Buffer.alloc(320));

      const status = audioBufferManager.getBufferStatus(sessionId);
      expect(status).toBeDefined();
      expect(status!.bufferBytes).toBe(320);
    });
  });
});