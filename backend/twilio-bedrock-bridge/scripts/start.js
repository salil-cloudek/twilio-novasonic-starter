#!/usr/bin/env node

/**
 * Production start script with AWS Distro for OpenTelemetry
 * This script initializes OpenTelemetry instrumentation before loading the application
 */

// Set default environment variables if not provided
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'twilio-bedrock-bridge';
process.env.OTEL_SERVICE_VERSION = process.env.OTEL_SERVICE_VERSION || '0.1.0';

// Configure OTLP export to collector (collector will forward to X-Ray)
if (process.env.ENABLE_XRAY !== 'false') {
  process.env.OTEL_PROPAGATORS = 'tracecontext,baggage,xray';
  // OTEL_TRACES_EXPORTER is set in ECS config to 'otlp'
}

// Environment-aware OTEL configuration
const isECSFargate = !!(process.env.ECS_CONTAINER_METADATA_URI_V4 && process.env.AWS_EXECUTION_ENV?.includes('Fargate'));
const isECS = !!(process.env.ECS_CONTAINER_METADATA_URI_V4 || process.env.ECS_CONTAINER_METADATA_URI);

// Configure resource attributes
const resourceAttributes = [
  `service.name=${process.env.OTEL_SERVICE_NAME}`,
  `service.version=${process.env.OTEL_SERVICE_VERSION}`,
  `deployment.environment=${process.env.NODE_ENV}`
];

if (process.env.AWS_REGION) {
  resourceAttributes.push(`cloud.region=${process.env.AWS_REGION}`);
}

// Add ECS-specific attributes
if (isECS) {
  resourceAttributes.push('cloud.provider=aws');
  resourceAttributes.push(`cloud.platform=aws_${isECSFargate ? 'fargate' : 'ecs'}`);
  if (process.env.AWS_EXECUTION_ENV) {
    resourceAttributes.push(`faas.runtime=${process.env.AWS_EXECUTION_ENV}`);
  }
}

process.env.OTEL_RESOURCE_ATTRIBUTES = resourceAttributes.join(',');

// Configure resource detectors based on environment
if (isECSFargate) {
  // ECS Fargate - disable all automatic resource detection to avoid machine-id issues
  process.env.OTEL_RESOURCE_DETECTORS = 'none';
  process.env.OTEL_NODE_RESOURCE_DETECTORS = 'none';
  // Add Fargate-specific resource attributes manually
  resourceAttributes.push('host.name=fargate-container');
  resourceAttributes.push('container.runtime=fargate');
  console.log('ECS Fargate detected - disabled automatic resource detection');
} else if (isECS) {
  // ECS EC2 - use safe detectors that don't require machine-id
  process.env.OTEL_RESOURCE_DETECTORS = 'env,os,process';
  console.log('ECS EC2 detected - using safe resource detectors');
} else {
  // Local/other environments - use default unless overridden
  if (!process.env.OTEL_RESOURCE_DETECTORS) {
    process.env.OTEL_RESOURCE_DETECTORS = 'env,host,os,process';
  }
}

// Set smart sampling defaults if not provided
process.env.OTEL_SAMPLE_WEBSOCKET_MESSAGES = process.env.OTEL_SAMPLE_WEBSOCKET_MESSAGES || '0.01';
process.env.OTEL_SAMPLE_AUDIO_CHUNKS = process.env.OTEL_SAMPLE_AUDIO_CHUNKS || '0.005';
process.env.OTEL_SAMPLE_BEDROCK_STREAMING = process.env.OTEL_SAMPLE_BEDROCK_STREAMING || '0.02';
process.env.OTEL_SAMPLE_HEALTH_CHECKS = process.env.OTEL_SAMPLE_HEALTH_CHECKS || '0.001';
process.env.OTEL_SAMPLE_ERRORS = process.env.OTEL_SAMPLE_ERRORS || '1.0';
process.env.OTEL_SAMPLE_BEDROCK_REQUESTS = process.env.OTEL_SAMPLE_BEDROCK_REQUESTS || '0.5';
process.env.OTEL_SAMPLE_SESSION_LIFECYCLE = process.env.OTEL_SAMPLE_SESSION_LIFECYCLE || '0.8';
process.env.OTEL_SAMPLE_WEBHOOK = process.env.OTEL_SAMPLE_WEBHOOK || '0.3';
process.env.OTEL_SAMPLE_BEDROCK_INITIATE = process.env.OTEL_SAMPLE_BEDROCK_INITIATE || '0.8';

// Log startup configuration
console.log('Starting Twilio Bedrock Bridge with Smart Sampling...');
console.log(`Service: ${process.env.OTEL_SERVICE_NAME} v${process.env.OTEL_SERVICE_VERSION}`);
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`X-Ray enabled: ${process.env.ENABLE_XRAY !== 'false'}`);
console.log(`Log level: ${process.env.LOG_LEVEL || 'INFO'}`);
console.log('Smart Sampling enabled with operation-specific rates');

// For ECS Fargate, completely disable OTEL to avoid machine-id issues
if (isECSFargate && !process.env.FORCE_OTEL_IN_FARGATE) {
  console.log('ECS Fargate detected - skipping OTEL initialization to avoid machine-id errors');
  console.log('Set FORCE_OTEL_IN_FARGATE=true to attempt OTEL initialization anyway');
  console.log('Application will use fallback observability mode');
  process.env.OTEL_STARTUP_FAILED = 'true';
} else {
  // Load AWS Distro for OpenTelemetry auto-instrumentation with error handling
  try {
    require('@aws/aws-distro-opentelemetry-node-autoinstrumentation/register');
    console.log('AWS Distro for OpenTelemetry initialized successfully');
  } catch (error) {
    const errorMessage = error.message || String(error);
    
    if (errorMessage.includes('machine-id') || errorMessage.includes('/var/lib/dbus/machine-id')) {
      console.warn('OTEL failed due to machine-id access (expected in ECS Fargate)');
      console.log('This is a known limitation in containerized environments');
    } else {
      console.warn('AWS Distro for OpenTelemetry initialization failed:', errorMessage);
    }
    
    console.log('Application will continue with fallback observability');
    process.env.OTEL_STARTUP_FAILED = 'true';
  }
}

// Start the application
require('../dist/server.js');