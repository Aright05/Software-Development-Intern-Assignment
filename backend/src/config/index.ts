import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/reachinbox_scheduler?schema=public'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  EMAIL_QUEUE_NAME: z.string().default('email-scheduling-queue'),

  WORKER_CONCURRENCY: z.coerce.number().default(5),
  MAX_EMAILS_PER_SECOND: z.coerce.number().default(2),
  RATE_LIMIT_DURATION_MS: z.coerce.number().default(1000),

  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().default(100),

  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('reachinbox_emails'),

  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  FROM_EMAIL: z.string().default('ReachInbox Scheduler <scheduler@reachinbox.ai>'),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_CALLBACK_URL: z.string().default('http://localhost:5000/api/v1/auth/google/callback'),

  SLACK_CLIENT_ID: z.string().optional().default(''),
  SLACK_CLIENT_SECRET: z.string().optional().default(''),
  SLACK_SIGNING_SECRET: z.string().optional().default(''),
  SLACK_BOT_TOKEN: z.string().optional().default(''),
  SLACK_WEBHOOK_URL: z.string().optional().default(''),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:5000/api/slack/callback'),

  SESSION_SECRET: z.string().default('reachinbox-jwt-session-secret-encryption-key-2026'),
  ENCRYPTION_KEY: z.string().default('reachinbox-aes-token-encryption-key-32b'),

  BULL_BOARD_PATH: z.string().default('/admin/queues'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config = {
  port: parsedEnv.data.PORT,
  nodeEnv: parsedEnv.data.NODE_ENV,
  apiPrefix: parsedEnv.data.API_PREFIX,
  frontendUrl: parsedEnv.data.FRONTEND_URL,

  databaseUrl: parsedEnv.data.DATABASE_URL,

  redis: {
    host: parsedEnv.data.REDIS_HOST,
    port: parsedEnv.data.REDIS_PORT,
    password: parsedEnv.data.REDIS_PASSWORD || undefined,
  },

  queue: {
    name: parsedEnv.data.EMAIL_QUEUE_NAME,
    concurrency: parsedEnv.data.WORKER_CONCURRENCY,
    maxEmailsPerSecond: parsedEnv.data.MAX_EMAILS_PER_SECOND,
    rateLimitDurationMs: parsedEnv.data.RATE_LIMIT_DURATION_MS,
  },

  rateLimit: {
    minDelayBetweenEmailsMs: parsedEnv.data.MIN_DELAY_BETWEEN_EMAILS_MS,
    maxEmailsPerHourPerSender: parsedEnv.data.MAX_EMAILS_PER_HOUR_PER_SENDER,
  },

  elasticsearch: {
    node: parsedEnv.data.ELASTICSEARCH_NODE,
    index: parsedEnv.data.ELASTICSEARCH_INDEX,
  },

  smtp: {
    host: parsedEnv.data.SMTP_HOST,
    port: parsedEnv.data.SMTP_PORT,
    secure: parsedEnv.data.SMTP_SECURE,
    user: parsedEnv.data.SMTP_USER,
    pass: parsedEnv.data.SMTP_PASS,
    from: parsedEnv.data.FROM_EMAIL,
  },

  google: {
    clientId: parsedEnv.data.GOOGLE_CLIENT_ID,
    clientSecret: parsedEnv.data.GOOGLE_CLIENT_SECRET,
    callbackUrl: parsedEnv.data.GOOGLE_CALLBACK_URL,
  },

  slack: {
    clientId: parsedEnv.data.SLACK_CLIENT_ID,
    clientSecret: parsedEnv.data.SLACK_CLIENT_SECRET,
    signingSecret: parsedEnv.data.SLACK_SIGNING_SECRET,
    botToken: parsedEnv.data.SLACK_BOT_TOKEN,
    webhookUrl: parsedEnv.data.SLACK_WEBHOOK_URL,
    redirectUri: parsedEnv.data.SLACK_REDIRECT_URI,
  },

  session: {
    secret: parsedEnv.data.SESSION_SECRET,
    cookieName: 'reachinbox_session',
  },

  security: {
    encryptionKey: parsedEnv.data.ENCRYPTION_KEY,
  },

  bullBoard: {
    path: parsedEnv.data.BULL_BOARD_PATH,
  },
} as const;
