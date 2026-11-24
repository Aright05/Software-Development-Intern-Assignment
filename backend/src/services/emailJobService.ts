import { prisma } from './prismaService';
import { PaginationQuery } from '../validators';
import { AppError } from '../middleware/errorHandler';
import { EmailStatus, Prisma } from '@prisma/client';

export class EmailJobService {
  /**
   * Get scheduled emails for a user with pagination and filtering
   */
  async getScheduledEmails(userId: string, query: PaginationQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ScheduledEmailWhereInput = {
      userId,
      status: { in: [EmailStatus.SCHEDULED, EmailStatus.PENDING, EmailStatus.PROCESSING] },
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.senderId ? { senderId: query.senderId } : {}),
      ...(query.search
        ? {
            OR: [
              { recipient: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            scheduledAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, emails] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
              subject: true,
            },
          },
        },
      }),
    ]);

    return {
      emails,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get sent emails for a user with pagination and filtering
   */
  async getSentEmails(userId: string, query: PaginationQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ScheduledEmailWhereInput = {
      userId,
      status: EmailStatus.SENT,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      ...(query.senderId ? { senderId: query.senderId } : {}),
      ...(query.search
        ? {
            OR: [
              { recipient: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            sentAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, emails] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          campaign: {
            select: {
              id: true,
              name: true,
              subject: true,
            },
          },
        },
      }),
    ]);

    return {
      emails,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single email by ID with strict tenant isolation
   */
  async getEmailById(userId: string, emailId: string) {
    const email = await prisma.scheduledEmail.findFirst({
      where: {
        id: emailId,
        userId,
      },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            name: true,
            smtpHost: true,
            smtpPort: true,
          },
        },
        campaign: {
          select: {
            id: true,
            name: true,
            subject: true,
            delayBetweenEmails: true,
            hourlyLimit: true,
            status: true,
          },
        },
      },
    });

    if (!email) {
      throw new AppError(`Email with ID ${emailId} was not found.`, 404);
    }

    return email;
  }

  /**
   * Get aggregated email status counts for the dashboard
   */
  async getEmailStats(userId: string) {
    const counts = await prisma.scheduledEmail.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });

    const stats: Record<string, number> = {
      SCHEDULED: 0,
      PENDING: 0,
      PROCESSING: 0,
      SENT: 0,
      FAILED: 0,
      TOTAL: 0,
    };

    counts.forEach((c) => {
      stats[c.status] = c._count._all;
      stats.TOTAL += c._count._all;
    });

    return stats;
  }
}

export const emailJobService = new EmailJobService();
