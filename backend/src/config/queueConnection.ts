import Redis, { RedisOptions } from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const baseRedisOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 250, 3000);
    return delay;
  },
};

const activeConnections: Redis[] = [];

/**
 * Creates an independent Redis client for BullMQ Queue, Worker, or QueueEvents
 */
export const createRedisConnection = (name = 'BullMQ'): Redis => {
  const client = new Redis(baseRedisOptions);

  client.on('connect', () => {
    logger.info(`Redis [${name}] client connected successfully`, 'QueueConnection');
  });

  client.on('error', (err) => {
    logger.error(`Redis [${name}] connection error: ${err.message}`, 'QueueConnection', err);
  });

  activeConnections.push(client);
  return client;
};

/**
 * Gracefully terminates all open Redis connections
 */
export const closeRedisConnections = async (): Promise<void> => {
  logger.info(`Closing ${activeConnections.length} active Redis connection(s)...`, 'QueueConnection');
  await Promise.all(
    activeConnections.map(async (conn) => {
      try {
        if (conn.status !== 'end') {
          await conn.quit();
        }
      } catch (err) {
        logger.warn('Error closing Redis connection, disconnecting forceably', 'QueueConnection', err);
        conn.disconnect();
      }
    })
  );
  activeConnections.length = 0;
};
