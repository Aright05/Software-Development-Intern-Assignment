import request from 'supertest';
import { createApp } from '../app';
import { prisma } from '../services/prismaService';
import { schedulerService } from '../services/schedulerService';
import { emailService } from '../services/emailService';
import { CampaignStatus, EmailStatus } from '@prisma/client';

// Simple lightweight assertion runner
let passed = 0;
let failed = 0;

const assert = (condition: boolean, testName: string, detail?: unknown) => {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}`, detail || '');
    failed++;
  }
};

async function runTests() {
  console.log('\n--- Running ReachInbox Backend API Test Suite ---\n');
  const app = createApp();

  // Test 1: Health Check Endpoint
  {
    console.log('[1] Health Check:');
    const res = await request(app).get('/api/health');
    assert(res.status === 200, 'GET /api/health returns 200 OK');
    assert(res.body.status === 'healthy', 'Health status is "healthy"');
  }

  // Test 2: Validation on POST /api/senders
  {
    console.log('\n[2] Sender Validation:');
    const invalidSenderRes = await request(app)
      .post('/api/senders')
      .send({
        email: 'not-an-email',
        name: '',
      });
    assert(invalidSenderRes.status === 400, 'POST /api/senders rejects invalid email with 400 Bad Request');
    assert(invalidSenderRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
    assert(Array.isArray(invalidSenderRes.body.error.details), 'Error response includes detailed field errors');
  }

  // Test 3: Validation on POST /api/campaigns
  {
    console.log('\n[3] Campaign Validation:');
    const invalidCampaignRes = await request(app)
      .post('/api/campaigns')
      .send({
        subject: '',
        body: '',
        senderId: 'not-a-uuid',
        recipients: [],
      });
    assert(invalidCampaignRes.status === 400, 'POST /api/campaigns rejects empty payload with 400 Bad Request');
    assert(invalidCampaignRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
  }

  // Test 4: UUID Validation on GET /api/emails/:id
  {
    console.log('\n[4] Email ID Parameter Validation:');
    const invalidIdRes = await request(app).get('/api/emails/123-not-a-uuid');
    assert(invalidIdRes.status === 400, 'GET /api/emails/:id rejects non-UUID with 400 Bad Request');
    assert(invalidIdRes.body.error.code === 'VALIDATION_ERROR', 'Error code is VALIDATION_ERROR');
  }

  // Test 5: Pagination Query Validation
  {
    console.log('\n[5] Pagination Query Validation:');
    const invalidPageRes = await request(app).get('/api/emails/scheduled?page=-5&limit=500');
    assert(invalidPageRes.status === 400, 'GET /api/emails/scheduled rejects negative page/limit with 400 Bad Request');
  }

  // Test 5.1: Test-Send Endpoint Validation
  {
    console.log('\n[5.1] Test-Send Email Endpoint Validation:');
    const invalidRecipientRes = await request(app)
      .post('/api/emails/test-send')
      .send({ recipient: 'invalid-email-format' });
    assert(invalidRecipientRes.status === 400, 'POST /api/emails/test-send rejects invalid recipient email with 400 Bad Request');
  }

  // Test 6: Mocked Database Operations (Testing Controllers, Services & Isolation)
  {
    console.log('\n[6] Mocked Database Integration & User Isolation:');

    // Mock Prisma Methods
    const originalUpsert = prisma.user.upsert;
    const originalSenderFindUnique = prisma.sender.findUnique;
    const originalSenderCreate = prisma.sender.create;
    const originalSenderFindMany = prisma.sender.findMany;
    const originalSenderFindFirst = prisma.sender.findFirst;
    const originalTransaction = prisma.$transaction;
    const originalCampaignCount = prisma.emailCampaign.count;
    const originalCampaignFindMany = prisma.emailCampaign.findMany;
    const originalEmailCount = prisma.scheduledEmail.count;
    const originalEmailFindMany = prisma.scheduledEmail.findMany;
    const originalEmailFindFirst = prisma.scheduledEmail.findFirst;
    const originalScheduleBatch = schedulerService.scheduleBatch;

    try {
      // Setup Mock User
      prisma.user.upsert = (async () => ({
        id: 'test-user-id',
        email: 'test@reachinbox.ai',
        googleId: null,
        name: 'Test User',
        avatar: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any;

      // Mock schedulerService to prevent waiting on Redis in API unit tests
      schedulerService.scheduleBatch = (async () => 3) as any;

      // Mock POST /api/senders
      prisma.sender.findUnique = (async () => null) as any;
      prisma.sender.create = (async ({ data }: any) => ({
        id: '11111111-1111-1111-1111-111111111111',
        userId: data.userId,
        email: data.email,
        name: data.name,
        smtpHost: data.smtpHost,
        smtpPort: data.smtpPort,
        smtpSecure: data.smtpSecure,
        smtpUser: data.smtpUser,
        isActive: data.isActive,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) as any;

      const createSenderRes = await request(app)
        .post('/api/senders')
        .set('x-user-id', 'test-user-id')
        .send({
          email: 'sender@reachinbox.ai',
          name: 'Primary Sender',
          smtpHost: 'smtp.ethereal.email',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'ethereal_user',
          smtpPass: 'ethereal_pass',
          isActive: true,
        });

      assert(createSenderRes.status === 201, 'POST /api/senders returns 201 Created');
      assert(createSenderRes.body.success === true, 'Response body success is true');
      assert(createSenderRes.body.data.email === 'sender@reachinbox.ai', 'Created sender email matches');

      // Mock GET /api/senders
      prisma.sender.findMany = (async ({ where }: any) => [
        {
          id: '11111111-1111-1111-1111-111111111111',
          userId: where.userId,
          email: 'sender@reachinbox.ai',
          name: 'Primary Sender',
          smtpHost: 'smtp.ethereal.email',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: 'ethereal_user',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { scheduledEmails: 5 },
        },
      ]) as any;

      const getSendersRes = await request(app)
        .get('/api/senders')
        .set('x-user-id', 'test-user-id');

      assert(getSendersRes.status === 200, 'GET /api/senders returns 200 OK');
      assert(getSendersRes.body.data.length === 1, 'Returns list of senders for user');
      assert(getSendersRes.body.data[0].userId === 'test-user-id', 'User data is isolated to test-user-id');

      // Mock POST /api/campaigns
      prisma.sender.findFirst = (async () => ({
        id: '11111111-1111-1111-1111-111111111111',
        userId: 'test-user-id',
        email: 'sender@reachinbox.ai',
        name: 'Primary Sender',
        isActive: true,
      })) as any;

      prisma.$transaction = (async (fn: any) => {
        const mockTx = {
          user: { upsert: async () => ({}) },
          emailCampaign: {
            create: async ({ data }: any) => ({
              id: '22222222-2222-2222-2222-222222222222',
              ...data,
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
          },
          scheduledEmail: {
            createMany: async ({ data }: any) => ({ count: data.length }),
          },
        };
        return fn(mockTx);
      }) as any;

      const createCampaignRes = await request(app)
        .post('/api/campaigns')
        .set('x-user-id', 'test-user-id')
        .send({
          name: 'Q1 Product Launch',
          subject: 'Special Early Access to ReachInbox',
          body: '<p>Welcome to ReachInbox Scheduler!</p>',
          senderId: '11111111-1111-1111-1111-111111111111',
          delayBetweenEmails: 5,
          hourlyLimit: 50,
          recipients: [
            'lead1@example.com',
            'lead2@example.com',
            { email: 'lead3@example.com', name: 'Lead Three' },
          ],
        });

      assert(createCampaignRes.status === 201, 'POST /api/campaigns returns 201 Created');
      assert(createCampaignRes.body.data.totalScheduled === 3, 'Transaction scheduled 3 recipient emails');
      assert(createCampaignRes.body.data.campaign.status === CampaignStatus.SCHEDULED, 'Campaign status is SCHEDULED');

      // Mock GET /api/campaigns
      prisma.emailCampaign.count = (async () => 1) as any;
      prisma.emailCampaign.findMany = (async () => [
        {
          id: '22222222-2222-2222-2222-222222222222',
          userId: 'test-user-id',
          name: 'Q1 Product Launch',
          subject: 'Special Early Access',
          status: CampaignStatus.SCHEDULED,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: { emails: 3 },
        },
      ]) as any;

      const getCampaignsRes = await request(app)
        .get('/api/campaigns?page=1&limit=10')
        .set('x-user-id', 'test-user-id');

      assert(getCampaignsRes.status === 200, 'GET /api/campaigns returns 200 OK');
      assert(getCampaignsRes.body.pagination.total === 1, 'Pagination total count matches');
      assert(getCampaignsRes.body.data[0].name === 'Q1 Product Launch', 'Campaign name matches');

      // Mock GET /api/emails/scheduled
      prisma.scheduledEmail.count = (async () => 3) as any;
      prisma.scheduledEmail.findMany = (async () => [
        {
          id: '33333333-3333-3333-3333-333333333333',
          userId: 'test-user-id',
          recipient: 'lead1@example.com',
          subject: 'Special Early Access',
          status: EmailStatus.SCHEDULED,
          scheduledAt: new Date(),
          sender: { id: '11111111-1111-1111-1111-111111111111', email: 'sender@reachinbox.ai', name: 'Primary' },
          campaign: { id: '22222222-2222-2222-2222-222222222222', name: 'Q1 Launch', subject: 'Special' },
        },
      ]) as any;

      const getScheduledRes = await request(app)
        .get('/api/emails/scheduled')
        .set('x-user-id', 'test-user-id');

      assert(getScheduledRes.status === 200, 'GET /api/emails/scheduled returns 200 OK');
      assert(getScheduledRes.body.data[0].status === 'SCHEDULED', 'Email status is SCHEDULED');

      // Mock GET /api/emails/sent
      prisma.scheduledEmail.count = (async () => 1) as any;
      prisma.scheduledEmail.findMany = (async () => [
        {
          id: '44444444-4444-4444-4444-444444444444',
          userId: 'test-user-id',
          recipient: 'delivered@example.com',
          subject: 'Welcome',
          status: EmailStatus.SENT,
          sentAt: new Date(),
          sender: { id: '11111111-1111-1111-1111-111111111111', email: 'sender@reachinbox.ai', name: 'Primary' },
          campaign: null,
        },
      ]) as any;

      const getSentRes = await request(app)
        .get('/api/emails/sent')
        .set('x-user-id', 'test-user-id');

      assert(getSentRes.status === 200, 'GET /api/emails/sent returns 200 OK');
      assert(getSentRes.body.data[0].status === 'SENT', 'Sent email status is SENT');

      // Mock GET /api/emails/:id (Found)
      prisma.scheduledEmail.findFirst = (async ({ where }: any) => {
        if (where.id === '33333333-3333-3333-3333-333333333333' && where.userId === 'test-user-id') {
          return {
            id: '33333333-3333-3333-3333-333333333333',
            userId: 'test-user-id',
            recipient: 'lead1@example.com',
            subject: 'Special Early Access',
            body: '<p>Content</p>',
            status: EmailStatus.SCHEDULED,
            scheduledAt: new Date(),
            sender: { id: '11111111-1111-1111-1111-111111111111', email: 'sender@reachinbox.ai', name: 'Primary' },
            campaign: { id: '22222222-2222-2222-2222-222222222222', name: 'Q1 Launch', subject: 'Special' },
          };
        }
        return null;
      }) as any;

      const getEmailRes = await request(app)
        .get('/api/emails/33333333-3333-3333-3333-333333333333')
        .set('x-user-id', 'test-user-id');

      assert(getEmailRes.status === 200, 'GET /api/emails/:id returns 200 OK');
      assert(getEmailRes.body.data.id === '33333333-3333-3333-3333-333333333333', 'Fetched email ID matches');

      // Mock GET /api/emails/:id (Not Found for different user - Isolation)
      const getEmailIsolatedRes = await request(app)
        .get('/api/emails/33333333-3333-3333-3333-333333333333')
        .set('x-user-id', 'different-tenant-user');

      assert(getEmailIsolatedRes.status === 404, 'GET /api/emails/:id returns 404 for unauthorized tenant (data isolation)');
      assert(getEmailIsolatedRes.body.error.message.includes('not found'), 'Response message indicates not found');

      // Mock POST /api/emails/test-send
      const originalSendWithSender = emailService.sendWithSender;
      emailService.sendWithSender = (async () => ({
        success: true,
        messageId: '<test-msg-001@reachinbox.ai>',
        previewUrl: 'https://ethereal.email/message/test-preview-url',
        accepted: ['test@example.com'],
        rejected: [],
        response: '250 Message accepted',
        timestamp: new Date().toISOString(),
      })) as any;

      const testSendRes = await request(app)
        .post('/api/emails/test-send')
        .set('x-user-id', 'test-user-id')
        .send({
          recipient: 'test@example.com',
          subject: 'Sample Subject',
          body: '<p>Sample Body</p>',
        });

      assert(testSendRes.status === 200, 'POST /api/emails/test-send returns 200 OK');
      assert(testSendRes.body.data.previewUrl.includes('ethereal.email'), 'Test email returns Ethereal preview URL');
      emailService.sendWithSender = originalSendWithSender;

    } finally {
      // Restore original methods
      prisma.user.upsert = originalUpsert;
      prisma.sender.findUnique = originalSenderFindUnique;
      prisma.sender.create = originalSenderCreate;
      prisma.sender.findMany = originalSenderFindMany;
      prisma.sender.findFirst = originalSenderFindFirst;
      prisma.$transaction = originalTransaction;
      prisma.emailCampaign.count = originalCampaignCount;
      prisma.emailCampaign.findMany = originalCampaignFindMany;
      prisma.scheduledEmail.count = originalEmailCount;
      prisma.scheduledEmail.findMany = originalEmailFindMany;
      prisma.scheduledEmail.findFirst = originalEmailFindFirst;
      schedulerService.scheduleBatch = originalScheduleBatch;
    }
  }

  console.log(`\n--- Test Results: ${passed} passed, ${failed} failed ---\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
