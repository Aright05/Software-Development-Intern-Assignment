import { config } from '../config';
import { generateOAuthState, verifyOAuthState, encrypt } from '../utils/crypto';
import { prisma } from './prismaService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { SlackConnectionStatus } from '@prisma/client';

export class SlackAuthService {
  /**
   * Generates Slack OAuth authorization redirect URL requesting minimum required permissions
   */
  getAuthorizationUrl(userId: string): string {
    if (!config.slack.clientId) {
      throw new AppError('Slack integration is not configured. Missing SLACK_CLIENT_ID.', 500);
    }

    const state = generateOAuthState('slack', userId);
    const scopes = ['chat:write', 'channels:read', 'groups:read'];

    const params = new URLSearchParams({
      client_id: config.slack.clientId,
      scope: scopes.join(','),
      redirect_uri: config.slack.redirectUri,
      state,
    });

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  }

  /**
   * Validates state, exchanges authorization code for bot token, encrypts token and saves to PostgreSQL
   */
  async exchangeCodeAndConnect(code: string, state: string) {
    const stateVerification = verifyOAuthState(state);
    if (!stateVerification.valid || stateVerification.provider !== 'slack' || !stateVerification.userId) {
      throw new AppError('Invalid or expired OAuth state parameter. Possible CSRF attack.', 400);
    }

    const userId = stateVerification.userId;

    if (!config.slack.clientId || !config.slack.clientSecret) {
      throw new AppError('Slack OAuth credentials not configured on backend.', 500);
    }

    // 1. Exchange code for permanent bot token
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.slack.clientId,
        client_secret: config.slack.clientSecret,
        code,
        redirect_uri: config.slack.redirectUri,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      access_token?: string;
      token_type?: string;
      scope?: string;
      bot_user_id?: string;
      team?: { id: string; name: string };
      incoming_webhook?: { channel?: string; channel_id?: string };
      error?: string;
    };

    if (!data.ok || !data.access_token || !data.team?.id) {
      logger.error('Slack OAuth exchange failed:', 'SlackAuth', data.error);
      throw new AppError(`Slack authorization failed: ${data.error || 'Unknown error'}`, 400);
    }

    // 2. Encrypt token before persisting into PostgreSQL
    const encryptedToken = encrypt(data.access_token);
    const teamId = data.team.id;
    const teamName = data.team.name;
    const channelId = data.incoming_webhook?.channel_id || null;
    const channelName = data.incoming_webhook?.channel || null;

    // 3. Upsert SlackIntegration in PostgreSQL
    const integration = await prisma.slackIntegration.upsert({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      create: {
        userId,
        encryptedToken,
        teamId,
        teamName,
        channelId,
        channelName,
        status: SlackConnectionStatus.CONNECTED,
      },
      update: {
        encryptedToken,
        teamName,
        channelId,
        channelName,
        status: SlackConnectionStatus.CONNECTED,
      },
    });

    logger.info(`Connected Slack workspace [${teamName} (${teamId})] for user [${userId}]`, 'SlackAuth');
    return integration;
  }

  /**
   * Retrieves connection status for the user
   */
  async getConnectionStatus(userId: string) {
    const integration = await prisma.slackIntegration.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        channelName: true,
        status: true,
        updatedAt: true,
      },
    });

    return {
      connected: integration?.status === SlackConnectionStatus.CONNECTED,
      integration,
    };
  }

  /**
   * Disconnects Slack workspace for a user
   */
  async disconnect(userId: string) {
    await prisma.slackIntegration.updateMany({
      where: { userId },
      data: { status: SlackConnectionStatus.DISCONNECTED },
    });

    logger.info(`Disconnected Slack integrations for user [${userId}]`, 'SlackAuth');
    return { success: true };
  }
}

export const slackAuthService = new SlackAuthService();
