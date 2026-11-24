export type EmailStatus = 'PENDING' | 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Sender {
  id: string;
  userId: string;
  email: string;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    scheduledEmails: number;
  };
}

export interface ScheduledEmail {
  id: string;
  campaignId?: string | null;
  senderId?: string | null;
  userId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: EmailStatus;
  attempts?: number;
  maxAttempts?: number;
  bullJobId?: string | null;
  idempotencyKey: string;
  errorMessage?: string | null;
  metadata?: any;
  sender?: {
    id: string;
    email: string;
    name: string;
    smtpHost?: string;
    smtpPort?: number;
  } | null;
  campaign?: {
    id: string;
    name: string;
    subject: string;
    delayBetweenEmails?: number;
    hourlyLimit?: number;
    status?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaign {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  startTime: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    emails: number;
  };
}

export interface SlackStatus {
  connected: boolean;
  teamId?: string | null;
  teamName?: string | null;
  connectedAt?: string | null;
  authedUser?: string | null;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: PaginationMeta;
  source?: string;
}

export interface EmailStats {
  SCHEDULED: number;
  PENDING: number;
  PROCESSING: number;
  SENT: number;
  FAILED: number;
  TOTAL: number;
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptime: number;
  environment: string;
  dependencies?: {
    database: string;
    redis: string;
    elasticsearch: string;
  };
}

export interface ParsedRecipient {
  id: string;
  email: string;
  name?: string;
  valid: boolean;
  error?: string;
}

export interface CsvParseResult {
  recipients: ParsedRecipient[];
  validRecipients: ParsedRecipient[];
  invalidCount: number;
  duplicateCount: number;
  totalParsed: number;
}

export interface CreateCampaignPayload {
  name?: string;
  subject: string;
  body: string;
  senderId: string;
  startTime?: string;
  delayBetweenEmails: number;
  hourlyLimit: number;
  recipients: { email: string; name?: string }[];
}

export interface CreateSenderPayload {
  email: string;
  name: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser?: string;
  smtpPass?: string;
  isActive?: boolean;
}

export interface TestEmailPayload {
  recipient?: string;
  subject?: string;
  body?: string;
  senderId?: string;
}
