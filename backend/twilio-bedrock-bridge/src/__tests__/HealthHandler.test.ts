/**
 * Tests for HealthHandler - Kubernetes health check endpoints
 */

import { Request, Response } from 'express';
import { HealthHandler } from '../handlers/HealthHandler';

// Mock dependencies
jest.mock('../utils/logger');

describe('HealthHandler', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('getReadiness', () => {
    it('should return ready status', async () => {
      await HealthHandler.getReadiness(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'ready',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock an error by making json throw on first call, succeed on second
      let callCount = 0;
      (mockRes.json as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Test error');
        }
        return mockRes;
      });

      await HealthHandler.getReadiness(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });

  describe('getLiveness', () => {
    it('should return alive status', async () => {
      await HealthHandler.getLiveness(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        status: 'alive',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    it('should handle errors gracefully', async () => {
      // Mock an error by making json throw on first call, succeed on second
      let callCount = 0;
      (mockRes.json as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Test error');
        }
        return mockRes;
      });

      await HealthHandler.getLiveness(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(503);
    });
  });
});