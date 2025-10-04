import { WebSocket } from 'ws';
import { metricsUtils } from './metrics';
import { metrics } from '@opentelemetry/api';

// Session tracking for stale session monitoring
interface SessionInfo {
  sessionId: string;
  callSid?: string;
  startTime: number;
  lastActivity: number;
  websocket: WebSocket;
}

const meter = metrics.getMeter('twilio-bedrock-bridge', '0.1.0');

// Session metrics
const sessionMetrics = {
  staleSessions: meter.createObservableGauge('twilio_bridge_stale_sessions_count', {
    description: 'Number of stale sessions older than threshold',
    unit: '1',
  }),

  sessionAge: meter.createHistogram('twilio_bridge_session_age_seconds', {
    description: 'Age of sessions in seconds',
    unit: 's',
  }),

  sessionActivity: meter.createCounter('twilio_bridge_session_activity_total', {
    description: 'Total session activity events',
    unit: '1',
  }),
};

export class SessionMetrics {
  private static sessions = new Map<string, SessionInfo>();
  private static readonly STALE_SESSION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private static cleanupTimer: NodeJS.Timeout | null = null;

  static initialize(): void {
    // Register callback for stale sessions metric
    sessionMetrics.staleSessions.addCallback((result) => {
      const staleCount = this.getStaleSessionCount();
      result.observe(staleCount);
    });

    // Start cleanup timer
    this.startCleanupTimer();
  }

  static createSession(sessionId: string, websocket: WebSocket, callSid?: string): void {
    const now = Date.now();
    
    const sessionInfo: SessionInfo = {
      sessionId,
      callSid,
      startTime: now,
      lastActivity: now,
      websocket,
    };

    this.sessions.set(sessionId, sessionInfo);

    // Record session creation
    sessionMetrics.sessionActivity.add(1, { 
      action: 'created',
      call_sid: callSid || 'unknown'
    });

    // Set up WebSocket event handlers for activity tracking
    websocket.on('message', () => {
      this.updateSessionActivity(sessionId);
    });

    websocket.on('pong', () => {
      this.updateSessionActivity(sessionId);
    });

    websocket.on('close', () => {
      this.endSession(sessionId);
    });

    websocket.on('error', () => {
      this.endSession(sessionId);
    });
  }

  static updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      
      sessionMetrics.sessionActivity.add(1, { 
        action: 'activity',
        call_sid: session.callSid || 'unknown'
      });
    }
  }

  static endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const duration = (Date.now() - session.startTime) / 1000;
      
      // Record session duration
      sessionMetrics.sessionAge.record(duration, {
        call_sid: session.callSid || 'unknown',
        ended_reason: 'normal'
      });

      sessionMetrics.sessionActivity.add(1, { 
        action: 'ended',
        call_sid: session.callSid || 'unknown'
      });

      this.sessions.delete(sessionId);
    }
  }

  static getStaleSessionCount(): number {
    const now = Date.now();
    let staleCount = 0;

    for (const [sessionId, session] of this.sessions) {
      const timeSinceActivity = now - session.lastActivity;
      if (timeSinceActivity > this.STALE_SESSION_THRESHOLD_MS) {
        staleCount++;
      }
    }

    return staleCount;
  }

  static getStaleSessions(): SessionInfo[] {
    const now = Date.now();
    const staleSessions: SessionInfo[] = [];

    for (const [sessionId, session] of this.sessions) {
      const timeSinceActivity = now - session.lastActivity;
      if (timeSinceActivity > this.STALE_SESSION_THRESHOLD_MS) {
        staleSessions.push(session);
      }
    }

    return staleSessions;
  }

  static getActiveSessionCount(): number {
    return this.sessions.size;
  }

  static getSessionInfo(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  static getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  // Cleanup stale sessions periodically
  private static startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleSessions();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private static cleanupStaleSessions(): void {
    const staleSessions = this.getStaleSessions();
    
    for (const session of staleSessions) {
      try {
        // Close stale WebSocket connections
        if (session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.close(1000, 'Session timeout');
        }

        // Record stale session cleanup
        const age = (Date.now() - session.startTime) / 1000;
        sessionMetrics.sessionAge.record(age, {
          call_sid: session.callSid || 'unknown',
          ended_reason: 'stale_cleanup'
        });

        sessionMetrics.sessionActivity.add(1, { 
          action: 'cleaned_up',
          call_sid: session.callSid || 'unknown'
        });

        this.sessions.delete(session.sessionId);
      } catch (error) {
        console.error(`Error cleaning up stale session ${session.sessionId}:`, error);
      }
    }

    if (staleSessions.length > 0) {
      console.log(`Cleaned up ${staleSessions.length} stale sessions`);
    }
  }

  // Health check for session monitoring
  static getHealthStatus(): {
    totalSessions: number;
    staleSessions: number;
    oldestSessionAge: number;
    averageSessionAge: number;
  } {
    const now = Date.now();
    const sessions = Array.from(this.sessions.values());
    
    let oldestAge = 0;
    let totalAge = 0;
    let staleCount = 0;

    for (const session of sessions) {
      const age = now - session.startTime;
      const timeSinceActivity = now - session.lastActivity;
      
      if (age > oldestAge) {
        oldestAge = age;
      }
      
      totalAge += age;
      
      if (timeSinceActivity > this.STALE_SESSION_THRESHOLD_MS) {
        staleCount++;
      }
    }

    return {
      totalSessions: sessions.length,
      staleSessions: staleCount,
      oldestSessionAge: oldestAge / 1000, // Convert to seconds
      averageSessionAge: sessions.length > 0 ? (totalAge / sessions.length) / 1000 : 0,
    };
  }

  // Graceful shutdown
  static shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Close all active sessions
    for (const [sessionId, session] of this.sessions) {
      try {
        if (session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.close(1000, 'Server shutdown');
        }
      } catch (error) {
        console.error(`Error closing session ${sessionId} during shutdown:`, error);
      }
    }

    this.sessions.clear();
  }

  // Utility method to send ping to all active sessions
  static pingAllSessions(): void {
    for (const [sessionId, session] of this.sessions) {
      try {
        if (session.websocket.readyState === WebSocket.OPEN) {
          session.websocket.ping();
        }
      } catch (error) {
        console.error(`Error pinging session ${sessionId}:`, error);
        this.endSession(sessionId);
      }
    }
  }
}

// Initialize session metrics on module load
SessionMetrics.initialize();

export { SessionInfo };