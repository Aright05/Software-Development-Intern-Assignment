import { redisClient } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface RateLimitReservation {
  allowed: boolean;
  delayMs: number;
  currentHourlyCount: number;
  reason: 'ALLOWED' | 'MIN_DELAY_EXCEEDED' | 'HOURLY_LIMIT_EXCEEDED' | 'REDIS_ERROR_SAFETY_BACKOFF';
}

export class RateLimiterService {
  /**
   * Atomic Lua script to enforce:
   * 1. Sender hourly quota using UTC hour window
   * 2. Sender minimum delay between individual emails
   * 3. Retry idempotency (avoid double-counting same emailId in same hour)
   */
  private readonly luaScript = `
    local current_time = tonumber(ARGV[1])
    local max_hourly = tonumber(ARGV[2])
    local min_delay = tonumber(ARGV[3])
    local next_hour_start = tonumber(ARGV[4])
    local email_id = ARGV[5]

    -- Step 1: Check if this email was already reserved in this UTC hour (Retry Idempotency)
    local already_reserved = redis.call('SISMEMBER', KEYS[3], email_id)

    -- Step 2: Check Hourly Quota
    local current_hourly_count = tonumber(redis.call('GET', KEYS[1]) or '0')
    if already_reserved == 0 and current_hourly_count >= max_hourly then
        local wait_ms = next_hour_start - current_time
        if wait_ms < 1000 then wait_ms = 1000 end
        return { 0, wait_ms, current_hourly_count, "HOURLY_LIMIT_EXCEEDED" }
    end

    -- Step 3: Check Minimum Interval Between Individual Sends
    local last_sent = tonumber(redis.call('GET', KEYS[2]) or '0')
    local elapsed = current_time - last_sent
    if elapsed < min_delay then
        local wait_ms = min_delay - elapsed
        return { 0, wait_ms, current_hourly_count, "MIN_DELAY_EXCEEDED" }
    end

    -- Step 4: Grant Reservation Atomically
    if already_reserved == 0 then
        current_hourly_count = redis.call('INCR', KEYS[1])
        if current_hourly_count == 1 then
            redis.call('EXPIRE', KEYS[1], 7200) -- 2 hours TTL
        end
        redis.call('SADD', KEYS[3], email_id)
        redis.call('EXPIRE', KEYS[3], 7200)
    end

    -- Update last sent timestamp for interval enforcement
    redis.call('SET', KEYS[2], current_time, 'EX', 3600)

    return { 1, 0, current_hourly_count, "ALLOWED" }
  `;

  /**
   * Generates the UTC hour identifier (e.g. "2026112414")
   */
  getUtcHourWindow(date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}${month}${day}${hour}`;
  }

  /**
   * Calculates the exact millisecond timestamp when the next UTC hour begins
   */
  getNextUtcHourStartMs(date = new Date()): number {
    const nextHour = new Date(date);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
    return nextHour.getTime();
  }

  /**
   * Atomically checks and reserves an execution slot for a specific sender.
   */
  async checkAndReserve(
    senderId: string,
    emailId: string,
    customHourlyLimit?: number,
    customMinDelayMs?: number
  ): Promise<RateLimitReservation> {
    const now = new Date();
    const currentTimeMs = now.getTime();
    const utcHour = this.getUtcHourWindow(now);
    const nextHourStartMs = this.getNextUtcHourStartMs(now);

    const maxHourly = customHourlyLimit || config.rateLimit.maxEmailsPerHourPerSender;
    const minDelay = customMinDelayMs !== undefined ? customMinDelayMs : config.rateLimit.minDelayBetweenEmailsMs;

    const hourlyKey = `ratelimit:sender:${senderId}:hour:${utcHour}`;
    const lastSentKey = `ratelimit:sender:${senderId}:last_sent`;
    const reservedSetKey = `ratelimit:sender:${senderId}:hour:${utcHour}:reserved`;

    try {
      const result = (await redisClient.eval(
        this.luaScript,
        3,
        hourlyKey,
        lastSentKey,
        reservedSetKey,
        currentTimeMs,
        maxHourly,
        minDelay,
        nextHourStartMs,
        emailId
      )) as [number, number, number, string];

      const allowed = result[0] === 1;
      const delayMs = result[1];
      const currentHourlyCount = result[2];
      const reason = result[3] as RateLimitReservation['reason'];

      if (!allowed) {
        logger.warn(
          `[RateLimit] Sender [${senderId}] throttled (${reason}). Delay required: ${delayMs}ms. Usage: ${currentHourlyCount}/${maxHourly} in UTC hour ${utcHour}`,
          'RateLimiter'
        );
      } else {
        logger.info(
          `[RateLimit] Slot reserved for Sender [${senderId}] (Usage: ${currentHourlyCount}/${maxHourly} in UTC hour ${utcHour})`,
          'RateLimiter'
        );
      }

      return {
        allowed,
        delayMs,
        currentHourlyCount,
        reason,
      };
    } catch (err: any) {
      // Fail-closed resilience: Never bypass rate limits on Redis errors
      logger.error(`[RateLimit] Redis error checking rate limits: ${err.message}. Applying safe backoff.`, 'RateLimiter', err);
      return {
        allowed: false,
        delayMs: 5000, // 5 seconds safety backoff
        currentHourlyCount: -1,
        reason: 'REDIS_ERROR_SAFETY_BACKOFF',
      };
    }
  }

  /**
   * Retrieves live rate limit telemetry for a sender
   */
  async getSenderStatus(senderId: string): Promise<{
    utcHour: string;
    currentHourlyCount: number;
    maxHourly: number;
    lastSentAt: string | null;
    msUntilNextHour: number;
  }> {
    const now = new Date();
    const utcHour = this.getUtcHourWindow(now);
    const hourlyKey = `ratelimit:sender:${senderId}:hour:${utcHour}`;
    const lastSentKey = `ratelimit:sender:${senderId}:last_sent`;

    const [countRaw, lastSentRaw] = await Promise.all([
      redisClient.get(hourlyKey),
      redisClient.get(lastSentKey),
    ]);

    const count = parseInt(countRaw || '0', 10);
    const lastSentMs = lastSentRaw ? parseInt(lastSentRaw, 10) : null;
    const nextHourMs = this.getNextUtcHourStartMs(now);

    return {
      utcHour,
      currentHourlyCount: count,
      maxHourly: config.rateLimit.maxEmailsPerHourPerSender,
      lastSentAt: lastSentMs ? new Date(lastSentMs).toISOString() : null,
      msUntilNextHour: Math.max(0, nextHourMs - now.getTime()),
    };
  }

  /**
   * Resets rate-limit keys for testing purposes
   */
  async resetSenderRateLimits(senderId: string): Promise<void> {
    const now = new Date();
    const utcHour = this.getUtcHourWindow(now);
    const hourlyKey = `ratelimit:sender:${senderId}:hour:${utcHour}`;
    const lastSentKey = `ratelimit:sender:${senderId}:last_sent`;
    const reservedSetKey = `ratelimit:sender:${senderId}:hour:${utcHour}:reserved`;

    await redisClient.del(hourlyKey, lastSentKey, reservedSetKey);
  }
}

export const rateLimiterService = new RateLimiterService();
