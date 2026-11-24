import { startEmailWorker, stopEmailWorker } from './workers/emailWorker';
import { schedulerService } from './services/schedulerService';
import { closeRedisConnections } from './config/queueConnection';
import { prisma } from './services/prismaService';
import { logger } from './utils/logger';

logger.info('==================================================', 'WorkerProcess');
logger.info('Starting ReachInbox Dedicated Email Worker Process', 'WorkerProcess');
logger.info('==================================================', 'WorkerProcess');

// 1. Initialize BullMQ worker
const worker = startEmailWorker();

// 2. Perform crash recovery and job reconciliation from PostgreSQL on startup
schedulerService.recoverPendingJobs().then(({ recoveredCount, totalChecked }) => {
  logger.info(
    `Reconciliation completed: ${recoveredCount} jobs recovered out of ${totalChecked} pending records`,
    'WorkerProcess'
  );
});

// 3. Graceful shutdown handler
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Shutting down worker process gracefully...`, 'WorkerProcess');

  try {
    await stopEmailWorker();
    await closeRedisConnections();
    await prisma.$disconnect();
    logger.info('Worker process cleanly terminated. Exiting.', 'WorkerProcess');
    process.exit(0);
  } catch (err) {
    logger.error('Error during worker shutdown:', 'WorkerProcess', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
