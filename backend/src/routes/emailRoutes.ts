import { Router } from 'express';
import {
  getScheduledEmails,
  getSentEmails,
  getEmailById,
  getEmailStats,
  sendTestEmail,
  searchEmails,
  reindexEmails,
} from '../controllers/emailController';
import { requireUser } from '../middleware/authMiddleware';

const router = Router();

// Apply tenant user isolation middleware to all email routes
router.use(requireUser);

router.get('/stats', getEmailStats);
router.get('/search', searchEmails);
router.post('/reindex', reindexEmails);
router.post('/test-send', sendTestEmail);
router.get('/scheduled', getScheduledEmails);
router.get('/sent', getSentEmails);
router.get('/:id', getEmailById);

export default router;
