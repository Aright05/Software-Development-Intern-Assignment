import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { authenticateUser } from './middleware/authMiddleware';
import { bullBoardAuth } from './middleware/bullBoardAuth';
import { bullBoardAdapter } from './config/bullBoard';
import apiRoutes from './routes';

export const createApp = (): Application => {
  const app = express();

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: [config.frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-email', 'x-user-name'],
    })
  );

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Global user context & session authentication
  app.use(authenticateUser);

  // Request logger
  app.use(requestLogger);

  // Bull Board Queue Dashboard route (Protected by session or Basic Auth)
  app.use(config.bullBoard.path, bullBoardAuth, bullBoardAdapter.getRouter());

  // Mount API routes at both /api and config.apiPrefix (/api/v1) for seamless client compatibility
  app.use('/api', apiRoutes);
  if (config.apiPrefix !== '/api') {
    app.use(config.apiPrefix, apiRoutes);
  }

  // Root endpoint info
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'ReachInbox Email Job Scheduler API',
      version: '1.0.0',
      status: 'active',
      endpoints: {
        health: '/api/health',
        campaigns: '/api/campaigns',
        senders: '/api/senders',
        scheduledEmails: '/api/emails/scheduled',
        sentEmails: '/api/emails/sent',
        queues: config.bullBoard.path,
      },
    });
  });

  // Catch-all 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        message: `Route not found: ${req.method} ${req.originalUrl}`,
      },
    });
  });

  // Centralized error handler
  app.use(errorHandler);

  return app;
};
