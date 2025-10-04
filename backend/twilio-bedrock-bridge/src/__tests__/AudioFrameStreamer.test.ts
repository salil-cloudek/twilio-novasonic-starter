/**
 * Tests for AudioFrameStreamer module
 */

import { streamAudioFrames, WebSocketLike } from '../audio/AudioFrameStreamer';

// Mock WebSocket implementation for testing
class MockWebSocket implements WebSocketLike {
  readyState = 1;
  twilioStreamSid = 'test-stream-sid';
  _twilioOutSeq = 0;
  
  private sentMessages: string[] = [];
  private eventHandlers: { [event: string]: ((...args: any[]) => void)[] } = {};

  send(data: string, callback?: (err?: Error) => void): void {
    this.sentMessages.push(data);
    if (callback) {
      // Simulate async callback
      setTimeout(() => callback(), 0);
    }
  }

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(listener);
  }

  getSentMessages(): string[] {
    return this.sentMessages;
  }

  triggerEvent(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers[event] || [];
    handlers.forEach(handler => handler(...args));
  }
}

describe('AudioFrameStreamer', () => {
  let mockWs: MockWebSocket;
  
  beforeEach(() => {
    mockWs = new MockWebSocket();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should stream audio frames with correct timing', async () => {
    const testBuffer = Buffer.alloc(320); // 2 frames of 160 bytes each
    const sessionId = 'test-session';
    
    streamAudioFrames(mockWs, testBuffer, sessionId, {
      frameSize: 160,
      intervalMs: 20
    });

    // Fast-forward time to send first frame
    jest.advanceTimersByTime(20);
    
    expect(mockWs.getSentMessages()).toHaveLength(1);
    
    const firstMessage = JSON.parse(mockWs.getSentMessages()[0]);
    expect(firstMessage.event).toBe('media');
    expect(firstMessage.streamSid).toBe('test-stream-sid');
    expect(firstMessage.sequenceNumber).toBe('1');
    expect(firstMessage.media.payload).toBeDefined();

    // Fast-forward to send second frame
    jest.advanceTimersByTime(20);
    
    expect(mockWs.getSentMessages()).toHaveLength(2);
    
    // Fast-forward to complete streaming and send mark
    jest.advanceTimersByTime(20);
    
    expect(mockWs.getSentMessages()).toHaveLength(3);
    
    const markMessage = JSON.parse(mockWs.getSentMessages()[2]);
    expect(markMessage.event).toBe('mark');
    expect(markMessage.mark.name).toMatch(/^bedrock_out_\d+$/);
  });

  test('should handle WebSocket close during streaming', () => {
    const testBuffer = Buffer.alloc(320);
    const sessionId = 'test-session';
    
    streamAudioFrames(mockWs, testBuffer, sessionId);
    
    // Close WebSocket
    mockWs.readyState = 3; // CLOSED
    
    // Fast-forward time
    jest.advanceTimersByTime(20);
    
    // Should not send any messages after close
    expect(mockWs.getSentMessages()).toHaveLength(0);
  });

  test('should handle backpressure correctly', () => {
    const testBuffer = Buffer.alloc(160);
    const sessionId = 'test-session';
    
    // Mock high buffered amount
    (mockWs as any).bufferedAmount = 100000;
    
    streamAudioFrames(mockWs, testBuffer, sessionId, {
      bufferedAmountThreshold: 65536
    });
    
    // Fast-forward time
    jest.advanceTimersByTime(20);
    
    // Should skip sending due to backpressure
    expect(mockWs.getSentMessages()).toHaveLength(0);
    
    // Reduce buffered amount
    (mockWs as any).bufferedAmount = 1000;
    
    // Fast-forward time again
    jest.advanceTimersByTime(20);
    
    // Should now send the frame
    expect(mockWs.getSentMessages()).toHaveLength(1);
  });

  test('should handle send errors gracefully', () => {
    const testBuffer = Buffer.alloc(160);
    const sessionId = 'test-session';
    
    // Mock send to trigger error in callback
    mockWs.send = jest.fn((data: string, callback?: (err?: Error) => void) => {
      if (callback) {
        setTimeout(() => callback(new Error('Send failed')), 0);
      }
    });
    
    streamAudioFrames(mockWs, testBuffer, sessionId);
    
    // Fast-forward time to trigger send
    jest.advanceTimersByTime(20);
    
    // Fast-forward to allow callback to execute
    jest.advanceTimersByTime(1);
    
    // Should have attempted to send
    expect(mockWs.send).toHaveBeenCalled();
  });
});