import { Request, Response } from 'express';

export const getHealthStatus = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: 'healthy',
    service: 'reachinbox-scheduler-backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
};
