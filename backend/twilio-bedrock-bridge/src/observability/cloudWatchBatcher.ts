/**
 * CloudWatch Metrics Batcher
 * 
 * Batches CloudWatch metrics to reduce API calls and improve performance.
 * Automatically flushes batches based on size, time, or manual triggers.
 */

import { CloudWatchClient, PutMetricDataCommand, MetricDatum, StandardUnit } from '@aws-sdk/client-cloudwatch';
import logger from '../utils/logger';
import { observabilityConfig } from './config';

interface BatchedMetric {
  metricName: string;
  value: number;
  unit: string;
  dimensions?: Array<{ Name: string; Value: string }>;
  timestamp?: Date;
}

interface BatchConfig {
  maxBatchSize: number;
  flushIntervalMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export class CloudWatchBatcher {
  private cloudWatch: CloudWatchClient;
  private namespace: string;
  private batch: BatchedMetric[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private config: BatchConfig;
  private isShuttingDown = false;

  constructor(
    namespace: string = observabilityConfig.cloudWatch.namespace,
    region: string = observabilityConfig.cloudWatch.region,
    config: Partial<BatchConfig> = {}
  ) {
    this.cloudWatch = new CloudWatchClient({ region });
    this.namespace = namespace;
    this.config = {
      maxBatchSize: observabilityConfig.cloudWatch.batching.maxBatchSize,
      flushIntervalMs: observabilityConfig.cloudWatch.batching.flushIntervalMs,
      maxRetries: observabilityConfig.cloudWatch.batching.maxRetries,
      retryDelayMs: observabilityConfig.cloudWatch.batching.retryDelayMs,
      ...config
    };

    // Only start if CloudWatch batching is enabled
    if (observabilityConfig.cloudWatch.enabled && observabilityConfig.cloudWatch.batching.enabled) {
      this.startFlushTimer();
      logger.info('CloudWatch batcher initialized', {
        namespace: this.namespace,
        region,
        config: this.config
      });
    } else {
      logger.info('CloudWatch batching disabled', {
        cloudWatchEnabled: observabilityConfig.cloudWatch.enabled,
        batchingEnabled: observabilityConfig.cloudWatch.batching.enabled
      });
    }
  }

  /**
   * Add a metric to the batch
   */
  addMetric(metric: BatchedMetric): void {
    // Skip if CloudWatch or batching is disabled
    if (!observabilityConfig.cloudWatch.enabled || !observabilityConfig.cloudWatch.batching.enabled) {
      logger.debug('CloudWatch batching disabled, skipping metric', { metricName: metric.metricName });
      return;
    }

    if (this.isShuttingDown) {
      logger.warn('CloudWatch batcher is shutting down, ignoring metric', { metric });
      return;
    }

    this.batch.push({
      ...metric,
      timestamp: metric.timestamp || new Date()
    });

    logger.debug('Added metric to batch', {
      metricName: metric.metricName,
      batchSize: this.batch.length,
      maxBatchSize: this.config.maxBatchSize
    });

    // Auto-flush if batch is full
    if (this.batch.length >= this.config.maxBatchSize) {
      this.flush();
    }
  }

  /**
   * Add multiple metrics at once
   */
  addMetrics(metrics: BatchedMetric[]): void {
    for (const metric of metrics) {
      this.addMetric(metric);
    }
  }

  /**
   * Manually flush the current batch
   */
  async flush(): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }

    const metricsToSend = [...this.batch];
    this.batch = [];

    // Reset timer since we're flushing now
    this.resetFlushTimer();

    await this.sendMetrics(metricsToSend);
  }

  /**
   * Send metrics to CloudWatch with retry logic
   */
  private async sendMetrics(metrics: BatchedMetric[], attempt: number = 1): Promise<void> {
    try {
      const metricData: MetricDatum[] = metrics.map(metric => ({
        MetricName: metric.metricName,
        Value: metric.value,
        Unit: metric.unit as StandardUnit,
        Dimensions: metric.dimensions,
        Timestamp: metric.timestamp
      }));

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metricData
      });

      logger.info('Sending batched CloudWatch metrics', {
        namespace: this.namespace,
        metricsCount: metrics.length,
        attempt,
        region: this.cloudWatch.config.region
      });

      const result = await this.cloudWatch.send(command);
      
      logger.info('CloudWatch metrics batch sent successfully', {
        namespace: this.namespace,
        metricsCount: metrics.length,
        requestId: result.$metadata?.requestId,
        httpStatusCode: result.$metadata?.httpStatusCode
      });

    } catch (error) {
      logger.error('Failed to send CloudWatch metrics batch', {
        namespace: this.namespace,
        metricsCount: metrics.length,
        attempt,
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'unknown',
        errorCode: (error as any)?.code
      });

      // Retry logic
      if (attempt < this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        logger.info('Retrying CloudWatch metrics batch', {
          namespace: this.namespace,
          metricsCount: metrics.length,
          nextAttempt: attempt + 1,
          delayMs: delay
        });

        setTimeout(() => {
          this.sendMetrics(metrics, attempt + 1);
        }, delay);
      } else {
        logger.error('Failed to send CloudWatch metrics batch after all retries', {
          namespace: this.namespace,
          metricsCount: metrics.length,
          maxRetries: this.config.maxRetries
        });
      }
    }
  }

  /**
   * Start the automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.batch.length > 0) {
        logger.debug('Auto-flushing CloudWatch metrics batch', {
          batchSize: this.batch.length,
          intervalMs: this.config.flushIntervalMs
        });
        this.flush();
      }
    }, this.config.flushIntervalMs);
  }

  /**
   * Reset the flush timer
   */
  private resetFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    if (!this.isShuttingDown) {
      this.startFlushTimer();
    }
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batch.length;
  }

  /**
   * Get batch configuration
   */
  getConfig(): BatchConfig {
    return { ...this.config };
  }

  /**
   * Update batch configuration
   */
  updateConfig(newConfig: Partial<BatchConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart timer if flush interval changed
    if (newConfig.flushIntervalMs !== undefined) {
      this.resetFlushTimer();
    }

    logger.info('CloudWatch batcher configuration updated', {
      namespace: this.namespace,
      config: this.config
    });
  }

  /**
   * Graceful shutdown - flush remaining metrics and stop timer
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down CloudWatch batcher', {
      namespace: this.namespace,
      remainingMetrics: this.batch.length
    });

    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush any remaining metrics
    if (this.batch.length > 0) {
      await this.flush();
    }

    logger.info('CloudWatch batcher shutdown complete', {
      namespace: this.namespace
    });
  }

  /**
   * Health check for the batcher
   */
  getHealthStatus(): {
    isHealthy: boolean;
    batchSize: number;
    isShuttingDown: boolean;
    config: BatchConfig;
  } {
    return {
      isHealthy: !this.isShuttingDown && this.flushTimer !== null,
      batchSize: this.batch.length,
      isShuttingDown: this.isShuttingDown,
      config: this.config
    };
  }
}

// Singleton instance for the application
export const cloudWatchBatcher = new CloudWatchBatcher();

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down CloudWatch batcher');
  await cloudWatchBatcher.shutdown();
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down CloudWatch batcher');
  await cloudWatchBatcher.shutdown();
});