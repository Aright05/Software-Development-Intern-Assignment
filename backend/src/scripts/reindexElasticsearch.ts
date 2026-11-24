import { elasticsearchService } from '../services/elasticsearchService';
import { logger } from '../utils/logger';

async function main() {
  console.log('\n======================================================');
  console.log('ReachInbox Elasticsearch - Full Database Reindex Tool');
  console.log('======================================================\n');

  try {
    const startTime = Date.now();
    logger.info('Starting reindexing process...', 'ReindexScript');

    const result = await elasticsearchService.reindexAll();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n----------------- REINDEX SUMMARY -----------------');
    console.log(`Total Records Found in DB: ${result.totalFound}`);
    console.log(`Successfully Indexed in ES: ${result.totalIndexed}`);
    console.log(`Time Elapsed:               ${duration}s`);
    console.log('===================================================\n');

    process.exit(0);
  } catch (error) {
    logger.error('Reindexing execution failed:', 'ReindexScript', error);
    process.exit(1);
  }
}

main();
