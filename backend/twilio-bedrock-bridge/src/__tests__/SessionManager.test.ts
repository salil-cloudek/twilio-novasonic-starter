/**
 * Tests for SessionManager
 */

import { SessionManager } from '../session/SessionManager';
import { InferenceConfig } from '../types/SharedTypes';

// Mock dependencies
jest.mock('../utils/logger');

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  const mockInferenceConfig: InferenceConfig = {
    maxTokens: 1024,
    topP: 0.9,
    temperature: 0.7
  };

  beforeEach(() => {
    sessionManager = new SessionManager();
    jest.clearAllMocks();
  });

  describe('Session Creation', () => {
    it('should create a new session with provided configuration', () => {
      const sessionId = 'test-session-1';

      const session = sessionManager.createSession(sessionId, mockInferenceConfig);

      expect(session).toBeDefined();
      expect(session.inferenceConfig).toEqual(mockInferenceConfig);
      expect(session.isActive).toBe(true);
      expect(session.isPromptStartSent).toBe(false);
      expect(session.isAudioContentStartSent).toBe(false);
      expect(session.isWaitingForResponse).toBe(false);
      expect(session.promptName).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(session.audioContentId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should initialize session with empty queue and subjects', () => {
      const sessionId = 'test-session-2';

      const session = sessionManager.createSession(sessionId, mockInferenceConfig);

      expect(session.queue).toEqual([]);
      expect(session.queueSignal).toBeDefined();
      expect(session.closeSignal).toBeDefined();
      expect(session.responseSubject).toBeDefined();
      expect(session.responseHandlers).toBeInstanceOf(Map);
      expect(session.responseHandlers.size).toBe(0);
    });

    it('should throw error when creating session with existing ID', () => {
      const sessionId = 'duplicate-session';

      sessionManager.createSession(sessionId, mockInferenceConfig);

      expect(() => {
        sessionManager.createSession(sessionId, mockInferenceConfig);
      }).toThrow(`Session ${sessionId} already exists`);
    });

    it('should update session activity on creation', () => {
      const sessionId = 'activity-test-session';
      const beforeTime = Date.now();

      sessionManager.createSession(sessionId, mockInferenceConfig);

      const afterTime = Date.now();
      const lastActivity = sessionManager.getLastActivityTime(sessionId);

      expect(lastActivity).toBeGreaterThanOrEqual(beforeTime);
      expect(lastActivity).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Session Retrieval', () => {
    it('should retrieve existing session by ID', () => {
      const sessionId = 'retrieve-test-session';
      const createdSession = sessionManager.createSession(sessionId, mockInferenceConfig);

      const retrievedSession = sessionManager.getSession(sessionId);

      expect(retrievedSession).toBe(createdSession);
    });

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-session');

      expect(session).toBeUndefined();
    });
  });

  describe('Session Status', () => {
    it('should return true for active sessions', () => {
      const sessionId = 'active-session';
      sessionManager.createSession(sessionId, mockInferenceConfig);

      expect(sessionManager.isSessionActive(sessionId)).toBe(true);
    });

    it('should return false for non-existent sessions', () => {
      expect(sessionManager.isSessionActive('non-existent')).toBe(false);
    });

    it('should return false for inactive sessions', () => {
      const sessionId = 'inactive-session';
      const session = sessionManager.createSession(sessionId, mockInferenceConfig);
      session.isActive = false;

      expect(sessionManager.isSessionActive(sessionId)).toBe(false);
    });
  });

  describe('Active Sessions Management', () => {
    it('should return list of all active session IDs', () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];

      sessionIds.forEach(id => {
        sessionManager.createSession(id, mockInferenceConfig);
      });

      const activeSessions = sessionManager.getActiveSessions();

      expect(activeSessions).toHaveLength(3);
      sessionIds.forEach(id => {
        expect(activeSessions).toContain(id);
      });
    });

    it('should return empty array when no sessions exist', () => {
      const activeSessions = sessionManager.getActiveSessions();

      expect(activeSessions).toEqual([]);
    });

    it('should not include inactive sessions in active list', () => {
      const activeSessionId = 'active-session';
      const inactiveSessionId = 'inactive-session';

      sessionManager.createSession(activeSessionId, mockInferenceConfig);
      const inactiveSession = sessionManager.createSession(inactiveSessionId, mockInferenceConfig);
      inactiveSession.isActive = false;

      const activeSessions = sessionManager.getActiveSessions();

      expect(activeSessions).toContain(activeSessionId);
      expect(activeSessions).not.toContain(inactiveSessionId);
    });
  });

  describe('Activity Tracking', () => {
    it('should update session activity timestamp', () => {
      const sessionId = 'activity-session';
      sessionManager.createSession(sessionId, mockInferenceConfig);

      const initialActivity = sessionManager.getLastActivityTime(sessionId);
      
      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        sessionManager.updateSessionActivity(sessionId);
        const updatedActivity = sessionManager.getLastActivityTime(sessionId);

        expect(updatedActivity).toBeGreaterThan(initialActivity);
      }, 10);
    });

    it('should return 0 for non-existent session activity', () => {
      const lastActivity = sessionManager.getLastActivityTime('non-existent');

      expect(lastActivity).toBe(0);
    });

    it('should track activity for multiple sessions independently', () => {
      const session1Id = 'session-1';
      const session2Id = 'session-2';

      sessionManager.createSession(session1Id, mockInferenceConfig);
      const time1 = Date.now();
      
      setTimeout(() => {
        sessionManager.createSession(session2Id, mockInferenceConfig);
        const time2 = Date.now();

        const activity1 = sessionManager.getLastActivityTime(session1Id);
        const activity2 = sessionManager.getLastActivityTime(session2Id);

        expect(activity1).toBeLessThan(time2);
        expect(activity2).toBeGreaterThanOrEqual(time2);
      }, 10);
    });
  });

  describe('Cleanup Management', () => {
    it('should mark session for cleanup', () => {
      const sessionId = 'cleanup-session';
      sessionManager.createSession(sessionId, mockInferenceConfig);

      expect(sessionManager.isCleanupInProgress(sessionId)).toBe(false);

      sessionManager.markForCleanup(sessionId);

      expect(sessionManager.isCleanupInProgress(sessionId)).toBe(true);
    });

    it('should track cleanup status for multiple sessions', () => {
      const session1Id = 'cleanup-session-1';
      const session2Id = 'cleanup-session-2';

      sessionManager.createSession(session1Id, mockInferenceConfig);
      sessionManager.createSession(session2Id, mockInferenceConfig);

      sessionManager.markForCleanup(session1Id);

      expect(sessionManager.isCleanupInProgress(session1Id)).toBe(true);
      expect(sessionManager.isCleanupInProgress(session2Id)).toBe(false);
    });
  });

  describe('Session Removal', () => {
    it('should remove session and cleanup resources', () => {
      const sessionId = 'remove-session';
      const session = sessionManager.createSession(sessionId, mockInferenceConfig);

      // Verify session exists and is active
      expect(sessionManager.isSessionActive(sessionId)).toBe(true);
      expect(sessionManager.getLastActivityTime(sessionId)).toBeGreaterThan(0);

      sessionManager.removeSession(sessionId);

      // Verify session is removed
      expect(sessionManager.getSession(sessionId)).toBeUndefined();
      expect(sessionManager.isSessionActive(sessionId)).toBe(false);
      expect(sessionManager.getLastActivityTime(sessionId)).toBe(0);
      expect(sessionManager.isCleanupInProgress(sessionId)).toBe(false);
    });

    it('should complete RxJS subjects on removal', () => {
      const sessionId = 'rxjs-session';
      const session = sessionManager.createSession(sessionId, mockInferenceConfig);

      const queueSignalComplete = jest.spyOn(session.queueSignal, 'complete');
      const closeSignalComplete = jest.spyOn(session.closeSignal, 'complete');
      const responseSubjectComplete = jest.spyOn(session.responseSubject, 'complete');

      sessionManager.removeSession(sessionId);

      expect(queueSignalComplete).toHaveBeenCalled();
      expect(closeSignalComplete).toHaveBeenCalled();
      expect(responseSubjectComplete).toHaveBeenCalled();
      expect(session.isActive).toBe(false);
    });

    it('should handle removal of non-existent session gracefully', () => {
      expect(() => {
        sessionManager.removeSession('non-existent-session');
      }).not.toThrow();
    });

    it('should clear cleanup status on removal', () => {
      const sessionId = 'cleanup-remove-session';
      sessionManager.createSession(sessionId, mockInferenceConfig);
      sessionManager.markForCleanup(sessionId);

      expect(sessionManager.isCleanupInProgress(sessionId)).toBe(true);

      sessionManager.removeSession(sessionId);

      expect(sessionManager.isCleanupInProgress(sessionId)).toBe(false);
    });
  });

  describe('Session Data Integrity', () => {
    it('should maintain separate data for multiple sessions', () => {
      const config1: InferenceConfig = { maxTokens: 1024, topP: 0.8, temperature: 0.6 };
      const config2: InferenceConfig = { maxTokens: 2048, topP: 0.9, temperature: 0.7 };

      const session1 = sessionManager.createSession('session-1', config1);
      const session2 = sessionManager.createSession('session-2', config2);

      expect(session1.inferenceConfig).toEqual(config1);
      expect(session2.inferenceConfig).toEqual(config2);
      expect(session1.promptName).not.toBe(session2.promptName);
      expect(session1.audioContentId).not.toBe(session2.audioContentId);
    });

    it('should generate unique IDs for session components', () => {
      const sessionIds = ['session-1', 'session-2', 'session-3'];
      const sessions = sessionIds.map(id => sessionManager.createSession(id, mockInferenceConfig));

      const promptNames = sessions.map(s => s.promptName);
      const audioContentIds = sessions.map(s => s.audioContentId);

      // All prompt names should be unique
      expect(new Set(promptNames).size).toBe(promptNames.length);
      
      // All audio content IDs should be unique
      expect(new Set(audioContentIds).size).toBe(audioContentIds.length);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory when creating and removing many sessions', () => {
      const sessionCount = 100;
      const sessionIds: string[] = [];

      // Create many sessions
      for (let i = 0; i < sessionCount; i++) {
        const sessionId = `session-${i}`;
        sessionIds.push(sessionId);
        sessionManager.createSession(sessionId, mockInferenceConfig);
      }

      expect(sessionManager.getActiveSessions()).toHaveLength(sessionCount);

      // Remove all sessions
      sessionIds.forEach(id => {
        sessionManager.removeSession(id);
      });

      expect(sessionManager.getActiveSessions()).toHaveLength(0);
    });
  });
});