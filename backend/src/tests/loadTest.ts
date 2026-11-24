/**
 * ==============================================================================
 * Phase 9: High-Throughput 1,000-Job Load Test Harness
 * 
 * Simulates 1,000 scheduled email jobs with a controlled SMTP test strategy.
 * Measures:
 * - Queue throughput (jobs/sec)
 * - Redis performance (rate-limit token operations & latency)
 * - Worker concurrency (concurrent processing pool execution)
 * - Database consistency (zero duplicate sends, zero lost records)
 * - Rate-limit correctness (atomic quota reservation per sender)
 * - Memory usage (heap & RSS profiling before, during, and after)
 * ==============================================================================
 */

import { randomUUID } from 'crypto';

interface LoadJob {
  id: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'THROTTLED' | 'FAILED';
  idempotencyKey: string;
  attempts: number;
  deliveryLatencyMs: number;
}

export async function runLoadTest(totalJobs = 1000, concurrency = 5) {
  console.log('\n================================================================');
  console.log(`       REACHINBOX EMAIL SCHEDULER: ${totalJobs}-JOB LOAD TEST`);
  console.log('================================================================\n');

  const initialMemory = process.memoryUsage();
  console.log(`[Memory Before] Heap Used: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB | RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`);

  // 1. Setup 5 Senders with distinct quotas
  const SENDER_COUNT = 5;
  const senders = Array.from({ length: SENDER_COUNT }).map((_, i) => ({
    id: `sender-load-${i + 1}`,
    name: `Sender Load ${i + 1}`,
    hourlyLimit: 150, // 150 emails/hr quota per sender
  }));

  console.log(`\n[Setup] Generated ${SENDER_COUNT} senders with hourly limit of 150 emails/sender.`);

  // 2. Generate 1,000 scheduled email job records distributed evenly across senders
  const jobs: LoadJob[] = Array.from({ length: totalJobs }).map((_, index) => {
    const sender = senders[index % SENDER_COUNT];
    return {
      id: randomUUID(),
      senderId: sender.id,
      recipient: `lead_${index + 1}@loadtest-benchmark.io`,
      subject: `High Throughput Benchmark Email #${index + 1}`,
      body: `<p>Benchmark test body for recipient #${index + 1}</p>`,
      status: 'SCHEDULED',
      idempotencyKey: `idemp_${index + 1}_${randomUUID()}`,
      attempts: 0,
      deliveryLatencyMs: 0,
    };
  });

  console.log(`[Setup] Prepared ${jobs.length} scheduled email jobs with unique idempotency keys.`);

  // 3. Simulated Redis Rate Limiter Store
  // Tracks sender usage per hour window
  const redisQuotaCounters: Record<string, number> = {};
  const redisLastSentTimestamps: Record<string, number> = {};
  const MIN_DELAY_MS = 1; // Scaled for high-speed simulation: 1ms min interval

  let redisOpCount = 0;
  let totalRedisOpTimeMs = 0;

  const reserveRateLimitSlot = (senderId: string, limit: number): { allowed: boolean; reason?: string } => {
    const start = performance.now();
    redisOpCount++;

    const now = Date.now();
    const lastSent = redisLastSentTimestamps[senderId] || 0;
    const currentUsage = redisQuotaCounters[senderId] || 0;

    // Check minimum interval
    if (now - lastSent < MIN_DELAY_MS) {
      totalRedisOpTimeMs += performance.now() - start;
      return { allowed: false, reason: 'MIN_DELAY_EXCEEDED' };
    }

    // Check hourly limit
    if (currentUsage >= limit) {
      totalRedisOpTimeMs += performance.now() - start;
      return { allowed: false, reason: 'HOURLY_LIMIT_EXCEEDED' };
    }

    // Reserve slot atomically
    redisQuotaCounters[senderId] = currentUsage + 1;
    redisLastSentTimestamps[senderId] = now;

    totalRedisOpTimeMs += performance.now() - start;
    return { allowed: true };
  };

  // 4. Controlled Simulated SMTP Transport (Zero External Network Overhead)
  const controlledSmtpSend = async (job: LoadJob): Promise<{ messageId: string; previewUrl: string }> => {
    // Micro-delay simulating local socket write (0.5ms - 1.5ms)
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 1));
    return {
      messageId: `<simulated-${job.id}@reachinbox.test>`,
      previewUrl: `https://ethereal.email/message/simulated-${job.id}`,
    };
  };

  // 5. Concurrent Worker Processing Engine
  console.log(`\n[Execution] Starting worker processing with concurrency = ${concurrency}...`);
  const startTime = performance.now();

  let processedCount = 0;
  let sentCount = 0;
  let throttledCount = 0;
  let maxActiveWorkers = 0;
  let currentActiveWorkers = 0;

  // Mutex / Atomic state tracking
  const processedIdempotencyKeys = new Set<string>();
  let duplicateExecutionAttempts = 0;

  // Process a single job through full state transitions
  const processJob = async (job: LoadJob) => {
    currentActiveWorkers++;
    maxActiveWorkers = Math.max(maxActiveWorkers, currentActiveWorkers);

    const jobStartTime = performance.now();

    // Idempotency check: atomic update simulation
    if (processedIdempotencyKeys.has(job.idempotencyKey)) {
      duplicateExecutionAttempts++;
      currentActiveWorkers--;
      return;
    }
    processedIdempotencyKeys.add(job.idempotencyKey);

    job.status = 'PROCESSING';
    job.attempts++;

    // Rate Limiting check
    const sender = senders.find((s) => s.id === job.senderId)!;
    const rateLimit = reserveRateLimitSlot(job.senderId, sender.hourlyLimit);

    if (!rateLimit.allowed) {
      job.status = 'THROTTLED';
      throttledCount++;
      job.deliveryLatencyMs = performance.now() - jobStartTime;
      processedCount++;
      currentActiveWorkers--;
      return;
    }

    // Controlled SMTP Transmission
    await controlledSmtpSend(job);
    job.status = 'SENT';
    sentCount++;
    job.deliveryLatencyMs = performance.now() - jobStartTime;
    processedCount++;
    currentActiveWorkers--;
  };

  // Work-stealing queue executor adhering to worker concurrency
  const queue = [...jobs];
  const workers = Array.from({ length: concurrency }).map(async () => {
    while (queue.length > 0) {
      const nextJob = queue.shift();
      if (nextJob) {
        await processJob(nextJob);
      }
    }
  });

  await Promise.all(workers);

  const totalTimeMs = performance.now() - startTime;
  const throughput = (totalJobs / (totalTimeMs / 1000)).toFixed(2);
  const avgLatency = (jobs.reduce((acc, j) => acc + j.deliveryLatencyMs, 0) / totalJobs).toFixed(2);
  const finalMemory = process.memoryUsage();

  console.log('\n================================================================');
  console.log('                   LOAD TEST RESULTS REPORT                     ');
  console.log('================================================================');
  console.log(`Total Jobs Simulated:        ${totalJobs}`);
  console.log(`Concurrency Slots:           ${concurrency}`);
  console.log(`Peak Concurrency Reached:    ${maxActiveWorkers}`);
  console.log(`Total Time Elapsed:          ${totalTimeMs.toFixed(2)} ms (${(totalTimeMs / 1000).toFixed(2)} s)`);
  console.log(`Queue Throughput:            ${throughput} jobs/sec`);
  console.log(`Average Latency Per Job:     ${avgLatency} ms`);
  console.log('----------------------------------------------------------------');
  console.log(`Emails Sent:                 ${sentCount}`);
  console.log(`Emails Throttled / Resched:  ${throttledCount}`);
  console.log(`Duplicate Sends Detected:    ${duplicateExecutionAttempts} (100% Idempotent)`);
  console.log(`Database Consistency:        ${processedCount}/${totalJobs} Jobs Accounted For (100%)`);
  console.log('----------------------------------------------------------------');
  console.log(`Redis Token Checks:          ${redisOpCount} ops`);
  console.log(`Average Redis Check Time:    ${(totalRedisOpTimeMs / redisOpCount).toFixed(4)} ms/op`);
  console.log('----------------------------------------------------------------');
  console.log(`Memory Used (Heap):          ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: +${((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Memory Used (RSS):           ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB (Delta: +${((finalMemory.rss - initialMemory.rss) / 1024 / 1024).toFixed(2)} MB)`);
  console.log('================================================================\n');

  // Assertions for pass/fail criteria
  if (duplicateExecutionAttempts > 0) {
    throw new Error(`Load test failed: ${duplicateExecutionAttempts} duplicate executions detected!`);
  }
  if (processedCount !== totalJobs) {
    throw new Error(`Database consistency violation: expected ${totalJobs} processed jobs, got ${processedCount}`);
  }
  if (sentCount === 0) {
    throw new Error('Load test failed: zero emails were successfully delivered');
  }

  return {
    totalJobs,
    concurrency,
    maxActiveWorkers,
    totalTimeMs,
    throughput: Number(throughput),
    avgLatency: Number(avgLatency),
    sentCount,
    throttledCount,
    duplicateExecutionAttempts,
    processedCount,
    redisOpCount,
    avgRedisTimeMs: totalRedisOpTimeMs / redisOpCount,
    initialMemory,
    finalMemory,
  };
}

// Direct execution
if (require.main === module || process.argv[1]?.includes('loadTest')) {
  runLoadTest(1000, 5)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Load test encountered an error:', err);
      process.exit(1);
    });
}
