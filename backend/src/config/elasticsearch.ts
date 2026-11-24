import { Client } from '@elastic/elasticsearch';
import { config } from './index';
import { logger } from '../utils/logger';

export const elasticClient = new Client({
  node: config.elasticsearch.node,
});

export const checkElasticsearchHealth = async (): Promise<boolean> => {
  try {
    const health = await elasticClient.cluster.health({});
    logger.info(`Elasticsearch cluster status: ${health.status}`, 'Elasticsearch');
    return true;
  } catch (error) {
    logger.warn('Elasticsearch is currently unreachable or not ready', 'Elasticsearch', error);
    return false;
  }
};
