import { Router } from 'express';
import {
  initiateGoogleLogin,
  handleGoogleCallback,
  getCurrentUser,
  logout,
} from '../controllers/authController';
import { requireUser } from '../middleware/authMiddleware';

const router = Router();

// Public OAuth routes
router.get('/google', initiateGoogleLogin);
router.get('/google/callback', handleGoogleCallback);
router.post('/logout', logout);

// Protected user profile route
router.get('/me', requireUser, getCurrentUser);

export default router;
