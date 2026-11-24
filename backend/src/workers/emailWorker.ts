import { Worker, Job } from 'bullmq';
import { config } from '../config';
import { createRedisConnection } from '../config/queueConnection';
import { EmailJobPayload } from '../queues/emailQueue';
import { processEmailJob, JobExecutionResult } from './jobProcessor';
import { logger } from '../utils/logger';

let emailWorker: Worker<EmailJobPayload, JobExecutionResult> | null = null;

/**
 * Initializes and starts the BullMQ background worker.
 * Concurrency is configured via WORKER_CONCURRENCY env var.
 * Distributed rate limiting is enforced atomically in Redis.
 * Stalled job detection handles worker crashes safely.
 */
export const startEmailWorker = (): Worker<EmailJobPayload, JobExecutionResult> => {
  if (emailWorker) {
    return emailWorker;
  }

  const workerConnection = createRedisConnection('EmailWorker');

  emailWorker = new Worker<EmailJobPayload, JobExecutionResult>(
    config.queue.name,
    async (job: Job<EmailJobPayload>): Promise<JobExecutionResult> => {
      return processEmailJob(job);
    },
    {
      connection: workerConnection,
      concurrency: config.queue.concurrency,
      limiter: {
        max: config.queue.maxEmailsPerSecond,
        duration: config.queue.rateLimitDurationMs,
      },
      // Stalled job handling: recovers jobs safely if worker crashes mid-execution
      lockDuration: 30000,      // 30 seconds visibility lock
      stalledInterval: 15000,   // Check for stalled jobs every 15s
      maxStalledCount: 2,       // Retry stalled jobs up to twice before failure
    }
  );

  emailWorker.on('completed', (job: Job<EmailJobPayload>, result: JobExecutionResult) => {
    if (result.skipped) {
      logger.info(`[Worker] Job ${job.id} completed (Skipped: ${result.reason})`, 'EmailWorker');
    } else {
      logger.info(`[Worker] Job ${job.id} successfully completed for ${job.data.recipient}`, 'EmailWorker');
    }
  });

  emailWorker.on('failed', (job: Job<EmailJobPayload> | undefined, err: Error) => {
    logger.error(`[Worker] Job ${job?.id} failed on attempt ${job?.attemptsMade}: ${err.message}`, 'EmailWorker', err);
  });

  emailWorker.on('stalled', (jobId: string) => {
    logger.warn(`[Worker] Job ${jobId} was stalled and has been reclaimed for execution`, 'EmailWorker');
  });

  emailWorker.on('error', (err: Error) => {
    logger.error(`[Worker] Internal worker error: ${err.message}`, 'EmailWorker', err);
  });

  emailWorker.on('drained', () => {
    logger.debug('[Worker] Queue is now drained (no pending active jobs)', 'EmailWorker');
  });

  logger.info(
    `Email Worker started [Queue: ${config.queue.name}, Concurrency: ${config.queue.concurrency}, RateLimit: ${config.queue.maxEmailsPerSecond}/s]`,
    'EmailWorker'
  );

  return emailWorker;
};

/**
 * Gracefully shuts down the BullMQ email worker
 */
export const stopEmailWorker = async (): Promise<void> => {
  if (emailWorker) {
    logger.info('Stopping Email Worker gracefully...', 'EmailWorker');
    await emailWorker.close();
    emailWorker = null;
    logger.info('Email Worker stopped successfully', 'EmailWorker');
  }
};

export const getEmailWorker = (): Worker<EmailJobPayload, JobExecutionResult> | null => {
  return emailWorker;
};
