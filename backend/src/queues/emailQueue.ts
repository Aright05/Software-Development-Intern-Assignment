import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config';
import { createRedisConnection } from '../config/queueConnection';
import { logger } from '../utils/logger';

export interface EmailJobPayload {
  emailId: string;
  idempotencyKey: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  campaignId?: string | null;
}

// Dedicated connection instances for Queue and QueueEvents
const queueConnection = createRedisConnection('EmailQueue');
const eventsConnection = createRedisConnection('QueueEvents');

export const EMAIL_JOB_NAME = 'send-scheduled-email';

export const emailQueue = new Queue<EmailJobPayload>(config.queue.name, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // keep completed jobs for 24h for audit/history
      count: 5000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // keep failed jobs for 7 days
    },
  },
});

export const emailQueueEvents = new QueueEvents(config.queue.name, {
  connection: eventsConnection,
});

emailQueueEvents.on('waiting', ({ jobId }) => {
  logger.debug(`Job ${jobId} is waiting in queue`, 'EmailQueue');
});

emailQueueEvents.on('completed', ({ jobId }) => {
  logger.info(`Job ${jobId} completed successfully`, 'EmailQueue');
});

emailQueueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.error(`Job ${jobId} failed: ${failedReason}`, 'EmailQueue');
});
