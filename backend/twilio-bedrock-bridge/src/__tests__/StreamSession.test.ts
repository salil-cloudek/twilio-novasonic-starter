/**
 * Tests for StreamSession class
 */

import { StreamSession } from '../client';
import { NovaSonicBidirectionalStreamClient } from '../client';

// Mock dependencies
jest.mock('../utils/logger');
jest.mock('../utils/correlationId', () => ({
  CorrelationIdManager: {
    getCurrentContext: jest.fn().mockReturnValue({ correlationId: 'parent-correlation-id' }),
    createBedrockContext: jest.fn().mockReturnValue({ correlationId: 'bedrock-correlation-id' }),
    setContext: jest.fn()
  }
}));

describe('StreamSession', () => {
  let mockClient: jest.Mocked<NovaSonicBidirectionalStreamClient>;
  let session: StreamSession;
  const sessionId = 'test-session-id';

  beforeEach(() => {
    mockClient = {
      isSessionActive: jest.fn().mockReturnValue(true),
      setupPromptStartEvent: jest.fn(),
      setupSystemPromptEvent: jest.fn(),
      setupStartAudioEvent: jest.fn(),
      registerEventHandler: jest.fn(),
      streamAudioChunk: jest.fn().mockResolvedValue(undefined),
      sendContentEnd: jest.fn(),
      sendPromptEnd: jest.fn(),
      sendSessionEnd: jest.fn(),
      removeStreamSession: jest.fn(),
      enableRealtimeInterruption: jest.fn(),
      handleUserInterruption: jest.fn(),
      setUserSpeakingState: jest.fn()
    } as any;

    session = new StreamSession(sessionId, mockClient);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create session with proper initialization', () => {
      expect(session.getSessionId()).toBe(sessionId);
    });

    it('should set up Bedrock correlation context', () => {
      const { CorrelationIdManager } = require('../utils/correlationId');
      
      expect(CorrelationIdManager.createBedrockContext).toHaveBeenCalledWith(
        sessionId,
        { correlationId: 'parent-correlation-id' }
      );
      expect(CorrelationIdManager.setContext).toHaveBeenCalledWith({
        correlationId: 'bedrock-correlation-id'
      });
    });
  });

  describe('Session Setup Methods', () => {
    describe('setupPromptStart', () => {
      it('should call client setupPromptStartEvent', () => {
        session.setupPromptStart();

        expect(mockClient.setupPromptStartEvent).toHaveBeenCalledWith(sessionId);
      });
    });

    describe('setupSystemPrompt', () => {
      it('should call client setupSystemPromptEvent with defaults', () => {
        session.setupSystemPrompt();

        expect(mockClient.setupSystemPromptEvent).toHaveBeenCalledWith(
          sessionId,
          expect.any(Object), // DefaultTextConfiguration
          expect.any(String)  // DefaultSystemPrompt
        );
      });

      it('should call client setupSystemPromptEvent with custom parameters', () => {
        const customTextConfig = { mediaType: 'text/plain' };
        const customPrompt = 'Custom system prompt';

        session.setupSystemPrompt(customTextConfig as any, customPrompt);

        expect(mockClient.setupSystemPromptEvent).toHaveBeenCalledWith(
          sessionId,
          customTextConfig,
          customPrompt
        );
      });
    });

    describe('setupStartAudio', () => {
      it('should call client setupStartAudioEvent with defaults', () => {
        session.setupStartAudio();

        expect(mockClient.setupStartAudioEvent).toHaveBeenCalledWith(
          sessionId,
          expect.any(Object) // DefaultAudioInputConfiguration
        );
      });

      it('should call client setupStartAudioEvent with custom config', () => {
        const customAudioConfig = { sampleRateHertz: 16000 };

        session.setupStartAudio(customAudioConfig as any);

        expect(mockClient.setupStartAudioEvent).toHaveBeenCalledWith(
          sessionId,
          customAudioConfig
        );
      });
    });
  });

  describe('Audio Streaming Methods', () => {
    describe('streamAudio', () => {
      it('should stream audio data through client', async () => {
        const audioData = Buffer.from('test-audio-data');

        await session.streamAudio(audioData);

        expect(mockClient.streamAudioChunk).toHaveBeenCalledWith(sessionId, audioData);
      });

      it('should not stream if session is inactive', async () => {
        const audioData = Buffer.from('test-audio-data');
        
        // Close session first
        await session.close();

        await session.streamAudio(audioData);

        expect(mockClient.streamAudioChunk).not.toHaveBeenCalled();
      });

      it('should manage input buffer size', async () => {
        const audioData = Buffer.from('test-audio-data');

        // Stream multiple chunks to test buffer management
        for (let i = 0; i < 10; i++) {
          await session.streamAudio(audioData);
        }

        expect(mockClient.streamAudioChunk).toHaveBeenCalledTimes(10);
      });
    });

    describe('streamAudioRealtime', () => {
      it('should stream audio in real-time mode', async () => {
        const audioData = Buffer.from('realtime-audio-data');

        await session.streamAudioRealtime(audioData);

        expect(mockClient.streamAudioChunk).toHaveBeenCalledWith(sessionId, audioData);
      });

      it('should not stream if session is inactive', async () => {
        const audioData = Buffer.from('realtime-audio-data');
        
        // Close session first
        await session.close();

        await session.streamAudioRealtime(audioData);

        expect(mockClient.streamAudioChunk).not.toHaveBeenCalled();
      });
    });
  });

  describe('Audio Output Buffer Methods', () => {
    describe('bufferAudioOutput', () => {
      it('should buffer audio output data', () => {
        const audioData = Buffer.from('output-audio-data');

        session.bufferAudioOutput(audioData);

        expect(session.getOutputBufferSize()).toBe(1);
      });

      it('should not buffer if session is inactive', async () => {
        const audioData = Buffer.from('output-audio-data');
        
        // Close session first
        await session.close();

        session.bufferAudioOutput(audioData);

        expect(session.getOutputBufferSize()).toBe(0);
      });

      it('should manage output buffer size limits', () => {
        const audioData = Buffer.from('output-audio-data');

        // Buffer many chunks to test size management
        for (let i = 0; i < 1000; i++) {
          session.bufferAudioOutput(audioData);
        }

        // Should not exceed maximum buffer size
        expect(session.getOutputBufferSize()).toBeLessThan(1000);
      });
    });

    describe('getNextAudioOutput', () => {
      it('should return next audio chunk from buffer', () => {
        const audioData1 = Buffer.from('audio-1');
        const audioData2 = Buffer.from('audio-2');

        session.bufferAudioOutput(audioData1);
        session.bufferAudioOutput(audioData2);

        const firstChunk = session.getNextAudioOutput();
        const secondChunk = session.getNextAudioOutput();
        const thirdChunk = session.getNextAudioOutput();

        expect(firstChunk).toEqual(audioData1);
        expect(secondChunk).toEqual(audioData2);
        expect(thirdChunk).toBeNull();
      });

      it('should return null when buffer is empty', () => {
        const chunk = session.getNextAudioOutput();

        expect(chunk).toBeNull();
      });
    });

    describe('clearOutputBuffer', () => {
      it('should clear all buffered audio output', () => {
        const audioData = Buffer.from('output-audio-data');

        session.bufferAudioOutput(audioData);
        session.bufferAudioOutput(audioData);
        expect(session.getOutputBufferSize()).toBe(2);

        session.clearOutputBuffer();

        expect(session.getOutputBufferSize()).toBe(0);
        expect(session.getNextAudioOutput()).toBeNull();
      });
    });
  });

  describe('Conversation Control Methods', () => {
    describe('endAudioContent', () => {
      it('should call client sendContentEnd', () => {
        session.endAudioContent();

        expect(mockClient.sendContentEnd).toHaveBeenCalledWith(sessionId);
      });

      it('should not call client if session is inactive', async () => {
        await session.close();

        session.endAudioContent();

        expect(mockClient.sendContentEnd).not.toHaveBeenCalled();
      });
    });

    describe('endPrompt', () => {
      it('should call client sendPromptEnd', () => {
        session.endPrompt();

        expect(mockClient.sendPromptEnd).toHaveBeenCalledWith(sessionId);
      });

      it('should not call client if session is inactive', async () => {
        await session.close();

        session.endPrompt();

        expect(mockClient.sendPromptEnd).not.toHaveBeenCalled();
      });
    });

    describe('endUserTurn', () => {
      it('should end audio content and prompt', () => {
        session.endUserTurn();

        expect(mockClient.sendContentEnd).toHaveBeenCalledWith(sessionId);
        expect(mockClient.sendPromptEnd).toHaveBeenCalledWith(sessionId);
      });

      it('should handle errors gracefully', () => {
        mockClient.sendContentEnd.mockImplementation(() => {
          throw new Error('Test error');
        });

        expect(() => session.endUserTurn()).not.toThrow();
      });

      it('should not call client methods if session is inactive', async () => {
        await session.close();

        session.endUserTurn();

        expect(mockClient.sendContentEnd).not.toHaveBeenCalled();
        expect(mockClient.sendPromptEnd).not.toHaveBeenCalled();
      });
    });

    describe('interruptModel', () => {
      it('should call client handleUserInterruption', () => {
        session.interruptModel();

        expect(mockClient.handleUserInterruption).toHaveBeenCalledWith(sessionId);
      });

      it('should not call client if session is inactive', async () => {
        await session.close();

        session.interruptModel();

        expect(mockClient.handleUserInterruption).not.toHaveBeenCalled();
      });
    });

    describe('setUserSpeaking', () => {
      it('should call client setUserSpeakingState', () => {
        session.setUserSpeaking(true);

        expect(mockClient.setUserSpeakingState).toHaveBeenCalledWith(sessionId, true);
      });

      it('should not call client if session is inactive', async () => {
        await session.close();

        session.setUserSpeaking(true);

        expect(mockClient.setUserSpeakingState).not.toHaveBeenCalled();
      });
    });
  });

  describe('Real-time Features', () => {
    describe('enableRealtimeMode', () => {
      it('should call client enableRealtimeInterruption', () => {
        session.enableRealtimeMode();

        expect(mockClient.enableRealtimeInterruption).toHaveBeenCalledWith(sessionId);
      });

      it('should not call client if session is inactive', async () => {
        await session.close();

        session.enableRealtimeMode();

        expect(mockClient.enableRealtimeInterruption).not.toHaveBeenCalled();
      });
    });
  });

  describe('Event Handling', () => {
    describe('onEvent', () => {
      it('should register event handler and return session for chaining', () => {
        const handler = jest.fn();

        const result = session.onEvent('audioOutput', handler);

        expect(mockClient.registerEventHandler).toHaveBeenCalledWith(
          sessionId,
          'audioOutput',
          handler
        );
        expect(result).toBe(session);
      });

      it('should allow method chaining', () => {
        const handler1 = jest.fn();
        const handler2 = jest.fn();

        const result = session
          .onEvent('audioOutput', handler1)
          .onEvent('contentEnd', handler2);

        expect(result).toBe(session);
        expect(mockClient.registerEventHandler).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Session Lifecycle', () => {
    describe('close', () => {
      it('should close session and cleanup resources', async () => {
        await session.close();

        expect(mockClient.sendSessionEnd).toHaveBeenCalledWith(sessionId);
        expect(mockClient.removeStreamSession).toHaveBeenCalledWith(sessionId);
      });

      it('should handle multiple close calls gracefully', async () => {
        await session.close();
        await session.close(); // Second close should not throw

        // Should only call cleanup methods once
        expect(mockClient.sendSessionEnd).toHaveBeenCalledTimes(1);
        expect(mockClient.removeStreamSession).toHaveBeenCalledTimes(1);
      });

      it('should handle cleanup errors gracefully', async () => {
        mockClient.sendSessionEnd.mockImplementation(() => {
          throw new Error('Cleanup error');
        });

        await expect(session.close()).resolves.not.toThrow();
      });

      it('should clear audio buffers on close', async () => {
        const audioData = Buffer.from('test-audio');
        
        session.bufferAudioOutput(audioData);
        expect(session.getOutputBufferSize()).toBe(1);

        await session.close();

        expect(session.getOutputBufferSize()).toBe(0);
      });
    });
  });

  describe('Buffer Management', () => {
    it('should handle input buffer overflow gracefully', async () => {
      const audioData = Buffer.from('test-audio-data');

      // Stream many chunks to test buffer overflow handling
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(session.streamAudio(audioData));
      }

      await Promise.all(promises);

      // Should handle all chunks without throwing
      expect(mockClient.streamAudioChunk).toHaveBeenCalledTimes(100);
    });

    it('should handle output buffer overflow by dropping oldest chunks', () => {
      const audioData = Buffer.from('test-audio-data');

      // Buffer many chunks to trigger overflow
      for (let i = 0; i < 1000; i++) {
        session.bufferAudioOutput(audioData);
      }

      // Buffer size should be limited
      const bufferSize = session.getOutputBufferSize();
      expect(bufferSize).toBeLessThan(1000);
      expect(bufferSize).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle client method errors gracefully', async () => {
      mockClient.streamAudioChunk.mockRejectedValue(new Error('Stream error'));
      const audioData = Buffer.from('test-audio-data');

      await expect(session.streamAudio(audioData)).resolves.not.toThrow();
    });

    it('should handle client unavailability', () => {
      mockClient.isSessionActive.mockReturnValue(false);

      session.endUserTurn();

      // Should not call client methods when session is not active
      expect(mockClient.sendContentEnd).not.toHaveBeenCalled();
      expect(mockClient.sendPromptEnd).not.toHaveBeenCalled();
    });
  });
});