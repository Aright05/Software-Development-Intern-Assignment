import { Request, Response, NextFunction } from 'express';
import { campaignService } from '../services/campaignService';
import { createCampaignSchema, paginationQuerySchema } from '../validators';

export const createCampaign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createCampaignSchema.parse(req.body);
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    const result = await campaignService.createCampaign(userId, userEmail, validatedData);

    res.status(201).json({
      success: true,
      message: `Campaign created successfully with ${result.totalScheduled} scheduled emails.`,
      data: {
        campaign: result.campaign,
        totalScheduled: result.totalScheduled,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCampaigns = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const result = await campaignService.getCampaigns(userId, query);

    res.status(200).json({
      success: true,
      data: result.campaigns,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};
