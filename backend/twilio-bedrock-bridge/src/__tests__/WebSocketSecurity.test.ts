/**
 * Tests for WebSocket Security Module
 */

/// <reference types="jest" />
/// <reference types="node" />

import * as http from 'http';
import { WebSocketSecurityManager } from '../security/WebSocketSecurity';

const createMockRequest = (overrides: Partial<http.IncomingMessage> = {}): http.IncomingMessage => {
  const mockSocket = {
    remoteAddress: '127.0.0.1'
  };

  return {
    socket: mockSocket,
    headers: {
      'user-agent': 'Twilio.TmeWs/1.0'
    },
    url: '/media',
    ...overrides
  } as http.IncomingMessage;
};

describe('WebSocketSecurityManager', () => {
  let securityManager: WebSocketSecurityManager;

  beforeEach(() => {
    securityManager = WebSocketSecurityManager.getInstance();
    // Clear any existing state
    securityManager.removeActiveSession('CA12345678901234567890123456789012');
    securityManager.clearRateLimiting();
  });

  afterAll(() => {
    // Clean up resources to prevent test leaks
    securityManager.cleanup();
  });

  describe('Session Management', () => {
    it('should add and track active sessions', () => {
      const callSid = 'CA12345678901234567890123456789012';

      securityManager.addActiveSession(callSid);
      expect(securityManager.isSessionActive(callSid)).toBe(true);
    });

    it('should remove active sessions', () => {
      const callSid = 'CA12345678901234567890123456789012';

      securityManager.addActiveSession(callSid);
      expect(securityManager.isSessionActive(callSid)).toBe(true);

      securityManager.removeActiveSession(callSid);
      expect(securityManager.isSessionActive(callSid)).toBe(false);
    });
  });

  describe('Connection Validation', () => {

    it('should validate legitimate Twilio connections', () => {
      const req = createMockRequest();
      const result = securityManager.validateConnection(req);

      expect(result.isValid).toBe(true);
      // CallSid/AccountSid are not validated at connection time for Twilio Media Streams
    });

    it('should reject connections with invalid User-Agent', () => {
      const req = createMockRequest({
        headers: { 'user-agent': 'InvalidUserAgent/1.0' }
      });

      const result = securityManager.validateConnection(req);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('User-Agent');
    });

    it('should accept connections without URL parameters (Twilio Media Streams pattern)', () => {
      const req = createMockRequest({
        url: '/media'
      });

      const result = securityManager.validateConnection(req);

      expect(result.isValid).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow connections within rate limit', () => {
      // Make several connections within limit from localhost
      for (let i = 0; i < 5; i++) {
        const req = createMockRequest({
          socket: { remoteAddress: '127.0.0.1' },
          url: '/media'
        } as any);

        const result = securityManager.validateConnection(req);
        expect(result.isValid).toBe(true);
      }
    });

    it('should provide security statistics', () => {
      const stats = securityManager.getSecurityStats();

      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('rateLimitEntries');
      expect(stats).toHaveProperty('activeSessions');
      expect(typeof stats.activeSessions).toBe('number');
    });
  });

  describe('User-Agent Validation', () => {
    const testCases = [
      { userAgent: 'TwilioMediaStreams/1.0', expected: true },
      { userAgent: 'Twilio/1.0', expected: true },
      { userAgent: 'TwilioProxy/1.0', expected: true },
      { userAgent: 'Twilio.TmeWs/1.0', expected: true },
      { userAgent: 'Mozilla/5.0', expected: false },
      { userAgent: '', expected: false },
      { userAgent: undefined, expected: false }
    ];

    testCases.forEach(({ userAgent, expected }) => {
      it(`should ${expected ? 'accept' : 'reject'} User-Agent: ${userAgent || 'undefined'}`, () => {
        const req = createMockRequest({
          headers: { 'user-agent': userAgent }
        });

        const result = securityManager.validateConnection(req);
        expect(result.isValid).toBe(expected);
      });
    });
  });

  describe('WebSocket Message Validation', () => {
    it('should validate legitimate Twilio start messages', () => {
      const callSid = 'CA12345678901234567890123456789012';
      securityManager.addActiveSession(callSid);

      const startMessage = {
        event: 'start',
        start: {
          callSid: callSid,
          streamSid: 'MZ12345678901234567890123456789012'
        }
      };

      const result = securityManager.validateWebSocketMessage(startMessage);
      expect(result.isValid).toBe(true);
      expect(result.callSid).toBe(callSid);
    });

    it('should reject start messages with invalid CallSid format', () => {
      const startMessage = {
        event: 'start',
        start: {
          callSid: 'INVALID_CALLSID',
          streamSid: 'MZ12345678901234567890123456789012'
        }
      };

      const result = securityManager.validateWebSocketMessage(startMessage);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Invalid CallSid format');
    });

    it('should reject start messages for inactive sessions', () => {
      const callSid = 'CA12345678901234567890123456789012';
      // Don't add the session as active

      const startMessage = {
        event: 'start',
        start: {
          callSid: callSid,
          streamSid: 'MZ12345678901234567890123456789012'
        }
      };

      const result = securityManager.validateWebSocketMessage(startMessage);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('No active call session found');
    });

    it('should accept non-start messages', () => {
      const mediaMessage = {
        event: 'media',
        media: {
          payload: 'base64audiodata'
        }
      };

      const result = securityManager.validateWebSocketMessage(mediaMessage);
      expect(result.isValid).toBe(true);
    });
  });

});