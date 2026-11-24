import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { googleAuthService } from '../services/googleAuthService';
import { config } from '../config';
import { prisma } from '../services/prismaService';
import { AppError } from '../middleware/errorHandler';

export const initiateGoogleLogin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authUrl = googleAuthService.getAuthorizationUrl();
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
};

export const handleGoogleCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      throw new AppError('Authorization code or state parameter is missing from Google callback.', 400);
    }

    // Exchange authorization code for verified Google profile
    const profile = await googleAuthService.exchangeCodeAndGetProfile(code, state);

    // Synchronize user record in PostgreSQL
    const user = await googleAuthService.syncUserWithDatabase(profile);

    // Issue signed JWT session token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      config.session.secret,
      { expiresIn: '7d' }
    );

    // Issue secure HttpOnly session cookie
    res.cookie(config.session.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 3600 * 1000, // 7 days
      path: '/',
    });

    // Redirect to frontend application
    res.redirect(`${config.frontendUrl}/?login=success`);
  } catch (error) {
    next(error);
  }
};

export const getCurrentUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Not authenticated', 401);
    }

    let user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      // Upsert the user to ensure database persistence
      user = await prisma.user.upsert({
        where: { id: req.user.id },
        update: {},
        create: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name || 'ReachInbox Developer',
          avatar: req.user.avatar || null,
        },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          createdAt: true,
          updatedAt: true,
        },
      }).catch(() => null);

      if (!user) {
        res.status(200).json({
          success: true,
          data: {
            id: req.user.id,
            email: req.user.email,
            name: req.user.name || 'ReachInbox Developer',
            avatar: req.user.avatar || null,
          },
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = (req: Request, res: Response): void => {
  res.clearCookie(config.session.cookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
};
