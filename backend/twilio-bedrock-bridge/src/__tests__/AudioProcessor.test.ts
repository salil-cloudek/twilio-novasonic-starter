/**
 * Tests for AudioProcessor module
 */

import {
  muLawDecodeByte,
  muLawBufferToPcm16LE,
  pcm16ToMuLawByte,
  pcm16BufferToMuLaw,
  upsample8kTo16k,
  downsampleWithAntiAliasing,
  processBedrockAudioOutput,
  processTwilioAudioInput
} from '../audio/AudioProcessor';

describe('AudioProcessor', () => {
  describe('μ-law encoding/decoding', () => {
    test('should encode and decode μ-law correctly', () => {
      const originalSample = 1000;
      const encoded = pcm16ToMuLawByte(originalSample);
      const decoded = muLawDecodeByte(encoded);
      
      // μ-law is lossy, so we expect some difference but should be close
      expect(Math.abs(decoded - originalSample)).toBeLessThan(100);
    });

    test('should handle buffer conversion', () => {
      const pcm16Buffer = Buffer.alloc(4);
      pcm16Buffer.writeInt16LE(1000, 0);
      pcm16Buffer.writeInt16LE(-1000, 2);
      
      const muLawBuffer = pcm16BufferToMuLaw(pcm16Buffer);
      expect(muLawBuffer.length).toBe(2);
      
      const decodedBuffer = muLawBufferToPcm16LE(muLawBuffer);
      expect(decodedBuffer.length).toBe(4);
    });
  });

  describe('resampling', () => {
    test('should upsample 8k to 16k', () => {
      const input8k = Buffer.alloc(160); // 20ms at 8kHz
      const output16k = upsample8kTo16k(input8k);
      
      expect(output16k.length).toBe(320); // 20ms at 16kHz
    });

    test('should downsample with anti-aliasing', () => {
      const input = Buffer.alloc(320); // 20ms at 16kHz
      const output = downsampleWithAntiAliasing(input, 16000, 8000);
      
      expect(output.length).toBe(160); // 20ms at 8kHz
    });
  });

  describe('high-level processing functions', () => {
    test('should process Twilio audio input', () => {
      const muLawInput = Buffer.alloc(160); // 20ms μ-law at 8kHz
      const processed = processTwilioAudioInput(muLawInput);
      
      // Should be upsampled to 16kHz PCM16LE with minimum padding
      expect(processed.length).toBeGreaterThanOrEqual(320);
    });

    test('should process Bedrock audio output - PCM16LE', () => {
      const audioOutput = {
        content: Buffer.alloc(480).toString('base64'), // 20ms at 24kHz
        sampleRateHz: 24000
      };
      
      const processed = processBedrockAudioOutput(audioOutput, 24000);
      
      // Should be downsampled to 8kHz μ-law (480 bytes PCM16LE at 24kHz -> 80 bytes μ-law at 8kHz)
      expect(processed.length).toBe(80);
    });

    test('should process Bedrock audio output - μ-law', () => {
      const audioOutput = {
        content: Buffer.alloc(160).toString('base64'), // 20ms μ-law at 8kHz
        sampleRateHz: 8000,
        mediaType: 'audio/mulaw'
      };
      
      const processed = processBedrockAudioOutput(audioOutput, 24000);
      
      // Should pass through directly
      expect(processed.length).toBe(160);
    });

    test('should handle missing payload', () => {
      const audioOutput = {};
      
      expect(() => processBedrockAudioOutput(audioOutput)).toThrow('audioOutput missing payload');
    });
  });
});