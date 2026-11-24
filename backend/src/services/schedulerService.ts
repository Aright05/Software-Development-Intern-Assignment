import { emailQueue, EMAIL_JOB_NAME, EmailJobPayload } from '../queues/emailQueue';
import { prisma } from './prismaService';
import { logger } from '../utils/logger';
import { EmailStatus, ScheduledEmail } from '@prisma/client';

export type SchedulableEmail = Pick<
  ScheduledEmail,
  'id' | 'idempotencyKey' | 'userId' | 'senderId' | 'recipient' | 'subject' | 'body' | 'scheduledAt' | 'campaignId'
>;

export class SchedulerService {
  /**
   * Schedules a single email with BullMQ using deterministic Job ID and delayed execution.
   */
  async scheduleEmail(email: SchedulableEmail): Promise<string> {
    const scheduledTime = new Date(email.scheduledAt).getTime();
    const now = Date.now();
    const delay = Math.max(0, scheduledTime - now);

    // Deterministic Job ID derived directly from the unique scheduled email ID
    const jobId = email.id;

    const payload: EmailJobPayload = {
      emailId: email.id,
      idempotencyKey: email.idempotencyKey,
      userId: email.userId,
      senderId: email.senderId,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      scheduledAt: new Date(email.scheduledAt).toISOString(),
      campaignId: email.campaignId,
    };

    // BullMQ rejects duplicate job IDs if job already exists with that ID, preventing duplicate queueing
    await emailQueue.add(EMAIL_JOB_NAME, payload, {
      delay,
      jobId,
    });

    // Synchronize BullMQ job ID on database record
    await prisma.scheduledEmail.update({
      where: { id: email.id },
      data: {
        bullJobId: jobId,
        status: delay === 0 ? EmailStatus.PENDING : EmailStatus.SCHEDULED,
      },
    });

    logger.info(
      `Scheduled email [${email.id}] to [${email.recipient}] with delay of ${delay}ms (Job ID: ${jobId})`,
      'SchedulerService'
    );

    return jobId;
  }

  /**
   * Bulk schedules a collection of emails (e.g. from an email campaign)
   */
  async scheduleBatch(emails: SchedulableEmail[]): Promise<number> {
    if (emails.length === 0) return 0;

    const now = Date.now();

    const jobs = emails.map((email) => {
      const scheduledTime = new Date(email.scheduledAt).getTime();
      const delay = Math.max(0, scheduledTime - now);
      const jobId = email.id;

      const payload: EmailJobPayload = {
        emailId: email.id,
        idempotencyKey: email.idempotencyKey,
        userId: email.userId,
        senderId: email.senderId,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        scheduledAt: new Date(email.scheduledAt).toISOString(),
        campaignId: email.campaignId,
      };

      return {
        name: EMAIL_JOB_NAME,
        data: payload,
        opts: {
          delay,
          jobId,
        },
      };
    });

    await emailQueue.addBulk(jobs);

    logger.info(`Successfully bulk-scheduled ${jobs.length} emails in BullMQ`, 'SchedulerService');
    return jobs.length;
  }

  /**
   * Reschedules an existing job with a calculated delay (used for rate-limiting & throttling).
   * Does not hold worker threads; returns worker concurrency immediately.
   */
  async rescheduleWithDelay(data: EmailJobPayload, delayMs: number): Promise<string> {
    const scheduledAt = new Date(Date.now() + delayMs);
    const newJobId = `${data.emailId}_t${Date.now()}`;

    const updatedPayload: EmailJobPayload = {
      ...data,
      scheduledAt: scheduledAt.toISOString(),
    };

    await emailQueue.add(EMAIL_JOB_NAME, updatedPayload, {
      delay: delayMs,
      jobId: newJobId,
    });

    await prisma.scheduledEmail.update({
      where: { id: data.emailId },
      data: {
        bullJobId: newJobId,
        status: EmailStatus.SCHEDULED,
        scheduledAt,
      },
    });

    logger.info(
      `Rescheduled email [${data.emailId}] with delay of ${delayMs}ms until ${scheduledAt.toISOString()} (New Job: ${newJobId})`,
      'SchedulerService'
    );

    return newJobId;
  }

  /**
   * Crash Recovery & Reconciliation:
   * Recovers missing BullMQ queue jobs from PostgreSQL records after application restart
   * WITHOUT creating duplicate jobs or sending duplicates.
   * Runs without cron or external schedulers.
   */
  async recoverPendingJobs(): Promise<{ totalChecked: number; recoveredCount: number }> {
    logger.info('Starting pending job recovery and reconciliation...', 'SchedulerService');

    try {
      // Find all emails in SCHEDULED or PENDING status that have not been SENT
      const pendingEmails = await prisma.scheduledEmail.findMany({
        where: {
          status: { in: [EmailStatus.SCHEDULED, EmailStatus.PENDING] },
        },
        orderBy: { scheduledAt: 'asc' },
      });

      let recoveredCount = 0;
      const now = Date.now();

      for (const email of pendingEmails) {
        const jobId = email.id;

        // Check if job already exists in BullMQ
        const existingJob = await emailQueue.getJob(jobId);

        if (!existingJob) {
          const scheduledTime = new Date(email.scheduledAt).getTime();
          const delay = Math.max(0, scheduledTime - now);

          const payload: EmailJobPayload = {
            emailId: email.id,
            idempotencyKey: email.idempotencyKey,
            userId: email.userId,
            senderId: email.senderId,
            recipient: email.recipient,
            subject: email.subject,
            body: email.body,
            scheduledAt: email.scheduledAt.toISOString(),
            campaignId: email.campaignId,
          };

          await emailQueue.add(EMAIL_JOB_NAME, payload, {
            delay,
            jobId,
          });

          recoveredCount++;
          logger.info(`Recovered missing queue job [${jobId}] for email [${email.id}] (Delay: ${delay}ms)`, 'SchedulerService');
        }
      }

      logger.info(
        `Job reconciliation complete: ${recoveredCount} missing job(s) recovered out of ${pendingEmails.length} checked.`,
        'SchedulerService'
      );

      return {
        totalChecked: pendingEmails.length,
        recoveredCount,
      };
    } catch (error) {
      logger.error('Failed to run pending job recovery:', 'SchedulerService', error);
      return { totalChecked: 0, recoveredCount: 0 };
    }
  }
}

export const schedulerService = new SchedulerService();
