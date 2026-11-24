import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from '../queues/emailQueue';
import { config } from './index';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(config.bullBoard.path);

createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
});

export const bullBoardAdapter = serverAdapter;
