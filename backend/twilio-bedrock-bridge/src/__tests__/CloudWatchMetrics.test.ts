/**
 * Tests for CloudWatchMetrics
 */

import { CloudWatchMetricsService } from '../observability/cloudWatchMetrics';

// Mock AWS SDK
jest.mock('@aws-sdk/client-cloudwatch', () => {
  const mockSend = jest.fn().mockResolvedValue({});
  const mockClient = {
    send: mockSend,
    config: { region: 'us-east-1' }
  };
  
  return {
    CloudWatchClient: jest.fn(() => mockClient),
    PutMetricDataCommand: jest.fn((input) => ({ input }))
  };
});

jest.mock('../utils/logger');

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

describe('CloudWatchMetricsService', () => {
  let mockCloudWatchClient: any;

  beforeEach(() => {
    // Get the mocked client instance
    mockCloudWatchClient = new CloudWatchClient();
    jest.clearAllMocks();
  });

  describe('Basic Functionality', () => {
    it('should create CloudWatch client when putting metrics', async () => {
      await CloudWatchMetricsService.putMetric('TestMetric', 42, 'Count');
      
      expect(CloudWatchClient).toHaveBeenCalledWith({
        region: process.env.AWS_REGION || 'us-east-1'
      });
      expect(mockCloudWatchClient.send).toHaveBeenCalled();
    });

    it('should handle batch status', () => {
      const status = CloudWatchMetricsService.getBatchStatus();
      
      expect(status).toHaveProperty('batchSize');
      expect(status).toHaveProperty('isHealthy');
      expect(status).toHaveProperty('config');
    });

    it('should flush metrics', async () => {
      await CloudWatchMetricsService.flush();
      // Should not throw
    });
  });

  describe('Metric Recording', () => {
    it('should record count metrics', () => {
      CloudWatchMetricsService.recordCount('TestCount', 5);
      // Should not throw
    });

    it('should record gauge metrics', () => {
      CloudWatchMetricsService.recordGauge('TestGauge', 100);
      // Should not throw
    });

    it('should record duration metrics', () => {
      CloudWatchMetricsService.recordDuration('TestDuration', 1500);
      // Should not throw
    });

    it('should record multiple metrics', () => {
      const metrics = [
        { name: 'Metric1', value: 10, unit: 'Count' },
        { name: 'Metric2', value: 20, unit: 'Milliseconds' }
      ];
      
      CloudWatchMetricsService.recordMetrics(metrics);
      // Should not throw
    });
  });
});