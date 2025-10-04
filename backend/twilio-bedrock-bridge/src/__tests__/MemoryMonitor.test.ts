/**
 * Tests for MemoryMonitor
 */

import { MemoryMonitor, memoryMonitor, MemoryUsageInfo } from '../observability/memoryMonitor';

// Mock dependencies
jest.mock('../utils/logger');
jest.mock('../observability/config', () => ({
  observabilityConfig: {
    healthCheck: {
      memoryThresholdMB: 1024 // 1GB
    }
  }
}));

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;
  let mockMemoryUsage: jest.SpyInstance;

  beforeEach(() => {
    // Create fresh instance for each test
    monitor = MemoryMonitor.getInstance();
    
    // Stop any existing monitoring
    monitor.stop();
    monitor.clearHistory();

    // Mock process.memoryUsage
    mockMemoryUsage = jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 100 * 1024 * 1024,      // 100MB
      heapTotal: 80 * 1024 * 1024,  // 80MB
      heapUsed: 60 * 1024 * 1024,   // 60MB
      external: 10 * 1024 * 1024,   // 10MB
      arrayBuffers: 5 * 1024 * 1024 // 5MB
    });

    // Ensure global.gc is mocked
    global.gc = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    monitor.stop();
    mockMemoryUsage.mockRestore();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = MemoryMonitor.getInstance();
      const instance2 = MemoryMonitor.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should use exported singleton', () => {
      expect(memoryMonitor).toBe(MemoryMonitor.getInstance());
    });
  });

  describe('Basic Functionality', () => {
    it('should start and stop monitoring', () => {
      expect(monitor.isActive()).toBe(false);
      
      monitor.start();
      expect(monitor.isActive()).toBe(true);
      
      monitor.stop();
      expect(monitor.isActive()).toBe(false);
    });

    it('should get memory health status', () => {
      const health = monitor.getMemoryHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('usage');
      expect(health).toHaveProperty('thresholds');
      expect(health).toHaveProperty('warnings');
      expect(health).toHaveProperty('recommendations');
      expect(health).toHaveProperty('trend');
      expect(health).toHaveProperty('leakSuspected');
    });

    it('should get memory statistics', () => {
      const stats = monitor.getMemoryStats();
      
      expect(stats).toHaveProperty('current');
      expect(stats).toHaveProperty('peak');
      expect(stats).toHaveProperty('average');
      expect(stats).toHaveProperty('historySize');
    });
  });

  describe('Garbage Collection', () => {
    it('should force garbage collection when available', () => {
      // Mock memory usage before and after GC
      const beforeGc = {
        rss: 100 * 1024 * 1024,
        heapTotal: 80 * 1024 * 1024,
        heapUsed: 60 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024
      };
      const afterGc = {
        ...beforeGc,
        heapUsed: 50 * 1024 * 1024 // Simulate memory freed
      };
      
      mockMemoryUsage
        .mockReturnValueOnce(beforeGc)
        .mockReturnValueOnce(afterGc);
      
      const result = monitor.forceGarbageCollection();
      
      expect(result).toBe(true);
      expect(global.gc).toHaveBeenCalled();
    });

    it('should handle missing global.gc gracefully', () => {
      delete (global as any).gc;
      
      const result = monitor.forceGarbageCollection();
      
      expect(result).toBe(false);
    });
  });

  describe('Memory Trend Analysis', () => {
    it('should detect stable memory trend', () => {
      // Clear any existing history
      monitor.clearHistory();
      
      // Simulate stable memory usage with exactly the same values
      const baseHeapUsed = 30 * 1024 * 1024;
      for (let i = 0; i < 10; i++) {
        mockMemoryUsage.mockReturnValue({
          rss: 100 * 1024 * 1024,
          heapTotal: 50 * 1024 * 1024,
          heapUsed: baseHeapUsed, // Exactly the same value for stable trend
          external: 5 * 1024 * 1024,
          arrayBuffers: 1 * 1024 * 1024
        });
        (monitor as any).checkMemoryUsage();
      }

      const health = monitor.getMemoryHealth();
      expect(health.trend).toBe('stable');
    });
  });
});