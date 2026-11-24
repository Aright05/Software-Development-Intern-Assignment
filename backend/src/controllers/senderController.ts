import { Request, Response, NextFunction } from 'express';
import { senderService } from '../services/senderService';
import { createSenderSchema } from '../validators';

export const createSender = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validatedData = createSenderSchema.parse(req.body);
    const userId = req.user!.id;
    const userEmail = req.user!.email;

    const sender = await senderService.createSender(userId, userEmail, validatedData);

    res.status(201).json({
      success: true,
      data: sender,
    });
  } catch (error) {
    next(error);
  }
};

export const getSenders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const senders = await senderService.getSenders(userId);

    res.status(200).json({
      success: true,
      data: senders,
    });
  } catch (error) {
    next(error);
  }
};
