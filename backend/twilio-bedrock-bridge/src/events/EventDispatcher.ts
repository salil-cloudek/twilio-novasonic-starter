/**
 * @fileoverview Event Dispatching System
 * 
 * Handles event normalization, dispatching, and handler management
 */

import logger from '../utils/logger';
import { SessionData } from '../session/SessionManager';

export class EventDispatcher {
  /**
   * Normalizes event data for consistent handling
   * - Ensures both contentId and contentName are populated
   * - Attempts to parse additionalModelFields into parsedAdditionalModelFields
   */
  normalizeEventData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    
    try {
      const id = obj.contentId ?? obj.contentName;
      if (id) {
        obj.contentId = id;
        obj.contentName = id;
      }
      
      if (typeof obj.additionalModelFields === 'string' && !obj.parsedAdditionalModelFields) {
        try { 
          obj.parsedAdditionalModelFields = JSON.parse(obj.additionalModelFields); 
        } catch { 
          // Ignore parsing errors for additionalModelFields
        }
      }
    } catch (e) {
      // Non-fatal normalization error, continue processing
      logger.debug('Event normalization error:', e);
    }
    
    return obj;
  }

  /**
   * Dispatches events to registered handlers for a specific session
   */
  dispatchEvent(sessionId: string, session: SessionData, eventType: string, data: any): void {
    if (!session) {
      logger.warn(`Cannot dispatch event ${eventType}: session ${sessionId} not found`);
      return;
    }

    const normalizedData = this.normalizeEventData(data);

    // Publish to responseSubject for internal observers
    this.publishToResponseSubject(sessionId, session, eventType, normalizedData);

    // Dispatch to specific event handlers
    this.dispatchToEventHandlers(sessionId, session, eventType, normalizedData);

    // Dispatch to generic 'any' handlers
    this.dispatchToAnyHandlers(sessionId, session, eventType, normalizedData);
  }

  /**
   * Publishes event to the session's response subject
   */
  private publishToResponseSubject(sessionId: string, session: SessionData, eventType: string, data: any): void {
    try {
      if (session.responseSubject && typeof session.responseSubject.next === 'function') {
        session.responseSubject.next({ type: eventType, data });
      }
    } catch (e) {
      logger.debug(`Failed to publish to responseSubject for session ${sessionId}:`, e);
    }
  }

  /**
   * Dispatches to specific event type handlers
   */
  private dispatchToEventHandlers(sessionId: string, session: SessionData, eventType: string, data: any): void {
    const handler = session.responseHandlers.get(eventType);
    if (handler) {
      try {
        handler(data);
      } catch (e) {
        logger.error(`Error in ${eventType} handler for session ${sessionId}:`, e);
      }
    }
  }

  /**
   * Dispatches to generic 'any' event handlers
   */
  private dispatchToAnyHandlers(sessionId: string, session: SessionData, eventType: string, data: any): void {
    const anyHandler = session.responseHandlers.get('any');
    if (anyHandler) {
      try {
        anyHandler({ type: eventType, data });
      } catch (e) {
        logger.error(`Error in 'any' handler for session ${sessionId}:`, e);
      }
    }
  }

  /**
   * Registers an event handler for a session
   */
  registerEventHandler(session: SessionData, eventType: string, handler: (data: any) => void): void {
    session.responseHandlers.set(eventType, handler);
  }
}