import { prisma } from './prismaService';
import { CreateSenderDto } from '../validators';
import { AppError } from '../middleware/errorHandler';

export class SenderService {
  /**
   * Create a new sender identity for an isolated user
   */
  async createSender(userId: string, userEmail: string, data: CreateSenderDto) {
    // 1. Ensure user record exists
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: userEmail,
        name: data.name,
      },
    });

    // 2. Check for duplicate sender email for this user
    const existing = await prisma.sender.findUnique({
      where: {
        userId_email: {
          userId,
          email: data.email.toLowerCase(),
        },
      },
    });

    if (existing) {
      throw new AppError(`A sender with email ${data.email} already exists for your account.`, 409);
    }

    // 3. Create sender record
    const sender = await prisma.sender.create({
      data: {
        userId,
        email: data.email.toLowerCase(),
        name: data.name,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecure: data.smtpSecure,
        smtpUser: data.smtpUser,
        smtpPass: data.smtpPass, // In production, will be encrypted via KMS/AES
        isActive: data.isActive,
      },
      select: {
        id: true,
        userId: true,
        email: true,
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return sender;
  }

  /**
   * Retrieve all senders for a specific user
   */
  async getSenders(userId: string) {
    return prisma.sender.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        email: true,
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            scheduledEmails: true,
          },
        },
      },
    });
  }
}

export const senderService = new SenderService();
