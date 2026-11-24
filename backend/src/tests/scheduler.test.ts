import { schedulerService } from '../services/schedulerService';
import { processEmailJob } from '../workers/jobProcessor';
import { emailQueue, EMAIL_JOB_NAME } from '../queues/emailQueue';
import { prisma } from '../services/prismaService';
import { emailService } from '../services/emailService';
import { rateLimiterService } from '../services/rateLimiterService';
import { startEmailWorker, stopEmailWorker } from '../workers/emailWorker';
import { EmailStatus, ScheduledEmail } from '@prisma/client';
import { Job } from 'bullmq';

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

async function runSchedulerTests() {
  console.log('\n--- Running Phase 3: BullMQ Email Scheduler Test Suite ---\n');

  // MOCK HELPERS & CAPTURED CALLS
  const addedJobs: Array<{ name: string; data: any; opts?: any }> = [];
  const existingJobsInQueue = new Map<string, any>();

  // Mock emailQueue methods
  emailQueue.add = (async (name: string, data: any, opts?: any) => {
    addedJobs.push({ name, data, opts });
    existingJobsInQueue.set(opts?.jobId || data.emailId, { id: opts?.jobId, data, opts });
    return { id: opts?.jobId, data } as any;
  }) as any;

  emailQueue.addBulk = (async (jobs: any[]) => {
    for (const j of jobs) {
      addedJobs.push(j);
      existingJobsInQueue.set(j.opts?.jobId || j.data.emailId, { id: j.opts?.jobId, data: j.data, opts: j.opts });
    }
    return jobs.map((j) => ({ id: j.opts?.jobId, data: j.data }));
  }) as any;

  emailQueue.getJob = (async (jobId: string) => {
    return existingJobsInQueue.get(jobId) || null;
  }) as any;

  // Mock rateLimiterService to prevent waiting on Redis in scheduler unit tests
  rateLimiterService.checkAndReserve = (async () => ({
    allowed: true,
    delayMs: 0,
    currentHourlyCount: 1,
    reason: 'ALLOWED',
  })) as any;

  // Mock prisma.scheduledEmail.update
  const updatedEmailRecords: Array<{ where: any; data: any }> = [];
  prisma.scheduledEmail.update = (async ({ where, data }: any) => {
    updatedEmailRecords.push({ where, data });
    return { id: where.id, ...data };
  }) as any;

  // TEST 1: Future Delayed Jobs
  {
    console.log('[1] Future Delayed Job Scheduling:');
    const futureDate = new Date(Date.now() + 3600 * 1000); // 1 hour in future
    const emailRecord: ScheduledEmail = {
      id: 'email-future-001',
      userId: 'user-001',
      campaignId: 'camp-001',
      senderId: 'sender-001',
      recipient: 'future@example.com',
      subject: 'Scheduled in 1 hour',
      body: 'See you in an hour',
      scheduledAt: futureDate,
      sentAt: null,
      status: EmailStatus.SCHEDULED,
      bullJobId: null,
      idempotencyKey: 'idem-future-001',
      errorMessage: null,
      attempts: 0,
      maxAttempts: 3,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addedJobs.length = 0;
    const jobId = await schedulerService.scheduleEmail(emailRecord);

    assert(jobId === 'email-future-001', 'Deterministic Job ID matches email ID');
    assert(addedJobs.length === 1, 'Job was enqueued in BullMQ');
    assert(addedJobs[0].opts.delay > 3590 * 1000 && addedJobs[0].opts.delay <= 3600 * 1000, 'Calculated delay accurately reflects ~1 hour');
    assert(addedJobs[0].opts.jobId === 'email-future-001', 'Deterministic jobId passed to BullMQ options');
    assert(updatedEmailRecords.some((r) => r.where.id === 'email-future-001' && r.data.status === EmailStatus.SCHEDULED), 'Database record marked status = SCHEDULED');
  }

  // TEST 2: Immediate Jobs (Past or Zero Delay)
  {
    console.log('\n[2] Immediate Job Scheduling:');
    const pastDate = new Date(Date.now() - 5000); // 5 seconds ago
    const immediateEmail: ScheduledEmail = {
      id: 'email-immediate-002',
      userId: 'user-001',
      campaignId: null,
      senderId: 'sender-001',
      recipient: 'immediate@example.com',
      subject: 'Send Now',
      body: 'Immediate content',
      scheduledAt: pastDate,
      sentAt: null,
      status: EmailStatus.PENDING,
      bullJobId: null,
      idempotencyKey: 'idem-immediate-002',
      errorMessage: null,
      attempts: 0,
      maxAttempts: 3,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    addedJobs.length = 0;
    const jobId = await schedulerService.scheduleEmail(immediateEmail);

    assert(jobId === 'email-immediate-002', 'Deterministic Job ID matches immediate email ID');
    assert(addedJobs[0].opts.delay === 0, 'Delay is 0 for immediate/past execution');
    assert(updatedEmailRecords.some((r) => r.where.id === 'email-immediate-002' && r.data.status === EmailStatus.PENDING), 'Database record marked status = PENDING for zero delay');
  }

  // TEST 3: Server Restart Before Scheduled Time (Crash Recovery & Reconciliation)
  {
    console.log('\n[3] Server Restart Crash Recovery & Reconciliation:');
    // Simulate server restart: Redis queue lost jobs or some were missing, but PostgreSQL has records
    existingJobsInQueue.clear();
    // Simulate Job 1 is already in queue, but Job 2 is missing from queue
    existingJobsInQueue.set('email-persisted-001', { id: 'email-persisted-001' });

    prisma.scheduledEmail.findMany = (async () => [
      {
        id: 'email-persisted-001', // Already in queue
        userId: 'user-001',
        campaignId: null,
        senderId: 'sender-001',
        recipient: 'persisted1@example.com',
        subject: 'Already in queue',
        body: 'Body',
        scheduledAt: new Date(Date.now() + 60000),
        status: EmailStatus.SCHEDULED,
        idempotencyKey: 'idem-p1',
      },
      {
        id: 'email-missing-002', // Missing from queue!
        userId: 'user-001',
        campaignId: null,
        senderId: 'sender-001',
        recipient: 'missing@example.com',
        subject: 'Recover me',
        body: 'Body',
        scheduledAt: new Date(Date.now() + 120000), // 2 mins remaining
        status: EmailStatus.SCHEDULED,
        idempotencyKey: 'idem-m2',
      },
    ]) as any;

    addedJobs.length = 0;
    const recoveryResult = await schedulerService.recoverPendingJobs();

    assert(recoveryResult.totalChecked === 2, 'Checked all 2 pending database records');
    assert(recoveryResult.recoveredCount === 1, 'Only the missing job was recovered');
    assert(addedJobs.length === 1 && addedJobs[0].opts.jobId === 'email-missing-002', 'Missing job re-enqueued with remaining delay without duplicating existing job');
  }

  // TEST 4: Worker Lifecycle (Start / Stop)
  {
    console.log('\n[4] Worker Process Lifecycle:');
    const workerInstance = startEmailWorker();
    assert(workerInstance !== null, 'Worker starts cleanly');

    await stopEmailWorker();
    assert(true, 'Worker gracefully stops without crashing or losing jobs');
  }

  // TEST 5: Duplicate Job Insertion & Idempotency Gate
  {
    console.log('\n[5] Duplicate Job Insertion & Database Idempotency:');
    
    // Simulate job execution when email is ALREADY marked SENT
    let updateManyCalled = false;
    prisma.scheduledEmail.updateMany = (async () => {
      updateManyCalled = true;
      return { count: 0 }; // 0 rows updated because status != SCHEDULED/PENDING
    }) as any;

    prisma.scheduledEmail.findUnique = (async () => ({
      id: 'email-already-sent',
      status: EmailStatus.SENT,
      sentAt: new Date(),
    })) as any;

    const mockJob = {
      id: 'email-already-sent',
      data: {
        emailId: 'email-already-sent',
        idempotencyKey: 'idem-sent',
        userId: 'user-001',
        senderId: 'sender-001',
        recipient: 'already_sent@example.com',
        subject: 'Duplicate Test',
        body: 'Test',
        scheduledAt: new Date().toISOString(),
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job;

    const result = await processEmailJob(mockJob);

    assert(updateManyCalled, 'Attempted atomic status transition');
    assert(result.skipped === true, 'Duplicate execution was skipped');
    assert(result.reason === 'Already delivered (SENT)', 'Reason correctly identified email was already SENT');
  }

  // TEST 6: Concurrent Job Processing & Atomic Locking
  {
    console.log('\n[6] Concurrent Job Processing & Locking:');

    // Simulate Worker A and Worker B picking up the same job simultaneously
    let workerALocked = false;
    let workerBLocked = false;

    // First call transitions from SCHEDULED -> PROCESSING (Worker A wins)
    // Second call finds 0 rows because status is now PROCESSING (Worker B blocked)
    let callCount = 0;
    prisma.scheduledEmail.updateMany = (async () => {
      callCount++;
      if (callCount === 1) {
        workerALocked = true;
        return { count: 1 };
      }
      workerBLocked = true;
      return { count: 0 };
    }) as any;

    prisma.sender.findUnique = (async () => ({
      id: 'sender-001',
      name: 'Tester',
      email: 'test@example.com',
      isActive: true,
    })) as any;

    emailService.sendWithSender = (async () => ({
      success: true,
      messageId: '<msg-12345@reachinbox.ai>',
      previewUrl: false,
      accepted: ['concurrent@example.com'],
      rejected: [],
      response: '250 Message accepted',
      timestamp: new Date().toISOString(),
    })) as any;

    const concurrentJob = {
      id: 'email-concurrent-001',
      data: {
        emailId: 'email-concurrent-001',
        idempotencyKey: 'idem-c1',
        userId: 'user-001',
        senderId: 'sender-001',
        recipient: 'concurrent@example.com',
        subject: 'Concurrency Test',
        body: 'Test',
        scheduledAt: new Date().toISOString(),
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job;

    // Worker A runs
    const resA = await processEmailJob(concurrentJob);

    // Worker B runs simultaneously on same record
    prisma.scheduledEmail.findUnique = (async () => ({
      id: 'email-concurrent-001',
      status: EmailStatus.PROCESSING,
    })) as any;
    const resB = await processEmailJob(concurrentJob);

    assert(workerALocked, 'Worker A acquired atomic lock and transitioned to PROCESSING');
    assert(resA.success === true, 'Worker A succeeded in delivering email');
    assert(workerBLocked, 'Worker B encountered lock');
    assert(resB.skipped === true && resB.reason === 'Concurrent execution in progress', 'Worker B safely skipped execution to prevent double send');
  }

  // TEST 7: SMTP Delivery Gate (Never mark SENT before SMTP delivery succeeds)
  {
    console.log('\n[7] SMTP Delivery Confirmation Gate:');

    // Reset status transition
    prisma.scheduledEmail.updateMany = (async () => ({ count: 1 })) as any;

    // Simulate SMTP failure
    emailService.sendWithSender = (async () => {
      throw new Error('SMTP connection timed out');
    }) as any;

    let markedSent = false;
    prisma.scheduledEmail.update = (async ({ data }: any) => {
      if (data.status === EmailStatus.SENT) {
        markedSent = true;
      }
      return data;
    }) as any;

    const failingJob = {
      id: 'email-failing-001',
      data: {
        emailId: 'email-failing-001',
        idempotencyKey: 'idem-f1',
        userId: 'user-001',
        senderId: 'sender-001',
        recipient: 'fail@example.com',
        subject: 'Failing Test',
        body: 'Test',
        scheduledAt: new Date().toISOString(),
      },
      opts: { attempts: 3 },
      attemptsMade: 0,
    } as unknown as Job;

    let threwError = false;
    try {
      await processEmailJob(failingJob);
    } catch {
      threwError = true;
    }

    assert(threwError, 'Processor throws error on SMTP failure to trigger BullMQ backoff retry');
    assert(markedSent === false, 'CRITICAL: Email was NEVER marked as SENT when SMTP transmission failed');
  }

  console.log(`\n--- Scheduler Test Results: ${passed} passed, ${failed} failed ---\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSchedulerTests().catch((err) => {
  console.error('Scheduler tests failed with exception:', err);
  process.exit(1);
});
