import request from 'supertest';
import { createApp } from '../app';
import { elasticsearchService, EmailDocument } from '../services/elasticsearchService';
import { elasticClient } from '../config/elasticsearch';
import { prisma } from '../services/prismaService';
import { EmailStatus } from '@prisma/client';

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

async function runElasticsearchAndBullBoardTests() {
  console.log('\n--- Running Phase 7: Elasticsearch Search & Bull Board Dashboard Test Suite ---\n');
  const app = createApp();

  // In-memory Elasticsearch mock engine for unit testing
  const esIndexStore = new Map<string, EmailDocument>();

  const originalIndicesExists = elasticClient.indices.exists;
  const originalIndicesCreate = elasticClient.indices.create;
  const originalIndex = elasticClient.index;
  const originalBulk = elasticClient.bulk;
  const originalUpdate = elasticClient.update;
  const originalSearch = elasticClient.search;

  try {
    // Mock Elasticsearch client methods
    elasticClient.indices.exists = (async () => false) as any;
    elasticClient.indices.create = (async () => ({ acknowledged: true })) as any;

    elasticClient.index = (async ({ id, document }: any) => {
      esIndexStore.set(id, document);
      return { result: 'created' };
    }) as any;

    elasticClient.bulk = (async ({ operations }: any) => {
      let count = 0;
      for (let i = 0; i < operations.length; i += 2) {
        const header = operations[i];
        const doc = operations[i + 1];
        if (header?.index?._id && doc) {
          esIndexStore.set(header.index._id, doc);
          count++;
        }
      }
      return { errors: false, items: Array(count).fill({ index: { status: 200 } }) };
    }) as any;

    elasticClient.update = (async ({ id, doc }: any) => {
      const existing = esIndexStore.get(id);
      if (existing) {
        esIndexStore.set(id, { ...existing, ...doc });
      }
      return { result: 'updated' };
    }) as any;

    elasticClient.search = (async ({ query, from, size }: any) => {
      let docs = Array.from(esIndexStore.values());

      // Filter by userId (tenant isolation)
      const userFilter = query?.bool?.filter?.find((f: any) => f.term?.userId);
      if (userFilter) {
        docs = docs.filter((d) => d.userId === userFilter.term.userId);
      }

      // Filter by status
      const statusFilter = query?.bool?.filter?.find((f: any) => f.term?.status);
      if (statusFilter) {
        docs = docs.filter((d) => d.status === statusFilter.term.status);
      }

      // Text search matching (recipient, subject, body)
      const multiMatch = query?.bool?.must?.[0]?.multi_match;
      if (multiMatch?.query) {
        const qLower = multiMatch.query.toLowerCase();
        docs = docs.filter(
          (d) =>
            d.recipient.toLowerCase().includes(qLower) ||
            d.subject.toLowerCase().includes(qLower) ||
            d.body.toLowerCase().includes(qLower)
        );
      }

      const total = docs.length;
      const paginated = docs.slice(from || 0, (from || 0) + (size || 20));

      return {
        hits: {
          total: { value: total, relation: 'eq' },
          hits: paginated.map((d) => ({
            _id: d.emailId,
            _score: 1.5,
            _source: d,
          })),
        },
      };
    }) as any;

    // TEST 1: Index Initialization & Mappings
    {
      console.log('[1] Elasticsearch Index Initialization:');
      const initialized = await elasticsearchService.initializeIndex();
      assert(initialized === true, 'Index was checked and initialized successfully');
    }

    // TEST 2: Email Document Indexing & Bulk Sync
    {
      console.log('\n[2] Document Indexing & Status Synchronization:');
      const sampleDoc: EmailDocument = {
        emailId: 'es-email-001',
        userId: 'user-es-001',
        campaignId: 'camp-es-001',
        senderId: 'sender-es-001',
        senderName: 'Sales Team',
        senderEmail: 'sales@reachinbox.ai',
        recipient: 'prospect@acmecorp.com',
        subject: 'ReachInbox Product Demo Invitation',
        body: 'We would love to show you our high-throughput email job scheduler.',
        status: EmailStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + 10000).toISOString(),
        idempotencyKey: 'idem-es-001',
        createdAt: new Date().toISOString(),
      };

      const indexed = await elasticsearchService.indexEmail(sampleDoc);
      assert(indexed === true, 'Single email indexed successfully');
      assert(esIndexStore.has('es-email-001'), 'Email document exists in Elasticsearch store');

      // Update status to SENT
      const sentTime = new Date();
      await elasticsearchService.updateEmailStatus('es-email-001', EmailStatus.SENT, sentTime);
      const updatedDoc = esIndexStore.get('es-email-001');
      assert(updatedDoc?.status === EmailStatus.SENT, 'Status in Elasticsearch updated to SENT');
      assert(updatedDoc?.sentAt === sentTime.toISOString(), 'sentAt timestamp correctly synchronized');
    }

    // TEST 3: Full-Text Search across Recipient, Subject, and Body
    {
      console.log('\n[3] Full-Text Multi-Field Search:');
      esIndexStore.clear();

      const docA: EmailDocument = {
        emailId: 'doc-a',
        userId: 'user-tenant-1',
        senderId: 'sender-1',
        recipient: 'john.doe@enterprise.com',
        subject: 'Q1 Partnership Discussion',
        body: 'Looking forward to our sync next Tuesday.',
        status: EmailStatus.SENT,
        scheduledAt: new Date().toISOString(),
        idempotencyKey: 'k-a',
        createdAt: new Date().toISOString(),
      };

      const docB: EmailDocument = {
        emailId: 'doc-b',
        userId: 'user-tenant-1',
        senderId: 'sender-1',
        recipient: 'marketing@startup.io',
        subject: 'Welcome to ReachInbox Platform',
        body: 'Here are your account credentials and getting started guide.',
        status: EmailStatus.SCHEDULED,
        scheduledAt: new Date().toISOString(),
        idempotencyKey: 'k-b',
        createdAt: new Date().toISOString(),
      };

      await elasticsearchService.bulkIndexEmails([docA, docB]);

      // Search by recipient
      const resRecipient = await elasticsearchService.searchEmails('user-tenant-1', { q: 'john.doe' });
      assert(resRecipient.hits.length === 1, 'Search by recipient finds exact match');
      assert(resRecipient.hits[0].emailId === 'doc-a', 'Found document matches doc-a');

      // Search by subject
      const resSubject = await elasticsearchService.searchEmails('user-tenant-1', { q: 'Partnership' });
      assert(resSubject.hits.length === 1 && resSubject.hits[0].emailId === 'doc-a', 'Search by subject term matches doc-a');

      // Search by body content
      const resBody = await elasticsearchService.searchEmails('user-tenant-1', { q: 'credentials' });
      assert(resBody.hits.length === 1 && resBody.hits[0].emailId === 'doc-b', 'Search by body content matches doc-b');

      // Tenant isolation: different user cannot see tenant 1's documents
      const resOtherUser = await elasticsearchService.searchEmails('user-tenant-2', { q: 'credentials' });
      assert(resOtherUser.hits.length === 0, 'Search strictly isolates results by authenticated userId');
    }

    // TEST 4: Search Status Filters
    {
      console.log('\n[4] Search Status Filtering:');
      const filteredSent = await elasticsearchService.searchEmails('user-tenant-1', { status: 'SENT' });
      assert(filteredSent.hits.length === 1 && filteredSent.hits[0].emailId === 'doc-a', 'Filtering by status = SENT returns only SENT emails');

      const filteredScheduled = await elasticsearchService.searchEmails('user-tenant-1', { status: 'SCHEDULED' });
      assert(filteredScheduled.hits.length === 1 && filteredScheduled.hits[0].emailId === 'doc-b', 'Filtering by status = SCHEDULED returns only SCHEDULED emails');
    }

    // TEST 5: Fallback to PostgreSQL Relational Queries
    {
      console.log('\n[5] Resilient Relational Database Search Fallback:');
      // Simulate Elasticsearch cluster crash
      elasticClient.search = (async () => {
        throw new Error('Elasticsearch cluster unavailable');
      }) as any;

      prisma.scheduledEmail.count = (async () => 1) as any;
      prisma.scheduledEmail.findMany = (async () => [
        {
          id: 'fallback-email-001',
          userId: 'user-tenant-1',
          campaignId: null,
          senderId: 'sender-1',
          recipient: 'fallback@example.com',
          subject: 'Fallback Subject',
          body: 'Fallback Body',
          status: EmailStatus.SENT,
          scheduledAt: new Date(),
          sentAt: new Date(),
          idempotencyKey: 'idem-fb-1',
          createdAt: new Date(),
          sender: { id: 'sender-1', email: 'sender@reachinbox.ai', name: 'Sender' },
          campaign: null,
        },
      ]) as any;

      const fallbackResult = await elasticsearchService.searchEmails('user-tenant-1', { q: 'Fallback' });
      assert(fallbackResult.source === 'database_fallback', 'Gracefully falls back to database_fallback without throwing 500 error');
      assert(fallbackResult.hits.length === 1, 'Returns matching emails from relational database');
    }

    // TEST 6: Search & Reindex REST API Endpoints
    {
      console.log('\n[6] Search & Reindex REST API Endpoints:');
      const searchRes = await request(app)
        .get('/api/emails/search?q=demo&page=1&limit=10')
        .set('x-user-id', 'user-tenant-1');

      assert(searchRes.status === 200, 'GET /api/emails/search returns 200 OK');
      assert(Array.isArray(searchRes.body.data), 'Returns array of matching emails');
      assert(searchRes.body.pagination.page === 1, 'Pagination metadata is returned');

      // Reindex endpoint
      const originalReindexAll = elasticsearchService.reindexAll;
      elasticsearchService.reindexAll = (async () => ({ totalFound: 5, totalIndexed: 5 })) as any;

      const reindexRes = await request(app)
        .post('/api/emails/reindex')
        .set('x-user-id', 'user-tenant-1');

      assert(reindexRes.status === 200, 'POST /api/emails/reindex returns 200 OK');
      assert(reindexRes.body.data.totalIndexed === 5, 'Returns reindex summary statistics');

      elasticsearchService.reindexAll = originalReindexAll;
    }

    // TEST 7: Bull Board Dashboard Authentication & Access Control
    {
      console.log('\n[7] Bull Board Dashboard Protection:');
      // 1. Unauthenticated request without headers or session cookie -> 401 Unauthorized
      const unauthRes = await request(app).get('/admin/queues');
      assert(unauthRes.status === 401, 'Unauthenticated request to /admin/queues returns 401 Unauthorized');
      assert(unauthRes.header['www-authenticate']?.includes('Basic'), 'Challenges browser with WWW-Authenticate Basic header');

      // 2. Request with HTTP Basic Authentication credentials -> 200 OK
      const basicAuthHeader = 'Basic ' + Buffer.from('admin:reachinbox2026').toString('base64');
      const authRes = await request(app)
        .get('/admin/queues/')
        .set('Authorization', basicAuthHeader);

      assert(authRes.status === 200, 'Authenticated request with Basic Auth returns 200 OK');
      assert(authRes.text.includes('BullBoard') || authRes.header['content-type']?.includes('html'), 'Bull Board UI dashboard is rendered');
    }
  } finally {
    // Restore original elasticClient methods
    elasticClient.indices.exists = originalIndicesExists;
    elasticClient.indices.create = originalIndicesCreate;
    elasticClient.index = originalIndex;
    elasticClient.bulk = originalBulk;
    elasticClient.update = originalUpdate;
    elasticClient.search = originalSearch;
  }

  console.log(`\n--- Elasticsearch & Bull Board Test Results: ${passed} passed, ${failed} failed ---\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runElasticsearchAndBullBoardTests().catch((err) => {
  console.error('Elasticsearch & Bull Board test suite failed:', err);
  process.exit(1);
});
