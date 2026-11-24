import { Router } from 'express';
import { createSender, getSenders } from '../controllers/senderController';
import { requireUser } from '../middleware/authMiddleware';

const router = Router();

// Apply tenant user isolation middleware to all sender routes
router.use(requireUser);

router.post('/', createSender);
router.get('/', getSenders);

export default router;
