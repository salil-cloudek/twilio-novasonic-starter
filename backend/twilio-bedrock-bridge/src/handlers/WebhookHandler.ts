import express from 'express';
import twilio from 'twilio';
import { parse as parseQuery } from 'querystring';
import logger from '../utils/logger';
import { webSocketSecurity } from '../security/WebSocketSecurity';
import { CorrelationIdManager } from '../utils/correlationId';

export type WebhookRequest = express.Request & {
  rawBody?: Buffer | string;
};

/** WebhookHandler: requires TWILIO_AUTH_TOKEN and validates Twilio signatures; rejects requests if not configured. */
export class WebhookHandler {
  public static handle(req: WebhookRequest, res: express.Response): void {
    CorrelationIdManager.traceWithCorrelation('webhook.handle', () => {
      const correlationContext = CorrelationIdManager.getCurrentContext();
      logger.info('webhook.request.received', { 
        path: req.originalUrl, 
        ip: req.ip,
        correlationId: correlationContext?.correlationId,
        callSid: correlationContext?.callSid
      });

    // Require TWILIO_AUTH_TOKEN to be set — reject requests if it's missing.
    const rawAuth = process.env.TWILIO_AUTH_TOKEN;
    const authToken = rawAuth ? rawAuth.trim().replace(/^"(.*)"$/, '$1') : rawAuth;
    if (!authToken) {
      logger.error('webhook.missing_auth_token', { path: req.originalUrl, ip: req.ip });
      res.status(403).send('Twilio signature validation not configured');
      return;
    }
    
    
    const signature = String(req.headers['x-twilio-signature'] || '');
    const url = WebhookHandler.buildValidationUrl(req);
    
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    let bodyForValidation: any;
    if (req.rawBody && contentType === 'application/x-www-form-urlencoded') {
      bodyForValidation = parseQuery(req.rawBody.toString());
    } else if (req.rawBody) {
      bodyForValidation = req.rawBody.toString();
    } else {
      bodyForValidation = req.body || {};
    }

    try {
      const ok = twilio.validateRequest(authToken, signature, url, bodyForValidation);
      if (!ok) {
        logger.warn('webhook.invalid_signature', { ip: req.ip, path: req.originalUrl });
        res.status(403).send('Invalid Twilio signature');
        return;
      }
    } catch (err) {
      logger.warn('webhook.signature_validation_error', { err });
      res.status(500).send('Signature validation error');
      return;
    }

    // Extract CallSid from the validated request body
    const callSid = (bodyForValidation as any)?.CallSid || req.body?.CallSid;
    if (callSid) {
      // Register this call session as active for WebSocket validation
      webSocketSecurity.addActiveSession(callSid);
      logger.info('webhook.session.registered', { callSid });
    } else {
      logger.warn('webhook.missing_callsid', { body: bodyForValidation });
    }

    const streamUrl = WebhookHandler.buildStreamUrl(req);
    res.set('Content-Type', 'application/xml');
    res.send(WebhookHandler.generateTwiMLResponse(streamUrl));
    logger.info('webhook.twiML.sent', { streamUrl, callSid });
    }, { 'twilio.call_sid': (req.body as any)?.CallSid });
  }

  /**
   * Build WebSocket stream URL for TwiML response.
   *
   * Order of resolution:
   *  - ?wsUrl query parameter (most explicit)
   *  - process.env.PUBLIC_WS_HOST (useful in proxied/deployed environments)
   *  - x-forwarded headers or req.get('host')
   */
  private static buildStreamUrl(req: express.Request): string {
    const qs = req.query as Record<string, any>;

    // 1) Query override
    if (qs && qs.wsUrl) {
      const raw = Array.isArray(qs.wsUrl) ? qs.wsUrl[0] : String(qs.wsUrl);
      return raw.endsWith('/media') ? raw : `${raw.replace(/\/+$/, '')}/media`;
    }

    // 2) Env override (PUBLIC_WS_HOST)
    const envHost = process.env.PUBLIC_WS_HOST;
    if (envHost) {
      const proto = (process.env.FORCE_WS_PROTO || 'wss') as string;
      return `${proto}://${envHost.replace(/\/+$/, '')}/media`;
    }

    // 3) Construct from request (supports proxies via x-forwarded-*)
    const forwardedProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:8080';
    const wsProto = (forwardedProto === 'https' || forwardedProto === 'wss') ? 'wss' : 'ws';

    return `${wsProto}://${forwardedHost}/media`;
  }

  /**
   * Build the full request URL (including query string) used when validating Twilio signatures.
   * This mirrors common reverse-proxy headers so validation works when the app is behind a load
   * balancer or proxy that sets x-forwarded-* headers.
   */
  private static buildValidationUrl(req: express.Request): string {
    const proto = ((req.headers['x-forwarded-proto'] as string) || req.protocol || 'https').replace('wss', 'https');
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:8080';
    return `${proto}://${host}${req.originalUrl}`;
  }

  /**
   * Generate a compact TwiML response with a Stream element and parameters.
   */
  private static generateTwiMLResponse(streamUrl: string): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const params = {
      sessionId,
      audioFormat: 'mulaw',
      sampleRate: '8000',
      encoding: 'base64',
      channels: '1',
      debugMode: 'true'
    };

    const paramsXml = Object.entries(params)
      .map(([k, v]) => `      <Parameter name="${k}" value="${v}" />`)
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting</Say>
  <Connect>
    <Stream url="${streamUrl}" track="inbound_track">
${paramsXml}
    </Stream>
  </Connect>
</Response>`;
  }
}