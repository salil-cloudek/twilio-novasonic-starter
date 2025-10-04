/**
 * @fileoverview Async Correlation Utilities
 * 
 * This module provides utilities for maintaining correlation context across
 * asynchronous operations, particularly useful for event handlers, timers,
 * and callback-based operations that might lose correlation context.
 */

import { CorrelationIdManager, CorrelationContext } from './correlationId';

/**
 * Wrap a callback function to preserve correlation context
 */
export function withCorrelationContext<T extends (...args: any[]) => any>(
  fn: T,
  context?: CorrelationContext
): T {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  return ((...args: any[]) => {
    if (correlationContext) {
      return CorrelationIdManager.runWithContext(correlationContext, () => fn(...args));
    }
    return fn(...args);
  }) as T;
}

/**
 * Wrap a Promise to preserve correlation context
 */
export function withCorrelationPromise<T>(
  promise: Promise<T>,
  context?: CorrelationContext
): Promise<T> {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  if (!correlationContext) {
    return promise;
  }
  
  return new Promise((resolve, reject) => {
    CorrelationIdManager.runWithContext(correlationContext, () => {
      promise
        .then((result) => {
          CorrelationIdManager.runWithContext(correlationContext, () => {
            resolve(result);
          });
        })
        .catch((error) => {
          CorrelationIdManager.runWithContext(correlationContext, () => {
            reject(error);
          });
        });
    });
  });
}

/**
 * Wrap setTimeout to preserve correlation context
 */
export function setTimeoutWithCorrelation(
  callback: () => void,
  delay: number,
  context?: CorrelationContext
): NodeJS.Timeout {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  return setTimeout(() => {
    if (correlationContext) {
      CorrelationIdManager.runWithContext(correlationContext, callback);
    } else {
      callback();
    }
  }, delay);
}

/**
 * Wrap setInterval to preserve correlation context
 */
export function setIntervalWithCorrelation(
  callback: () => void,
  interval: number,
  context?: CorrelationContext
): NodeJS.Timeout {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  return setInterval(() => {
    if (correlationContext) {
      CorrelationIdManager.runWithContext(correlationContext, callback);
    } else {
      callback();
    }
  }, interval);
}

/**
 * Wrap process.nextTick to preserve correlation context
 */
export function nextTickWithCorrelation(
  callback: () => void,
  context?: CorrelationContext
): void {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  process.nextTick(() => {
    if (correlationContext) {
      CorrelationIdManager.runWithContext(correlationContext, callback);
    } else {
      callback();
    }
  });
}

/**
 * Wrap setImmediate to preserve correlation context
 */
export function setImmediateWithCorrelation(
  callback: () => void,
  context?: CorrelationContext
): NodeJS.Immediate {
  const correlationContext = context || CorrelationIdManager.getCurrentContext();
  
  return setImmediate(() => {
    if (correlationContext) {
      CorrelationIdManager.runWithContext(correlationContext, callback);
    } else {
      callback();
    }
  });
}

/**
 * Create a correlation-aware event emitter wrapper
 */
export class CorrelationEventEmitter {
  private correlationContext: CorrelationContext | undefined;
  
  constructor(context?: CorrelationContext) {
    this.correlationContext = context || CorrelationIdManager.getCurrentContext();
  }
  
  /**
   * Emit an event within correlation context
   */
  emit(emitter: any, event: string, ...args: any[]): boolean {
    if (this.correlationContext) {
      return CorrelationIdManager.runWithContext(this.correlationContext, () => {
        return emitter.emit(event, ...args);
      });
    }
    return emitter.emit(event, ...args);
  }
  
  /**
   * Add a listener that preserves correlation context
   */
  on(emitter: any, event: string, listener: (...args: any[]) => void): any {
    const wrappedListener = withCorrelationContext(listener, this.correlationContext);
    return emitter.on(event, wrappedListener);
  }
  
  /**
   * Add a one-time listener that preserves correlation context
   */
  once(emitter: any, event: string, listener: (...args: any[]) => void): any {
    const wrappedListener = withCorrelationContext(listener, this.correlationContext);
    return emitter.once(event, wrappedListener);
  }
}

/**
 * Utility class for managing correlation context in complex async flows
 */
export class CorrelationScope {
  private context: CorrelationContext;
  
  constructor(context?: CorrelationContext) {
    this.context = context || CorrelationIdManager.getCurrentContext() || 
      CorrelationIdManager.createContext({ source: 'internal' });
  }
  
  /**
   * Run a function within this correlation scope
   */
  run<T>(fn: () => T | Promise<T>): T | Promise<T> {
    return CorrelationIdManager.runWithContext(this.context, fn);
  }
  
  /**
   * Create a child scope with additional context
   */
  createChild(additionalData?: Partial<CorrelationContext>): CorrelationScope {
    const childContext = CorrelationIdManager.createContext({
      source: this.context.source,
      parentCorrelationId: this.context.correlationId,
      callSid: this.context.callSid,
      accountSid: this.context.accountSid,
      sessionId: this.context.sessionId,
      streamSid: this.context.streamSid,
      ...additionalData
    });
    return new CorrelationScope(childContext);
  }
  
  /**
   * Get the correlation context for this scope
   */
  getContext(): CorrelationContext {
    return this.context;
  }
  
  /**
   * Wrap a function to always run within this scope
   */
  wrap<T extends (...args: any[]) => any>(fn: T): T {
    return withCorrelationContext(fn, this.context);
  }
  
  /**
   * Wrap a promise to run within this scope
   */
  wrapPromise<T>(promise: Promise<T>): Promise<T> {
    return withCorrelationPromise(promise, this.context);
  }
}

// Export convenience functions
export {
  withCorrelationContext as withContext,
  withCorrelationPromise as withPromise,
  setTimeoutWithCorrelation as setTimeout,
  setIntervalWithCorrelation as setInterval,
  nextTickWithCorrelation as nextTick,
  setImmediateWithCorrelation as setImmediate
};