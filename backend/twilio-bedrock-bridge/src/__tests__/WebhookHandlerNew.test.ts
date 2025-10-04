/**
 * Tests for WebhookHandler
 */

// Mock all dependencies first
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../security/WebSocketSecurity', () => ({
  webSocketSecurity: {
    addActiveSession: jest.fn()
  }
}));

jest.mock('../utils/correlationId', () => ({
  CorrelationIdManager: {
    traceWithCorrelation: jest.fn((name, fn) => fn()),
    getCurrentContext: jest.fn().mockReturnValue({ correlationId: 'test-correlation-id' })
  }
}));

jest.mock('twilio', () => ({
  validateRequest: jest.fn().mockReturnValue(true)
}));

import { WebhookHandler } from '../handlers/WebhookHandler';
import { webSocketSecurity } from '../security/WebSocketSecurity';

const mockTwilio = require('twilio');

describe('WebhookHandler', () => {
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    // Set default auth token
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    
    mockReq = {
      headers: {
        'x-twilio-signature': 'valid-signature',
        'content-type': 'application/x-www-form-urlencoded'
      },
      originalUrl: '/webhook',
      protocol: 'https',
      get: jest.fn().mockReturnValue('example.com'),
      ip: '127.0.0.1',
      rawBody: Buffer.from('CallSid=CA123456789&AccountSid=AC123456789'),
      body: {
        CallSid: 'CA123456789',
        AccountSid: 'AC123456789'
      },
      query: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
    // Reset twilio mock to return true by default
    mockTwilio.validateRequest.mockReturnValue(true);
  });

  describe('Authentication', () => {
    it('should reject requests when TWILIO_AUTH_TOKEN is not set', () => {
      delete process.env.TWILIO_AUTH_TOKEN;

      WebhookHandler.handle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Twilio signature validation not configured');
    });

    it('should validate Twilio signature with auth token', () => {
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';

      WebhookHandler.handle(mockReq, mockRes);

      expect(mockTwilio.validateRequest).toHaveBeenCalledWith(
        'test-auth-token',
        'valid-signature',
        'https://example.com/webhook',
        { CallSid: 'CA123456789', AccountSid: 'AC123456789' }
      );
    });

    it('should reject requests with invalid signature', () => {
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
      mockTwilio.validateRequest.mockReturnValue(false);

      WebhookHandler.handle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.send).toHaveBeenCalledWith('Invalid Twilio signature');
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    });

    it('should register active session with CallSid', () => {
      WebhookHandler.handle(mockReq, mockRes);

      expect(webSocketSecurity.addActiveSession).toHaveBeenCalledWith('CA123456789');
    });

    it('should handle missing CallSid', () => {
      delete mockReq.body.CallSid;
      mockReq.rawBody = Buffer.from('AccountSid=AC123456789');

      WebhookHandler.handle(mockReq, mockRes);

      expect(webSocketSecurity.addActiveSession).not.toHaveBeenCalled();
    });
  });

  describe('TwiML Response', () => {
    beforeEach(() => {
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    });

    it('should generate valid TwiML response', () => {
      WebhookHandler.handle(mockReq, mockRes);

      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/xml');
      
      const twimlResponse = mockRes.send.mock.calls[0][0];
      expect(twimlResponse).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(twimlResponse).toContain('<Response>');
      expect(twimlResponse).toContain('<Say voice="alice">Connecting</Say>');
      expect(twimlResponse).toContain('<Connect>');
      expect(twimlResponse).toContain('<Stream url=');
      expect(twimlResponse).toContain('</Response>');
    });

    it('should include session parameters in TwiML', () => {
      WebhookHandler.handle(mockReq, mockRes);

      const twimlResponse = mockRes.send.mock.calls[0][0];
      expect(twimlResponse).toContain('<Parameter name="sessionId"');
      expect(twimlResponse).toContain('<Parameter name="audioFormat" value="mulaw"');
      expect(twimlResponse).toContain('<Parameter name="sampleRate" value="8000"');
      expect(twimlResponse).toContain('<Parameter name="encoding" value="base64"');
      expect(twimlResponse).toContain('<Parameter name="channels" value="1"');
    });
  });

  describe('Stream URL Generation', () => {
    beforeEach(() => {
      process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    });

    it('should use query parameter wsUrl when provided', () => {
      mockReq.query = { wsUrl: 'wss://custom.example.com/media' };

      WebhookHandler.handle(mockReq, mockRes);

      const twimlCall = mockRes.send.mock.calls[0][0];
      expect(twimlCall).toContain('wss://custom.example.com/media');
    });

    it('should construct URL from request headers', () => {
      WebhookHandler.handle(mockReq, mockRes);

      const twimlCall = mockRes.send.mock.calls[0][0];
      expect(twimlCall).toContain('wss://example.com/media');
    });
  });
});