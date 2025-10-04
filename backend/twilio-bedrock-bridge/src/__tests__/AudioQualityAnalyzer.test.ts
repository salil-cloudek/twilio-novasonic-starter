/**
 * Tests for AudioQualityAnalyzer
 */

import { AudioQualityAnalyzer, audioQualityAnalyzer } from '../audio/AudioQualityAnalyzer';

// Mock dependencies
jest.mock('../utils/logger');
jest.mock('../observability/metrics');
jest.mock('../observability/cloudWatchMetrics');

describe('AudioQualityAnalyzer', () => {
  let analyzer: AudioQualityAnalyzer;

  beforeEach(() => {
    analyzer = AudioQualityAnalyzer.getInstance();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = AudioQualityAnalyzer.getInstance();
      const instance2 = AudioQualityAnalyzer.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should use exported singleton', () => {
      expect(audioQualityAnalyzer).toBe(AudioQualityAnalyzer.getInstance());
    });
  });

  describe('Audio Analysis', () => {
    it('should analyze audio chunk', () => {
      const sessionId = 'test-session';
      const audioData = Buffer.alloc(320); // 20ms of audio at 8kHz
      
      // Fill with test audio pattern
      for (let i = 0; i < audioData.length; i += 2) {
        const sample = Math.sin(2 * Math.PI * 440 * (i / 2) / 8000) * 16000;
        audioData.writeInt16LE(sample, i);
      }

      const metrics = analyzer.analyzeAudioChunk(sessionId, audioData);
      
      expect(metrics).toBeDefined();
      expect(metrics.rmsLevel).toBeGreaterThanOrEqual(0);
      expect(metrics.peakLevel).toBeGreaterThanOrEqual(0);
      expect(metrics.silenceRatio).toBeGreaterThanOrEqual(0);
      expect(metrics.dynamicRange).toBeGreaterThanOrEqual(0);
    });

    it('should detect silence in audio', () => {
      const sessionId = 'silent-session';
      const silentAudio = Buffer.alloc(320, 0); // Silent audio

      const metrics = analyzer.analyzeAudioChunk(sessionId, silentAudio);
      
      expect(metrics.silenceRatio).toBeGreaterThan(0.9); // Should detect high silence ratio
      expect(metrics.rmsLevel).toBeLessThan(0.1); // Low RMS for silence
    });

    it('should handle clipped audio', () => {
      const sessionId = 'clipped-session';
      const clippedAudio = Buffer.alloc(320);
      
      // Create clipped audio (max values)
      for (let i = 0; i < clippedAudio.length; i += 2) {
        clippedAudio.writeInt16LE(32767, i); // Max positive value
      }

      const metrics = analyzer.analyzeAudioChunk(sessionId, clippedAudio);
      
      expect(metrics.peakLevel).toBeCloseTo(1.0, 1); // Should detect clipping
    });
  });

  describe('Session Management', () => {
    it('should track session metrics', () => {
      const sessionId = 'tracked-session';
      const audioData = generateTestAudio();
      
      // Analyze multiple chunks
      analyzer.analyzeAudioChunk(sessionId, audioData);
      analyzer.analyzeAudioChunk(sessionId, audioData);
      analyzer.analyzeAudioChunk(sessionId, audioData);

      const sessionMetrics = analyzer.getSessionMetrics(sessionId);
      
      expect(sessionMetrics).toBeDefined();
      expect(sessionMetrics!.rmsLevel).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent session', () => {
      const sessionMetrics = analyzer.getSessionMetrics('non-existent-session');
      
      expect(sessionMetrics).toBeNull();
    });
  });

  describe('Buffer Events', () => {
    it('should report buffer underruns', () => {
      const sessionId = 'buffer-session';
      const audioData = generateTestAudio();
      
      // Initialize session
      analyzer.analyzeAudioChunk(sessionId, audioData);
      
      // Report buffer underrun
      analyzer.reportBufferEvent(sessionId, 'underrun', 0.1);
      
      const metrics = analyzer.getSessionMetrics(sessionId);
      expect(metrics).toBeDefined();
      expect(metrics!.bufferUnderruns).toBeGreaterThan(0);
    });

    it('should report buffer overruns', () => {
      const sessionId = 'buffer-session';
      const audioData = generateTestAudio();
      
      // Initialize session
      analyzer.analyzeAudioChunk(sessionId, audioData);
      
      // Report buffer overrun
      analyzer.reportBufferEvent(sessionId, 'overrun', 0.9);
      
      const metrics = analyzer.getSessionMetrics(sessionId);
      expect(metrics).toBeDefined();
      expect(metrics!.bufferOverruns).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('should handle large audio data', () => {
      const sessionId = 'performance-session';
      const largeAudioData = Buffer.alloc(8000); // 1 second of audio
      
      const startTime = Date.now();
      const metrics = analyzer.analyzeAudioChunk(sessionId, largeAudioData);
      const endTime = Date.now();
      
      expect(metrics).toBeDefined();
      expect(endTime - startTime).toBeLessThan(100); // Should process quickly
    });

    it('should handle multiple concurrent sessions', () => {
      const audioData = generateTestAudio();
      
      // Create multiple sessions
      for (let i = 0; i < 10; i++) {
        analyzer.analyzeAudioChunk(`session-${i}`, audioData);
      }
      
      // Verify all sessions have metrics
      for (let i = 0; i < 10; i++) {
        const metrics = analyzer.getSessionMetrics(`session-${i}`);
        expect(metrics).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty audio data', () => {
      const sessionId = 'empty-session';
      const emptyAudio = Buffer.alloc(0);
      
      expect(() => {
        analyzer.analyzeAudioChunk(sessionId, emptyAudio);
      }).not.toThrow();
    });

    it('should handle odd-length audio data', () => {
      const sessionId = 'odd-session';
      const oddLengthAudio = Buffer.alloc(321); // Odd number of bytes
      
      expect(() => {
        analyzer.analyzeAudioChunk(sessionId, oddLengthAudio);
      }).not.toThrow();
    });
  });
});

// Helper function to generate test audio
function generateTestAudio(length: number = 320, frequency: number = 440, sampleRate: number = 8000): Buffer {
  const buffer = Buffer.alloc(length);
  for (let i = 0; i < length; i += 2) {
    const sample = Math.sin(2 * Math.PI * frequency * (i / 2) / sampleRate) * 16000;
    buffer.writeInt16LE(sample, i);
  }
  return buffer;
}