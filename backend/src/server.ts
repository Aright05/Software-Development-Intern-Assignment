import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { closeRedisConnections } from './config/queueConnection';
import { prisma } from './services/prismaService';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`API Server listening on port ${config.port} in ${config.nodeEnv} mode`, 'Server');
  logger.info(`Health check available at: http://localhost:${config.port}${config.apiPrefix}/health`, 'Server');
  logger.info(`Bull Board UI available at: http://localhost:${config.port}${config.bullBoard.path}`, 'Server');
});

// Graceful shutdown handling for API process
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting API server graceful shutdown...`, 'Server');

  server.close(async () => {
    logger.info('HTTP server closed.', 'Server');

    try {
      await closeRedisConnections();
      await prisma.$disconnect();
      logger.info('All API connections cleanly terminated. Exiting.', 'Server');
      process.exit(0);
    } catch (err) {
      logger.error('Error during API server shutdown:', 'Server', err);
      process.exit(1);
    }
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.', 'Server');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
