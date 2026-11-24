import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // Prevent multiple Prisma instances in development hot-reloading
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma = global.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection established successfully', 'Prisma');
    return true;
  } catch (error) {
    logger.warn('Database is currently unreachable or not initialized', 'Prisma', error);
    return false;
  }
};
