import { rateLimiterService } from '../services/rateLimiterService';
import { processEmailJob } from '../workers/jobProcessor';
import { prisma } from '../services/prismaService';
import { emailService } from '../services/emailService';
import { schedulerService } from '../services/schedulerService';
import { redisClient } from '../config/redis';
import { EmailStatus } from '@prisma/client';
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

async function runRateLimiterTests() {
  console.log('\n--- Running Phase 5: Distributed Rate Limiting & Throttling Test Suite ---\n');

  // IN-MEMORY REDIS STATE EMULATOR FOR UNIT/INTEGRATION TESTS
  const redisStore = new Map<string, string>();
  const redisSets = new Map<string, Set<string>>();

  // Save original redisClient methods
  const originalEval = redisClient.eval;
  const originalGet = redisClient.get;

  // Custom mock of Redis Lua execution to simulate atomic Redis server behavior in memory
  redisClient.eval = (async (
    script: string,
    numKeys: number,
    hourlyKey: string,
    lastSentKey: string,
    reservedSetKey: string,
    currentTimeMs: number,
    maxHourly: number,
    minDelay: number,
    nextHourStart: number,
    emailId: string
  ) => {
    // 1. Check if email was already reserved in this hour
    const set = redisSets.get(reservedSetKey) || new Set<string>();
    const alreadyReserved = set.has(emailId) ? 1 : 0;

    // 2. Check Hourly Quota
    const currentHourlyCount = parseInt(redisStore.get(hourlyKey) || '0', 10);
    if (alreadyReserved === 0 && currentHourlyCount >= maxHourly) {
      const waitMs = Math.max(1000, nextHourStart - currentTimeMs);
      return [0, waitMs, currentHourlyCount, 'HOURLY_LIMIT_EXCEEDED'];
    }

    // 3. Check Minimum Interval Delay
    const lastSent = parseInt(redisStore.get(lastSentKey) || '0', 10);
    const elapsed = currentTimeMs - lastSent;
    if (elapsed < minDelay) {
      const waitMs = minDelay - elapsed;
      return [0, waitMs, currentHourlyCount, 'MIN_DELAY_EXCEEDED'];
    }

    // 4. Grant Reservation Atomically
    let newCount = currentHourlyCount;
    if (alreadyReserved === 0) {
      newCount = currentHourlyCount + 1;
      redisStore.set(hourlyKey, String(newCount));
      set.add(emailId);
      redisSets.set(reservedSetKey, set);
    }

    redisStore.set(lastSentKey, String(currentTimeMs));
    return [1, 0, newCount, 'ALLOWED'];
  }) as any;

  redisClient.get = (async (key: string) => {
    return redisStore.get(key) || null;
  }) as any;

  try {
    // TEST 1: Minimum Delay Throttling
    {
      console.log('[1] Minimum Interval Throttling (MIN_DELAY_BETWEEN_EMAILS_MS):');
      redisStore.clear();
      redisSets.clear();

      const senderId = 'sender-alpha';
      const minDelayMs = 2000;

      // First call: Should be immediately allowed
      const res1 = await rateLimiterService.checkAndReserve(senderId, 'email-001', 100, minDelayMs);
      assert(res1.allowed === true, 'First email slot granted immediately');
      assert(res1.reason === 'ALLOWED', 'Reason is ALLOWED');
      assert(res1.currentHourlyCount === 1, 'Hourly count incremented to 1');

      // Second call: 200ms later (violates 2000ms minimum interval)
      const res2 = await rateLimiterService.checkAndReserve(senderId, 'email-002', 100, minDelayMs);
      assert(res2.allowed === false, 'Second email blocked due to minimum interval constraint');
      assert(res2.reason === 'MIN_DELAY_EXCEEDED', 'Reason identified as MIN_DELAY_EXCEEDED');
      assert(res2.delayMs > 0 && res2.delayMs <= minDelayMs, 'Calculated delayMs matches remaining interval window');
    }

    // TEST 2: Hourly Quota Exhaustion & Next-Hour Calculation
    {
      console.log('\n[2] Hourly Quota Exhaustion & Next UTC Hour Calculation:');
      redisStore.clear();
      redisSets.clear();

      const senderId = 'sender-beta';
      const maxHourlyLimit = 2; // Low limit for testing
      const minDelayMs = 0;     // Disable min delay to test pure quota

      // Send 1st email
      const res1 = await rateLimiterService.checkAndReserve(senderId, 'email-b1', maxHourlyLimit, minDelayMs);
      assert(res1.allowed === true && res1.currentHourlyCount === 1, 'Email 1 granted (1/2)');

      // Send 2nd email
      const res2 = await rateLimiterService.checkAndReserve(senderId, 'email-b2', maxHourlyLimit, minDelayMs);
      assert(res2.allowed === true && res2.currentHourlyCount === 2, 'Email 2 granted (2/2 - quota exhausted)');

      // Send 3rd email: Should be throttled
      const res3 = await rateLimiterService.checkAndReserve(senderId, 'email-b3', maxHourlyLimit, minDelayMs);
      assert(res3.allowed === false, 'Email 3 blocked: hourly quota exceeded');
      assert(res3.reason === 'HOURLY_LIMIT_EXCEEDED', 'Reason identified as HOURLY_LIMIT_EXCEEDED');

      // Verify waitMs reaches the next UTC hour
      const nextHourStart = rateLimiterService.getNextUtcHourStartMs();
      const expectedWait = nextHourStart - Date.now();
      assert(Math.abs(res3.delayMs - expectedWait) < 5000, 'Rescheduling delay targets the start of the next UTC hour');
    }

    // TEST 3: Multi-Sender Isolation
    {
      console.log('\n[3] Multi-Sender Isolation:');
      const senderA = 'sender-exhausted';
      const senderB = 'sender-fresh';

      // Exhaust Sender A
      await rateLimiterService.checkAndReserve(senderA, 'email-a1', 1, 0);
      const resA = await rateLimiterService.checkAndReserve(senderA, 'email-a2', 1, 0);
      assert(resA.allowed === false, 'Sender A is throttled');

      // Check Sender B: should have full independent quota
      const resB = await rateLimiterService.checkAndReserve(senderB, 'email-b1', 5, 0);
      assert(resB.allowed === true, 'Sender B is completely unaffected by Sender A throttling');
      assert(resB.currentHourlyCount === 1, 'Sender B quota counter starts at 1');
    }

    // TEST 4: Retry Idempotency (Prevent Duplicate Hourly Reservations)
    {
      console.log('\n[4] Retry Idempotency in Rate Limiting:');
      redisStore.clear();
      redisSets.clear();

      const senderId = 'sender-retry';
      const emailId = 'email-retry-001';

      // First attempt: grants slot and increments hourly counter
      const res1 = await rateLimiterService.checkAndReserve(senderId, emailId, 10, 0);
      assert(res1.allowed === true && res1.currentHourlyCount === 1, 'Initial attempt reservations increment counter to 1');

      // Retry of the same email in the same hour: should NOT increment counter again
      const res2 = await rateLimiterService.checkAndReserve(senderId, emailId, 10, 0);
      assert(res2.allowed === true, 'Retry allowed');
      assert(res2.currentHourlyCount === 1, 'Hourly quota counter was NOT incremented again on retry');
    }

    // TEST 5: JobProcessor Throttling & Immediate Worker Concurrency Slot Release
    {
      console.log('\n[5] Worker Concurrency Non-Blocking Reschedule:');
      redisStore.clear();
      redisSets.clear();

      // Exhaust sender quota
      await rateLimiterService.checkAndReserve('sender-concurrency', 'prior-email', 1, 0);

      let rescheduledDelay = 0;
      schedulerService.rescheduleWithDelay = (async (data: any, delayMs: number) => {
        rescheduledDelay = delayMs;
        return 'new-rescheduled-job-id';
      }) as any;

      prisma.scheduledEmail.updateMany = (async () => ({ count: 1 })) as any;
      prisma.sender.findUnique = (async () => ({
        id: 'sender-concurrency',
        email: 'sender@reachinbox.ai',
        name: 'Sender',
        isActive: true,
      })) as any;

      const throttledJob = {
        id: 'job-throttled-001',
        data: {
          emailId: 'email-throttled-001',
          idempotencyKey: 'idem-t1',
          userId: 'user-001',
          senderId: 'sender-concurrency',
          recipient: 'recipient@example.com',
          subject: 'Throttled Email',
          body: 'Hello',
          scheduledAt: new Date().toISOString(),
        },
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job;

      const startTime = Date.now();
      const jobResult = await processEmailJob(throttledJob);
      const executionDuration = Date.now() - startTime;

      assert(executionDuration < 200, 'Processor returned instantly (<200ms) without holding worker thread');
      assert(jobResult.rescheduled === true, 'Job was flagged as rescheduled');
      assert(rescheduledDelay > 0, 'Rescheduling delay was calculated and passed to BullMQ');
    }

    // TEST 6: Concurrent Workers Race Condition & Atomic Reservation
    {
      console.log('\n[6] Concurrent Workers Contention Simulation:');
      redisStore.clear();
      redisSets.clear();

      const senderId = 'sender-race';
      const limit = 3;
      const minDelay = 0;

      // 10 concurrent worker requests at the exact same moment
      const requests = Array.from({ length: 10 }, (_, i) =>
        rateLimiterService.checkAndReserve(senderId, `email-concurrent-${i}`, limit, minDelay)
      );

      const results = await Promise.all(requests);
      const allowedCount = results.filter((r) => r.allowed).length;
      const throttledCount = results.filter((r) => !r.allowed).length;

      assert(allowedCount === limit, `Exactly ${limit} concurrent requests granted slots`);
      assert(throttledCount === 10 - limit, `Remaining ${10 - limit} concurrent requests cleanly throttled`);
    }

    // TEST 7: Redis Error Resilience (Fail-Closed Safety Backoff)
    {
      console.log('\n[7] Redis Error Safety Backoff:');
      // Simulate Redis crashing during rate limit evaluation
      redisClient.eval = (async () => {
        throw new Error('Connection to Redis lost');
      }) as any;

      const fallbackResult = await rateLimiterService.checkAndReserve('sender-err', 'email-err', 100, 2000);
      assert(fallbackResult.allowed === false, 'Fails closed: does NOT send when Redis is down');
      assert(fallbackResult.reason === 'REDIS_ERROR_SAFETY_BACKOFF', 'Flags reason as REDIS_ERROR_SAFETY_BACKOFF');
      assert(fallbackResult.delayMs === 5000, 'Applies protective safety delay');
    }
  } finally {
    // Restore original redisClient methods
    redisClient.eval = originalEval;
    redisClient.get = originalGet;
  }

  console.log(`\n--- Rate Limiter Test Results: ${passed} passed, ${failed} failed ---\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRateLimiterTests().catch((err) => {
  console.error('Rate limiter test suite failed with error:', err);
  process.exit(1);
});
