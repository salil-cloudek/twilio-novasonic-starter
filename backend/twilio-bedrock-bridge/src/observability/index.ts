// Export all observability components
export { initializeTracing, shutdownTracing, sdk, isOtelAvailable, isFallbackMode } from './tracing';
export { default as logger } from './logger';
export { applicationMetrics, metricsUtils, meter } from './metrics';
export { observabilityConfig } from './config';
export { bedrockObservability } from './bedrockObservability';
export { WebSocketMetrics } from './websocketMetrics';
export { safeTrace, safeTracer } from './safeTracing';
export { audioQualityAnalyzer } from '../audio/AudioQualityAnalyzer';
export { fargateXRayTracer, XRayTracing } from './xrayTracing';
export { unifiedTracing, UnifiedTracing } from './unifiedTracing';
export { isTracingAvailable, getActiveTracer } from './tracing';
export { memoryMonitor, MemoryMonitor } from './memoryMonitor';
export { 
  initializeObservability, 
  shutdownObservability, 
  getObservabilityStatus, 
  forceMemoryCleanup,
  getObservabilityMetrics 
} from './initialization';

// Re-export OpenTelemetry API for convenience (use safeTrace for safer operations)
export { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';