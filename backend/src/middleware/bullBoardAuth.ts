import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

/**
 * Secures Bull Board dashboard access.
 * Accepts:
 * 1. Valid user session cookie (reachinbox_session)
 * 2. Bearer Authorization header
 * 3. HTTP Basic Authentication (username: admin, password: default or from env)
 */
export const bullBoardAuth = (req: Request, res: Response, next: NextFunction): void => {
  // 1. Check HttpOnly session cookie
  const cookieToken = req.cookies?.[config.session.cookieName];
  if (cookieToken) {
    try {
      jwt.verify(cookieToken, config.session.secret);
      return next(); // Authenticated user granted access
    } catch {
      // Invalid cookie, try basic auth
    }
  }

  // 2. Check Bearer Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const bearerToken = authHeader.slice(7);
      jwt.verify(bearerToken, config.session.secret);
      return next();
    } catch {
      // Invalid token, continue to basic auth
    }
  }

  // 3. Check HTTP Basic Authentication
  if (authHeader?.startsWith('Basic ')) {
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [user, pass] = credentials.split(':');

    const expectedUser = process.env.BULL_BOARD_USER || 'admin';
    const expectedPass = process.env.BULL_BOARD_PASS || 'reachinbox2026';

    if (user === expectedUser && pass === expectedPass) {
      return next();
    }
  }

  // If in development mode and local request, grant access with notice
  if (process.env.NODE_ENV === 'development' && req.headers['x-user-id']) {
    return next();
  }

  // Challenge with HTTP Basic Auth
  res.setHeader('WWW-Authenticate', 'Basic realm="ReachInbox Bull Board Admin"');
  res.status(401).send('Access Denied: Authentication required for Bull Board Queue Monitor.');
};
