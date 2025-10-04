/**
 * Logger re-export from observability module
 * This ensures consistent logging with tracing integration across the application
 */

// Re-export the enhanced logger from observability
export { default, logger, isLevelEnabled, LogLevel } from '../observability/logger';