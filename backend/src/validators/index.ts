import { z } from 'zod';

// Pagination and common filtering query schema
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  campaignId: z.string().uuid().optional(),
  senderId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// Sender validation schema
export const createSenderSchema = z.object({
  email: z.string().trim().email('Invalid sender email address'),
  name: z.string().trim().min(1, 'Display name is required').max(100),
  smtpHost: z.string().trim().min(1, 'SMTP host is required'),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(587),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().optional(),
  smtpPass: z.string().optional(),
  isActive: z.boolean().default(true),
});

// Email recipient schema (supports simple string email or object with name)
export const recipientItemSchema = z.union([
  z.string().trim().email('Invalid recipient email address'),
  z.object({
    email: z.string().trim().email('Invalid recipient email address'),
    name: z.string().trim().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
]);

// Email Campaign creation schema
export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200).optional().default('Untitled Campaign'),
  subject: z.string().trim().min(1, 'Email subject is required').max(300),
  body: z.string().trim().min(1, 'Email body is required'),
  senderId: z.string().uuid('Valid senderId is required'),
  startTime: z.string().datetime().optional(),
  delayBetweenEmails: z.coerce.number().int().min(0).default(0), // Delay in seconds between consecutive emails
  hourlyLimit: z.coerce.number().int().positive().max(10000).default(100),
  recipients: z.array(recipientItemSchema).min(1, 'At least one recipient is required'),
});

// UUID path parameter schema
export const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid ID parameter format. Must be a valid UUID.'),
});

// Phase 4 Test Email schema
export const sendTestEmailSchema = z.object({
  recipient: z.string().trim().email('Invalid recipient email address').optional(),
  subject: z.string().trim().min(1).max(200).optional().default('ReachInbox Test Email - Ethereal SMTP'),
  body: z.string().trim().min(1).optional().default('<h3>ReachInbox Ethereal SMTP Test</h3><p>This is a verification email dispatched via Nodemailer and Ethereal Email.</p>'),
  senderId: z.string().uuid().optional(),
});

// Phase 7 Elasticsearch Search schema
export const searchEmailQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  senderId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// Inferred TypeScript types
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateSenderDto = z.infer<typeof createSenderSchema>;
export type CreateCampaignDto = z.infer<typeof createCampaignSchema>;
export type RecipientItem = z.infer<typeof recipientItemSchema>;
export type SendTestEmailDto = z.infer<typeof sendTestEmailSchema>;
