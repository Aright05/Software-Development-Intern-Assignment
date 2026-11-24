import { config } from '../config';
import { generateOAuthState, verifyOAuthState } from '../utils/crypto';
import { prisma } from './prismaService';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  name?: string;
  avatar?: string;
}

export class GoogleAuthService {
  /**
   * Generates the secure Google OAuth 2.0 authorization redirect URL with signed CSRF state
   */
  getAuthorizationUrl(): string {
    if (!config.google.clientId) {
      throw new AppError('Google OAuth is not configured. Missing GOOGLE_CLIENT_ID.', 500);
    }

    const state = generateOAuthState('google');
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Validates state and exchanges authorization code for verified user profile
   */
  async exchangeCodeAndGetProfile(code: string, state: string): Promise<GoogleUserProfile> {
    const stateVerification = verifyOAuthState(state);
    if (!stateVerification.valid || stateVerification.provider !== 'google') {
      throw new AppError('Invalid or expired OAuth state parameter. Possible CSRF attack.', 400);
    }

    if (!config.google.clientId || !config.google.clientSecret) {
      throw new AppError('Google OAuth credentials not configured on backend.', 500);
    }

    // 1. Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      logger.error('Google token exchange failed:', 'GoogleAuth', errBody);
      throw new AppError('Failed to exchange authorization code with Google.', 400, errBody);
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string; id_token?: string };

    // 2. Fetch verified user identity from Google
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userinfoResponse.ok) {
      throw new AppError('Failed to retrieve verified user identity from Google.', 400);
    }

    const profileData = (await userinfoResponse.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
      email_verified?: boolean;
    };

    if (!profileData.email) {
      throw new AppError('Google account did not return a verified email address.', 400);
    }

    return {
      googleId: profileData.sub,
      email: profileData.email.toLowerCase(),
      name: profileData.name,
      avatar: profileData.picture,
    };
  }

  /**
   * Creates or updates User record in PostgreSQL
   */
  async syncUserWithDatabase(profile: GoogleUserProfile) {
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      create: {
        googleId: profile.googleId,
        email: profile.email,
        name: profile.name,
        avatar: profile.avatar,
      },
      update: {
        googleId: profile.googleId,
        name: profile.name || undefined,
        avatar: profile.avatar || undefined,
      },
    });

    logger.info(`Synchronized user [${user.id}] via Google OAuth (${user.email})`, 'GoogleAuth');
    return user;
  }
}

export const googleAuthService = new GoogleAuthService();
