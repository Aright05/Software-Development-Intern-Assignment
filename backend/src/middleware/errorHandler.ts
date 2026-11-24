import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError | ZodError | Prisma.PrismaClientKnownRequestError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  // 1. Handle Zod validation errors (400 Bad Request)
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: formattedErrors,
      },
    });
    return;
  }

  // 2. Handle Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: Unique constraint failed
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: `A record with the specified unique field (${target.join(', ')}) already exists.`,
          details: err.meta,
        },
      });
      return;
    }

    // P2025: Record not found
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource could not be found.',
        },
      });
      return;
    }

    // P2003: Foreign key constraint failed
    if (err.code === 'P2003') {
      res.status(400).json({
        success: false,
        error: {
          code: 'FOREIGN_KEY_VIOLATION',
          message: 'Referenced related record does not exist or cannot be modified.',
        },
      });
      return;
    }
  }

  // 3. Handle AppError (explicitly thrown operational errors)
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || 'Internal Server Error';

  logger.error(`Error processing ${req.method} ${req.originalUrl}: ${message}`, 'ErrorHandler', {
    statusCode,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    details: err instanceof AppError ? err.details : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      ...(err instanceof AppError && err.details ? { details: err.details } : {}),
    },
  });
};
