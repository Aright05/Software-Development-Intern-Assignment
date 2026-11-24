import { Router } from 'express';
import { createCampaign, getCampaigns } from '../controllers/campaignController';
import { requireUser } from '../middleware/authMiddleware';

const router = Router();

// Apply tenant user isolation middleware to all campaign routes
router.use(requireUser);

router.post('/', createCampaign);
router.get('/', getCampaigns);

export default router;
