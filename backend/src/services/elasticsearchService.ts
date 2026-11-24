import { elasticClient } from '../config/elasticsearch';
import { config } from '../config';
import { prisma } from './prismaService';
import { logger } from '../utils/logger';

export interface EmailDocument {
  emailId: string;
  userId: string;
  campaignId?: string | null;
  senderId: string;
  senderName?: string;
  senderEmail?: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  errorMessage?: string | null;
  idempotencyKey: string;
  createdAt: string;
}

export interface EmailSearchParams {
  q?: string;
  status?: string;
  senderId?: string;
  campaignId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  source: 'elasticsearch' | 'database_fallback';
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hits: any[];
}

export class ElasticsearchService {
  private indexName = config.elasticsearch.index;
  private isIndexReady = false;

  /**
   * Initializes the Elasticsearch index with appropriate full-text and keyword mappings
   */
  async initializeIndex(): Promise<boolean> {
    try {
      const exists = await elasticClient.indices.exists({ index: this.indexName });

      if (!exists) {
        logger.info(`Creating Elasticsearch index [${this.indexName}] with mappings...`, 'Elasticsearch');
        await elasticClient.indices.create({
          index: this.indexName,
          mappings: {
            properties: {
              emailId: { type: 'keyword' },
              userId: { type: 'keyword' },
              campaignId: { type: 'keyword' },
              senderId: { type: 'keyword' },
              senderEmail: {
                type: 'text',
                fields: { keyword: { type: 'keyword' } },
              },
              senderName: { type: 'text' },
              recipient: {
                type: 'text',
                fields: { keyword: { type: 'keyword' } },
              },
              subject: {
                type: 'text',
                analyzer: 'standard',
              },
              body: {
                type: 'text',
                analyzer: 'standard',
              },
              status: { type: 'keyword' },
              scheduledAt: { type: 'date' },
              sentAt: { type: 'date' },
              createdAt: { type: 'date' },
              idempotencyKey: { type: 'keyword' },
            },
          },
        });
        logger.info(`Index [${this.indexName}] created successfully.`, 'Elasticsearch');
      }

      this.isIndexReady = true;
      return true;
    } catch (err: any) {
      logger.warn(`Could not initialize Elasticsearch index: ${err.message}. Offline fallback active.`, 'Elasticsearch');
      this.isIndexReady = false;
      return false;
    }
  }

  /**
   * Indexes a single email document asynchronously without blocking primary workflows
   */
  async indexEmail(doc: EmailDocument): Promise<boolean> {
    try {
      await elasticClient.index({
        index: this.indexName,
        id: doc.emailId,
        document: doc,
      });
      logger.debug(`Document indexed in Elasticsearch: [${doc.emailId}]`, 'Elasticsearch');
      return true;
    } catch (err: any) {
      logger.warn(`Failed to index email [${doc.emailId}] in Elasticsearch: ${err.message}`, 'Elasticsearch');
      return false;
    }
  }

  /**
   * Bulk indexes an array of email documents
   */
  async bulkIndexEmails(docs: EmailDocument[]): Promise<{ indexed: number; failed: number }> {
    if (docs.length === 0) return { indexed: 0, failed: 0 };

    try {
      const operations = docs.flatMap((doc) => [
        { index: { _index: this.indexName, _id: doc.emailId } },
        doc,
      ]);

      const bulkResponse = await elasticClient.bulk({ operations, refresh: true });

      if (bulkResponse.errors) {
        let failed = 0;
        bulkResponse.items.forEach((item) => {
          if (item.index && item.index.error) failed++;
        });
        return { indexed: docs.length - failed, failed };
      }

      logger.info(`Bulk indexed ${docs.length} emails in Elasticsearch`, 'Elasticsearch');
      return { indexed: docs.length, failed: 0 };
    } catch (err: any) {
      logger.warn(`Bulk indexing error in Elasticsearch: ${err.message}`, 'Elasticsearch');
      return { indexed: 0, failed: docs.length };
    }
  }

  /**
   * Updates an existing email's status, sentAt, and error details in Elasticsearch
   */
  async updateEmailStatus(
    emailId: string,
    status: string,
    sentAt?: Date | null,
    errorMessage?: string | null
  ): Promise<boolean> {
    try {
      await elasticClient.update({
        index: this.indexName,
        id: emailId,
        doc: {
          status,
          sentAt: sentAt ? sentAt.toISOString() : undefined,
          errorMessage: errorMessage || undefined,
        },
      });
      return true;
    } catch (err: any) {
      logger.debug(`Could not update email [${emailId}] in Elasticsearch: ${err.message}`, 'Elasticsearch');
      return false;
    }
  }

