import Redis, { RedisOptions } from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

export const redisConnectionOptions: RedisOptions = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
};

export const redisClient = new Redis(redisConnectionOptions);

redisClient.on('connect', () => {
  logger.info('Connected to Redis server', 'Redis');
});

redisClient.on('error', (err) => {
  logger.error(`Redis connection error: ${err.message}`, 'Redis', err);
});
