import { Router } from 'express';
import healthRoutes from './healthRoutes';
import authRoutes from './authRoutes';
import slackRoutes from './slackRoutes';
import senderRoutes from './senderRoutes';
import campaignRoutes from './campaignRoutes';
import emailRoutes from './emailRoutes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/slack', slackRoutes);
router.use('/senders', senderRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/emails', emailRoutes);

export default router;
