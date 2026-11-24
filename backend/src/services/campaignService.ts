import { randomUUID } from 'crypto';
import { prisma } from './prismaService';
import { CreateCampaignDto, PaginationQuery } from '../validators';
import { AppError } from '../middleware/errorHandler';
import { CampaignStatus, EmailStatus, Prisma } from '@prisma/client';
import { schedulerService } from './schedulerService';
import { elasticsearchService, EmailDocument } from './elasticsearchService';

export class CampaignService {
  /**
   * Create an email campaign and atomically generate scheduled email jobs via Prisma transaction
   */
  async createCampaign(userId: string, userEmail: string, data: CreateCampaignDto) {
    // 1. Validate that the specified sender exists, is active, and belongs to this user
    const sender = await prisma.sender.findFirst({
      where: {
        id: data.senderId,
        userId,
      },
    });

    if (!sender) {
      throw new AppError('Sender account not found or does not belong to you.', 404);
    }

    if (!sender.isActive) {
      throw new AppError('The specified sender account is inactive.', 400);
    }

    const baseStartTime = data.startTime ? new Date(data.startTime) : new Date();
    const delayMs = (data.delayBetweenEmails || 0) * 1000;

    // 2. Prepare recipient list and calculate scheduled times
    const recipients = data.recipients.map((item, index) => {
      const email = typeof item === 'string' ? item : item.email;
      const metadata = typeof item === 'object' && item.metadata ? item.metadata : undefined;
      const scheduledAt = new Date(baseStartTime.getTime() + index * delayMs);
      const idempotencyKey = `email_${userId}_${randomUUID()}`;

      return {
        recipient: email.toLowerCase(),
        metadata,
        scheduledAt,
        idempotencyKey,
      };
    });

    // 3. Execute atomic transaction: upsert user, create campaign, create scheduled emails
    const result = await prisma.$transaction(async (tx) => {
      // Ensure user exists
      await tx.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: userEmail,
        },
      });

      // Create campaign
      const campaign = await tx.emailCampaign.create({
        data: {
          userId,
          name: data.name || 'Untitled Campaign',
          subject: data.subject,
          body: data.body,
          startTime: baseStartTime,
          delayBetweenEmails: data.delayBetweenEmails,
          hourlyLimit: data.hourlyLimit,
          status: CampaignStatus.SCHEDULED,
        },
      });

      // Create all ScheduledEmail rows for this campaign
      const emailsData: Prisma.ScheduledEmailCreateManyInput[] = recipients.map((r) => ({
        id: randomUUID(),
        userId,
        campaignId: campaign.id,
        senderId: sender.id,
        recipient: r.recipient,
        subject: data.subject,
        body: data.body,
        scheduledAt: r.scheduledAt,
        status: EmailStatus.SCHEDULED,
        idempotencyKey: r.idempotencyKey,
        metadata: r.metadata ? (r.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      }));

      await tx.scheduledEmail.createMany({
        data: emailsData,
      });

      return {
        campaign,
        emails: emailsData,
        totalScheduled: emailsData.length,
      };
    });

    // 4. Bulk enqueue scheduled jobs into BullMQ with deterministic job IDs and delays
    try {
      await schedulerService.scheduleBatch(result.emails as any);
    } catch (queueErr) {
      // In case Redis is unreachable during creation, the database records remain safely in SCHEDULED status
      // and will be automatically enqueued upon Redis reconnect or worker reconciliation.
    }

    // 5. Asynchronously synchronize newly created emails with Elasticsearch (Non-blocking)
    const elasticDocs: EmailDocument[] = (result.emails as any[]).map((e) => ({
      emailId: e.id,
      userId: e.userId,
      campaignId: e.campaignId,
      senderId: e.senderId,
      senderName: sender.name,
      senderEmail: sender.email,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      status: e.status,
      scheduledAt: new Date(e.scheduledAt).toISOString(),
      idempotencyKey: e.idempotencyKey,
      createdAt: new Date().toISOString(),
    }));

    elasticsearchService.bulkIndexEmails(elasticDocs).catch(() => {});

    return {
      campaign: result.campaign,
      totalScheduled: result.totalScheduled,
    };
  }

  /**
   * Retrieve paginated campaigns for a user
   */
  async getCampaigns(userId: string, query: PaginationQuery) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.EmailCampaignWhereInput = {
      userId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { subject: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            startTime: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, campaigns] = await Promise.all([
      prisma.emailCampaign.count({ where }),
      prisma.emailCampaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { emails: true },
          },
        },
      }),
    ]);

    return {
      campaigns,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}

export const campaignService = new CampaignService();