  /**
   * Performs full-text search across recipient, subject and body with filtering and pagination.
   * Enforces strict user tenant isolation.
   * Transparently falls back to PostgreSQL if Elasticsearch is unavailable.
   */
  async searchEmails(userId: string, params: EmailSearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const from = (page - 1) * limit;

    try {
      const filterClauses: any[] = [{ term: { userId } }];

      if (params.status) {
        filterClauses.push({ term: { status: params.status } });
      }

      if (params.senderId) {
        filterClauses.push({ term: { senderId: params.senderId } });
      }

      if (params.campaignId) {
        filterClauses.push({ term: { campaignId: params.campaignId } });
      }

      if (params.startDate || params.endDate) {
        const range: any = {};
        if (params.startDate) range.gte = new Date(params.startDate).toISOString();
        if (params.endDate) range.lte = new Date(params.endDate).toISOString();
        filterClauses.push({ range: { scheduledAt: range } });
      }

      const queryClause = params.q?.trim()
        ? {
            multi_match: {
              query: params.q.trim(),
              fields: ['recipient^3', 'subject^2', 'body', 'senderEmail', 'senderName'],
              fuzziness: 'AUTO',
              prefix_length: 2,
            },
          }
        : { match_all: {} };

      const response = await elasticClient.search({
        index: this.indexName,
        from,
        size: limit,
        query: {
          bool: {
            must: [queryClause],
            filter: filterClauses,
          },
        },
        sort: [
          { _score: { order: 'desc' } },
          { scheduledAt: { order: 'desc' } },
        ],
      });

      const totalHits =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : response.hits.total?.value || 0;

      const hits = response.hits.hits.map((hit) => ({
        id: hit._id,
        score: hit._score,
        ...(hit._source as any),
      }));

      return {
        source: 'elasticsearch',
        total: totalHits,
        page,
        limit,
        totalPages: Math.ceil(totalHits / limit) || 1,
        hits,
      };
    } catch (err: any) {
      logger.warn(
        `Elasticsearch query failed (${err.message}). Falling back to PostgreSQL relational database query.`,
        'Elasticsearch'
      );
      return this.fallbackDatabaseSearch(userId, params, page, limit);
    }
  }

  /**
   * Resilient fallback query directly against PostgreSQL
   */
  private async fallbackDatabaseSearch(
    userId: string,
    params: EmailSearchParams,
    page: number,
    limit: number
  ): Promise<SearchResult> {
    const skip = (page - 1) * limit;
    const searchFilter = params.q?.trim();

    const where: any = {
      userId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.senderId ? { senderId: params.senderId } : {}),
      ...(params.campaignId ? { campaignId: params.campaignId } : {}),
      ...(searchFilter
        ? {
            OR: [
              { recipient: { contains: searchFilter, mode: 'insensitive' } },
              { subject: { contains: searchFilter, mode: 'insensitive' } },
              { body: { contains: searchFilter, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(params.startDate || params.endDate
        ? {
            scheduledAt: {
              ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
              ...(params.endDate ? { lte: new Date(params.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, emails] = await Promise.all([
      prisma.scheduledEmail.count({ where }),
      prisma.scheduledEmail.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          sender: { select: { id: true, email: true, name: true } },
          campaign: { select: { id: true, name: true, subject: true } },
        },
      }),
    ]);

    const hits = emails.map((e) => ({
      emailId: e.id,
      userId: e.userId,
      campaignId: e.campaignId,
      senderId: e.senderId,
      senderName: e.sender.name,
      senderEmail: e.sender.email,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      status: e.status,
      scheduledAt: e.scheduledAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      idempotencyKey: e.idempotencyKey,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      source: 'database_fallback',
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      hits,
    };
  }

  /**
   * Reindexes all PostgreSQL records into Elasticsearch
   */
  async reindexAll(userId?: string): Promise<{ totalFound: number; totalIndexed: number }> {
    logger.info('Starting full database-to-Elasticsearch synchronization...', 'Elasticsearch');
    await this.initializeIndex();

    const emails = await prisma.scheduledEmail.findMany({
      where: userId ? { userId } : {},
      include: {
        sender: { select: { name: true, email: true } },
      },
    });

    const documents: EmailDocument[] = emails.map((e) => ({
      emailId: e.id,
      userId: e.userId,
      campaignId: e.campaignId,
      senderId: e.senderId,
      senderName: e.sender.name,
      senderEmail: e.sender.email,
      recipient: e.recipient,
      subject: e.subject,
      body: e.body,
      status: e.status,
      scheduledAt: e.scheduledAt.toISOString(),
      sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      errorMessage: e.errorMessage,
      idempotencyKey: e.idempotencyKey,
      createdAt: e.createdAt.toISOString(),
    }));

    const result = await this.bulkIndexEmails(documents);
    logger.info(`Reindexing completed: ${result.indexed} indexed successfully out of ${emails.length} total.`, 'Elasticsearch');

    return {
      totalFound: emails.length,
      totalIndexed: result.indexed,
    };
  }
}

export const elasticsearchService = new ElasticsearchService();
