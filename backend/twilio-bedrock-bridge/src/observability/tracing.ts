// AWS Distro for OpenTelemetry initialization with Smart Sampling
// The actual instrumentation is loaded via the register module in start.js

import { observabilityConfig } from './config';
import { smartSampler } from './smartSampling';
import { currentEnvironment, otelCapabilities } from '../utils/environment';
import { fargateXRayTracer } from './xrayTracing';
import logger from '../utils/logger';

// Track OTEL initialization status
let otelInitialized = false;
let otelError: Error | null = null;
let fallbackMode = false;

// Initialize tracing - AWS Distro is loaded via --require flag
export function initializeTracing(): void {
    try {
        // Check if OTEL failed during startup
        if (process.env.OTEL_STARTUP_FAILED === 'true') {
            throw new Error('OTEL failed during startup initialization');
        }
        
        // Check if environment recommends fallback mode
        if (otelCapabilities.recommendsFallback) {
            console.log('Environment recommends OTEL fallback mode, but attempting initialization...');
        }
        
        const serviceName = process.env.OTEL_SERVICE_NAME || 'twilio-bedrock-bridge';
        const serviceVersion = process.env.OTEL_SERVICE_VERSION || '0.1.0';
        const environment = process.env.NODE_ENV || 'development';
        const enabledInstrumentations = process.env.OTEL_NODE_ENABLED_INSTRUMENTATIONS || 'http,https,express,dns,fs,net';
        
        // Log tracing configuration including smart sampling
        const samplingConfig = smartSampler.getSamplingConfig();
        
        console.log(`AWS Distro for OpenTelemetry initialized with Smart Sampling`);
        console.log(`Service: ${serviceName}, Version: ${serviceVersion}, Environment: ${environment}`);
        console.log(`Platform: ${currentEnvironment.platform}, Region: ${currentEnvironment.region || 'unknown'}`);
        console.log(`Enabled instrumentations: ${enabledInstrumentations}`);
        console.log(`OTLP endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'default'}`);
        console.log(`Global sample rate: ${samplingConfig.globalSampleRate * 100}%`);
        console.log(`Smart sampling rates:`, {
            websocketMessages: `${samplingConfig.operationRates.websocketMessages * 100}%`,
            audioChunks: `${samplingConfig.operationRates.audioChunks * 100}%`,
            bedrockStreaming: `${samplingConfig.operationRates.bedrockStreaming * 100}%`,
            healthChecks: `${samplingConfig.operationRates.healthChecks * 100}%`,
            errors: `${samplingConfig.operationRates.errors * 100}%`,
            bedrockRequests: `${samplingConfig.operationRates.bedrockRequests * 100}%`,
            sessionLifecycle: `${samplingConfig.operationRates.sessionLifecycle * 100}%`
        });
        
        if (samplingConfig.customRules.length > 0) {
            console.log(`Custom sampling rules:`, samplingConfig.customRules);
        }
        
        console.log('HTTP metrics will be automatically collected via OTEL auto-instrumentation');
        console.log('Traces will be sent to AWS OTEL Collector and forwarded to X-Ray');
        console.log('Fallback mode available if OTEL fails at runtime');
        
        // Test basic OTEL functionality
        try {
            const testTracer = require('@opentelemetry/api').trace.getTracer('test');
            const testSpan = testTracer.startSpan('initialization-test');
            testSpan.end();
            console.log('OTEL basic functionality verified');
        } catch (testError) {
            console.warn('OTEL basic test failed, enabling fallback mode:', testError);
            fallbackMode = true;
        }
        
        logger.info('Tracing initialized with smart sampling and fallback protection', {
            component: 'tracing',
            serviceName,
            serviceVersion,
            environment,
            samplingConfig,
            fallbackMode
        });
        
        otelInitialized = true;
        
    } catch (error) {
        otelError = error instanceof Error ? error : new Error(String(error));
        fallbackMode = true;
        
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Provide specific guidance for common ECS Fargate issues
        if (errorMessage.includes('machine-id') || errorMessage.includes('/var/lib/dbus/machine-id')) {
            console.warn('OTEL failed due to missing machine-id (common in ECS Fargate)');
            console.log('This is expected in containerized environments - using fallback mode');
            console.log(`Detected environment: ${currentEnvironment.platform}`);
        } else {
            console.warn('OTEL initialization failed, enabling fallback mode:', error);
        }
        
        // Initialize X-Ray as fallback for distributed tracing
        if (otelCapabilities.shouldUseXRayForTracing) {
            console.log('Initializing X-Ray tracing as OTEL fallback...');
            try {
                fargateXRayTracer.initialize();
                console.log('X-Ray fallback tracing initialized');
            } catch (xrayError) {
                console.warn('X-Ray fallback also failed:', xrayError);
            }
        }
        
        console.log('Application will continue with fallback observability (X-Ray + CloudWatch + correlation IDs)');
        logger.warn('OTEL initialization failed, using fallback observability', { 
            error: errorMessage,
            fallbackMode: true,
            xrayEnabled: fargateXRayTracer.isActive(),
            isContainerized: !!process.env.ECS_CONTAINER_METADATA_URI_V4
        });
        
        // Don't throw - let the application continue with fallback mode
        otelInitialized = false;
    }
}

// Check if OTEL is available and working
export function isOtelAvailable(): boolean {
    return otelInitialized && !otelError && !fallbackMode;
}

// Get OTEL error if any
export function getOtelError(): Error | null {
    return otelError;
}

// Check if we're in fallback mode
export function isFallbackMode(): boolean {
    return fallbackMode;
}

// Force fallback mode (useful for testing or when OTEL fails at runtime)
export function enableFallbackMode(reason?: string): void {
    fallbackMode = true;
    console.warn(`OTEL fallback mode enabled${reason ? `: ${reason}` : ''}`);
    logger.warn('OTEL fallback mode enabled - using basic logging only', { reason });
}

// Check if any tracing is available (OTEL or X-Ray)
export function isTracingAvailable(): boolean {
    return otelInitialized || fargateXRayTracer.isActive();
}

// Get the active tracer (OTEL or X-Ray)
export function getActiveTracer(): 'otel' | 'xray' | 'none' {
    if (otelInitialized && !fallbackMode) return 'otel';
    if (fargateXRayTracer.isActive()) return 'xray';
    return 'none';
}

// Graceful shutdown
export async function shutdownTracing(): Promise<void> {
    try {
        if (otelInitialized) {
            // AWS Distro handles shutdown automatically
            console.log('AWS Distro for OpenTelemetry shutdown initiated');
        } else {
            console.log('OTEL was not initialized, skipping shutdown');
        }

        // Shutdown X-Ray if it was used as fallback
        if (fargateXRayTracer.isActive()) {
            fargateXRayTracer.shutdown();
            console.log('X-Ray fallback tracing shutdown');
        }
    } catch (error) {
        console.warn('Error shutting down tracing (non-critical):', error);
        // Don't throw - this is during shutdown and shouldn't prevent graceful exit
    }
}

// Export placeholder SDK for compatibility
export const sdk = {
    start: () => console.log('AWS Distro SDK started'),
    shutdown: () => Promise.resolve(console.log('AWS Distro SDK shutdown'))
};