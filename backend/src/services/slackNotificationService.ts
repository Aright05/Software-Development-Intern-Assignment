import { prisma } from './prismaService';
import { decrypt } from '../utils/crypto';
import { redisClient } from '../config/redis';
import { rateLimiterService } from './rateLimiterService';
import { logger } from '../utils/logger';
import { SlackConnectionStatus } from '@prisma/client';

export interface RateLimitNotificationPayload {
  userId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  hourlyLimit: number;
  nextAvailableHour: Date;
}

export class SlackNotificationService {
  /**
   * Sends an actual Slack notification when a sender hits the hourly quota.
   * Deduplicates notifications per sender per hour in Redis to prevent spam.
   * Fails gracefully without interrupting email scheduling if Slack is disconnected or revoked.
   */
  async notifyHourlyLimitReached(payload: RateLimitNotificationPayload): Promise<boolean> {
    const { userId, senderId, senderName, senderEmail, hourlyLimit, nextAvailableHour } = payload;
    const utcHour = rateLimiterService.getUtcHourWindow();
    const dedupKey = `notif:ratelimit:sender:${senderId}:hour:${utcHour}`;

    try {
      // 1. DEDUPLICATION GATE: Send at most ONE Slack notification per sender per hourly window
      const alreadyNotified = await redisClient.get(dedupKey);
      if (alreadyNotified) {
        logger.debug(`Slack notification already dispatched for sender [${senderId}] in UTC hour ${utcHour}. Skipping.`, 'SlackNotification');
        return false;
      }

      // Mark notification as dispatched with 2-hour TTL
      await redisClient.set(dedupKey, '1', 'EX', 7200);

      // 2. RETRIEVE ACTIVE SLACK INTEGRATION
      const integration = await prisma.slackIntegration.findFirst({
        where: {
          userId,
          status: SlackConnectionStatus.CONNECTED,
        },
      });

      if (!integration) {
        logger.info(`User [${userId}] has no connected Slack workspace. Continuing email throttling without notification.`, 'SlackNotification');
        return false;
      }

      // 3. DECRYPT OAUTH BOT TOKEN
      let token: string;
      try {
        token = decrypt(integration.encryptedToken);
      } catch (decryptErr) {
        logger.error('Failed to decrypt Slack bot token:', 'SlackNotification', decryptErr);
        return false;
      }

      // 4. POST TO SLACK VIA CHAT.POSTMESSAGE
      const messageBlocks = [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '⚠️ Sender Rate Limit Reached',
            emoji: true,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Sender Account:*\n${senderName} (${senderEmail})`,
            },
            {
              type: 'mrkdwn',
              text: `*Hourly Quota:*\n${hourlyLimit} emails / hour`,
            },
            {
              type: 'mrkdwn',
              text: '*Status:*\nThrottled & Delayed',
            },
            {
              type: 'mrkdwn',
              text: `*Next Execution Window:*\n<!date^${Math.floor(nextAvailableHour.getTime() / 1000)}^{date_num} {time_secs}|${nextAvailableHour.toISOString()}>`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '🛡️ *ReachInbox Engine:* Remaining jobs have been safely delayed via BullMQ. Concurrency slots freed.',
            },
          ],
        },
      ];

      // If channelId is present use it, otherwise fall back to #general or default channel
      const targetChannel = integration.channelId || '#general';

      const slackResponse = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          channel: targetChannel,
          text: `⚠️ Rate Limit Alert: Sender "${senderName}" (${senderEmail}) reached hourly sending limit (${hourlyLimit} emails/hr).`,
          blocks: messageBlocks,
        }),
      });

      const responseData = (await slackResponse.json()) as { ok: boolean; error?: string };

      if (!responseData.ok) {
        logger.warn(`Slack API message dispatch failed: ${responseData.error}`, 'SlackNotification');

        // Handle revoked or invalid tokens gracefully
        if (['token_revoked', 'invalid_auth', 'account_inactive'].includes(responseData.error || '')) {
          logger.warn(`Slack token revoked for user [${userId}], marking integration as DISCONNECTED`, 'SlackNotification');
          await prisma.slackIntegration.update({
            where: { id: integration.id },
            data: { status: SlackConnectionStatus.DISCONNECTED },
          });
        }
        return false;
      }

      logger.info(`Slack alert successfully posted to [${targetChannel}] in workspace [${integration.teamName}]`, 'SlackNotification');
      return true;
    } catch (err: any) {
      // Never throw from Slack notification service — email engine continues uninterrupted
      logger.error(`Error sending Slack alert: ${err.message}`, 'SlackNotification', err);
      return false;
    }
  }

  /**
   * Dispatches a manual test notification to verify integration
   */
  async sendTestMessage(userId: string): Promise<{ success: boolean; message: string }> {
    const integration = await prisma.slackIntegration.findFirst({
      where: {
        userId,
        status: SlackConnectionStatus.CONNECTED,
      },
    });

    if (!integration) {
      return { success: false, message: 'No connected Slack workspace found for this user.' };
    }

    const token = decrypt(integration.encryptedToken);
    const targetChannel = integration.channelId || '#general';

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: '✅ ReachInbox Slack Integration successfully connected and verified!',
      }),
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      return { success: false, message: `Slack API error: ${data.error}` };
    }

    return { success: true, message: `Test notification delivered to ${targetChannel}.` };
  }
}

export const slackNotificationService = new SlackNotificationService();
