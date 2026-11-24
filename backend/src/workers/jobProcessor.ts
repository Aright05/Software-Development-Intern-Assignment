import { Job } from 'bullmq';
import { EmailJobPayload } from '../queues/emailQueue';
import { prisma } from '../services/prismaService';
import { emailService, EmailDeliveryResult } from '../services/emailService';
import { rateLimiterService } from '../services/rateLimiterService';
import { schedulerService } from '../services/schedulerService';
import { slackNotificationService } from '../services/slackNotificationService';
import { elasticsearchService } from '../services/elasticsearchService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { EmailStatus, Prisma } from '@prisma/client';

export interface JobExecutionResult {
  success?: boolean;
  skipped?: boolean;
  rescheduled?: boolean;
  delayMs?: number;
  reason?: string;
  emailId?: string;
  messageId?: string;
  previewUrl?: string | false;
  sentAt?: Date;
}

/**
 * Core BullMQ Job Processor for dispatching scheduled emails.
 * Enforces atomic database status transitions, idempotency gates,
 * and ensures emails are never marked SENT until SMTP transport confirms success.
 */
export const processEmailJob = async (job: Job<EmailJobPayload>): Promise<JobExecutionResult> => {
  const { emailId, recipient, subject, body, senderId } = job.data;

  logger.info(`[Job ${job.id}] Executing scheduled email [${emailId}] to recipient: ${recipient}`, 'JobProcessor');

  // 1. ATOMIC DATABASE STATUS TRANSITION (IDEMPOTENCY & CONCURRENCY GATE)
  // Only transition if currently in an unexecuted state (SCHEDULED, PENDING, or FAILED retry)
  const updateResult = await prisma.scheduledEmail.updateMany({
    where: {
      id: emailId,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.PENDING, EmailStatus.FAILED] },
    },
    data: {
      status: EmailStatus.PROCESSING,
      attempts: { increment: 1 },
      bullJobId: job.id,
    },
  });

  // If no rows were updated, this email was already processed, sent, or cancelled
  if (updateResult.count === 0) {
    const current = await prisma.scheduledEmail.findUnique({
      where: { id: emailId },
      select: { status: true, sentAt: true },
    });

    if (current?.status === EmailStatus.SENT) {
      logger.warn(`[Job ${job.id}] Email [${emailId}] is already SENT. Skipping to guarantee idempotency.`, 'JobProcessor');
      return { skipped: true, reason: 'Already delivered (SENT)' };
    }

    if (current?.status === EmailStatus.PROCESSING) {
      logger.warn(`[Job ${job.id}] Email [${emailId}] is currently being processed by another worker.`, 'JobProcessor');
      return { skipped: true, reason: 'Concurrent execution in progress' };
    }

    logger.warn(`[Job ${job.id}] Email [${emailId}] status is ${current?.status}. Skipping execution.`, 'JobProcessor');
    return { skipped: true, reason: `Invalid status: ${current?.status}` };
  }

  // 2. RETRIEVE SENDER CONFIGURATION
  const sender = await prisma.sender.findUnique({
    where: { id: senderId },
  });

  if (!sender || !sender.isActive) {
    const errorMsg = !sender ? `Sender account [${senderId}] was not found.` : `Sender account [${sender.email}] is disabled.`;
    logger.error(`[Job ${job.id}] ${errorMsg}`, 'JobProcessor');

    await prisma.scheduledEmail.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.FAILED,
        errorMessage: errorMsg,
      },
    });

    throw new Error(errorMsg);
  }

  // 2.5 DISTRIBUTED RATE LIMITING & SENDER THROTTLING (ATOMIC REDIS RESERVATION)
  // Atomically check hourly quota and minimum interval between individual sends
  const rateLimitResult = await rateLimiterService.checkAndReserve(
    sender.id,
    emailId,
    config.rateLimit.maxEmailsPerHourPerSender,
    config.rateLimit.minDelayBetweenEmailsMs
  );

  if (!rateLimitResult.allowed) {
    const nextExecutionAt = new Date(Date.now() + rateLimitResult.delayMs);
    logger.info(
      `[Job ${job.id}] Sender [${sender.id}] throttled (${rateLimitResult.reason}). Rescheduling email [${emailId}] with delay of ${rateLimitResult.delayMs}ms until ${nextExecutionAt.toISOString()}`,
      'JobProcessor'
    );

    // Yield worker concurrency immediately without sleep! Reschedule via BullMQ delayed job.
    await schedulerService.rescheduleWithDelay(job.data, rateLimitResult.delayMs);

    // Trigger Slack notification if sender reached hourly quota (non-blocking, deduplicated in Redis)
    if (rateLimitResult.reason === 'HOURLY_LIMIT_EXCEEDED') {
      slackNotificationService
        .notifyHourlyLimitReached({
          userId: job.data.userId,
          senderId: sender.id,
          senderName: sender.name,
          senderEmail: sender.email,
          hourlyLimit: config.rateLimit.maxEmailsPerHourPerSender,
          nextAvailableHour: nextExecutionAt,
        })
        .catch((err) => {
          logger.error('Slack notification execution failed:', 'JobProcessor', err);
        });
    }

    return {
      skipped: false,
      rescheduled: true,
      delayMs: rateLimitResult.delayMs,
      reason: `Throttled: ${rateLimitResult.reason}. Rescheduled to ${nextExecutionAt.toISOString()}`,
      emailId,
    };
  }

  // 3. SMTP DELIVERY DISPATCH VIA ETHEREAL / CONFIGURED TRANSPORTER
  let sendResult: EmailDeliveryResult;
  try {
    sendResult = await emailService.sendWithSender(sender, {
      to: recipient,
      subject,
      html: body,
    });

    logger.info(
      `[Job ${job.id}] SMTP dispatch confirmed. Message ID: ${sendResult.messageId} (Preview: ${sendResult.previewUrl || 'none'})`,
      'JobProcessor'
    );
  } catch (smtpError: any) {
    const errorMsg = smtpError?.message || 'SMTP transmission failed';
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);

    logger.error(`[Job ${job.id}] SMTP transmission failed for [${emailId}]: ${errorMsg}`, 'JobProcessor', smtpError);

    // Update error details and status without marking SENT
    await prisma.scheduledEmail.update({
      where: { id: emailId },
      data: {
        status: isLastAttempt ? EmailStatus.FAILED : EmailStatus.PENDING,
        errorMessage: errorMsg,
        metadata: {
          lastError: errorMsg,
          failedAt: new Date().toISOString(),
          attempt: job.attemptsMade + 1,
        } as Prisma.InputJsonValue,
      },
    });

    // Synchronize error status with Elasticsearch asynchronously
    elasticsearchService.updateEmailStatus(emailId, isLastAttempt ? EmailStatus.FAILED : EmailStatus.PENDING, null, errorMsg).catch(() => {});

    // Re-throw to activate BullMQ exponential backoff retry
    throw smtpError;
  }

  // 4. ATOMIC CONFIRMATION (ONLY MARK SENT AFTER SMTP SUCCESS)
  const finalizedEmail = await prisma.scheduledEmail.update({
    where: { id: emailId },
    data: {
      status: EmailStatus.SENT,
      sentAt: new Date(),
      errorMessage: null,
      metadata: {
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl || null,
        accepted: sendResult.accepted,
        rejected: sendResult.rejected,
        response: sendResult.response,
        dispatchedAt: sendResult.timestamp,
      } as Prisma.InputJsonValue,
    },
  });

  // Synchronize SENT status with Elasticsearch asynchronously
  elasticsearchService.updateEmailStatus(emailId, EmailStatus.SENT, finalizedEmail.sentAt).catch(() => {});

  logger.info(`[Job ${job.id}] Successfully delivered email [${emailId}]. Marked status = SENT.`, 'JobProcessor');

  return {
    success: true,
    emailId: finalizedEmail.id,
    messageId: sendResult.messageId,
    previewUrl: sendResult.previewUrl,
    sentAt: finalizedEmail.sentAt || new Date(),
  };
};
