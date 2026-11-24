import { Request, Response, NextFunction } from 'express';
import { emailJobService } from '../services/emailJobService';
import { emailService } from '../services/emailService';
import { elasticsearchService } from '../services/elasticsearchService';
import { prisma } from '../services/prismaService';
import { paginationQuerySchema, uuidParamSchema, sendTestEmailSchema, searchEmailQuerySchema } from '../validators';
import { AppError } from '../middleware/errorHandler';

export const getScheduledEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const result = await emailJobService.getScheduledEmails(userId, query);

    res.status(200).json({
      success: true,
      data: result.emails,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getSentEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = paginationQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const result = await emailJobService.getSentEmails(userId, query);

    res.status(200).json({
      success: true,
      data: result.emails,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmailById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = uuidParamSchema.parse(req.params);
    const userId = req.user!.id;

    const email = await emailJobService.getEmailById(userId, id);

    res.status(200).json({
      success: true,
      data: email,
    });
  } catch (error) {
    next(error);
  }
};

export const getEmailStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const stats = await emailJobService.getEmailStats(userId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

export const sendTestEmail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const validated = sendTestEmailSchema.parse(req.body);
    const userId = req.user!.id;

    let sender = null;
    if (validated.senderId) {
      sender = await prisma.sender.findFirst({
        where: { id: validated.senderId, userId },
      });
      if (!sender) {
        throw new AppError('The specified sender account was not found.', 404);
      }
    } else {
      sender = await prisma.sender.findFirst({
        where: { userId, isActive: true },
      });
    }

    const recipient = validated.recipient || 'ethereal.test@reachinbox.ai';

    const result = await emailService.sendWithSender(sender, {
      to: recipient,
      subject: validated.subject,
      html: validated.body,
    });

    res.status(200).json({
      success: true,
      message: 'Test email successfully dispatched via SMTP transport.',
      data: {
        messageId: result.messageId,
        previewUrl: result.previewUrl,
        recipient,
        sender: sender ? { id: sender.id, email: sender.email, name: sender.name } : 'System Default Ethereal',
        dispatchedAt: result.timestamp,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const searchEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const params = searchEmailQuerySchema.parse(req.query);
    const userId = req.user!.id;

    const result = await elasticsearchService.searchEmails(userId, params);

    res.status(200).json({
      success: true,
      data: result.hits,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
      source: result.source,
    });
  } catch (error) {
    next(error);
  }
};

export const reindexEmails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await elasticsearchService.reindexAll(userId);

    res.status(200).json({
      success: true,
      message: `Reindexed ${result.totalIndexed} emails successfully into Elasticsearch.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
