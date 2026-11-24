import { Router } from 'express';
import {
  connectSlack,
  handleSlackCallback,
  getSlackStatus,
  disconnectSlack,
  testSlackNotification,
} from '../controllers/slackController';
import { requireUser } from '../middleware/authMiddleware';

const router = Router();

// Callback is invoked by Slack redirect
router.get('/callback', handleSlackCallback);

// Protected routes requiring authenticated user
router.use(requireUser);

router.get('/connect', connectSlack);
router.get('/status', getSlackStatus);
router.post('/disconnect', disconnectSlack);
router.post('/test-notify', testSlackNotification);

export default router;
