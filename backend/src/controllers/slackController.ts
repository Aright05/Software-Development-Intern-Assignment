import { Request, Response, NextFunction } from 'express';
import { slackAuthService } from '../services/slackAuthService';
import { slackNotificationService } from '../services/slackNotificationService';
import { config } from '../config';
import { AppError } from '../middleware/errorHandler';

export const connectSlack = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const userId = req.user!.id;
    const authUrl = slackAuthService.getAuthorizationUrl(userId);
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

export const handleSlackCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      throw new AppError(`Slack authorization denied: ${oauthError}`, 400);
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      throw new AppError('Authorization code or state parameter is missing from Slack callback.', 400);
    }

    const integration = await slackAuthService.exchangeCodeAndConnect(code, state);

    // Redirect to frontend senders/integrations view
    res.redirect(`${config.frontendUrl}/senders?slack=connected&team=${encodeURIComponent(integration.teamName || 'Workspace')}`);
  } catch (error) {
    next(error);
  }
};

export const getSlackStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const status = await slackAuthService.getConnectionStatus(userId);

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectSlack = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    await slackAuthService.disconnect(userId);

    res.status(200).json({
      success: true,
      message: 'Slack workspace disconnected successfully.',
    });
  } catch (error) {
    next(error);
  }
};

export const testSlackNotification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await slackNotificationService.sendTestMessage(userId);

    if (!result.success) {
      throw new AppError(result.message, 400);
    }

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
