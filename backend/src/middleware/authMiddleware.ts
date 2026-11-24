import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../services/prismaService';
import { AppError } from './errorHandler';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  avatar?: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const DEFAULT_DEV_USER: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'developer@reachinbox.ai',
  name: 'ReachInbox Developer',
  avatar: null,
};

/**
 * Parses user identity from:
 * 1. HttpOnly secure session cookie
 * 2. Authorization Bearer header
 * 3. x-user-id header (for API tests / programmatic access)
 * 4. Development fallback
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.cookies?.[config.session.cookieName] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (token) {
    try {
      const decoded = jwt.verify(token, config.session.secret) as { id: string; email: string; name?: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, name: true, avatar: true },
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name || undefined,
          avatar: user.avatar,
        };
        return next();
      }
    } catch {
      // Invalid/expired token: continue to fallback/header check
    }
  }

  // Check programmatic / test header
  const userIdHeader = req.headers['x-user-id'];
  const userEmailHeader = req.headers['x-user-email'];

  if (typeof userIdHeader === 'string' && userIdHeader.trim()) {
    req.user = {
      id: userIdHeader.trim(),
      email: typeof userEmailHeader === 'string' ? userEmailHeader.trim() : `user-${userIdHeader}@reachinbox.local`,
      name: (req.headers['x-user-name'] as string) || undefined,
      avatar: null,
    };
    return next();
  }

  // Development tenant fallback
  if (process.env.NODE_ENV !== 'production') {
    req.user = DEFAULT_DEV_USER;
  }

  next();
};

/**
 * Strict authentication guard middleware for private endpoints
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user) {
    throw new AppError('Authentication required. Please log in with Google.', 401);
  }
  next();
};

// Aliased for backward compatibility with existing routes
export const requireUser = (req: Request, res: Response, next: NextFunction): void => {
  authenticateUser(req, res, () => {
    requireAuth(req, res, next);
  });
};
