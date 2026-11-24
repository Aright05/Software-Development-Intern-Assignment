# ReachInbox Full-Stack Email Job Scheduler

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)]()
[![Node](https://img.shields.io/badge/Node.js-24-green.svg)]()
[![Prisma](https://img.shields.io/badge/Prisma-6.4-2D3748.svg)]()
[![BullMQ](https://img.shields.io/badge/BullMQ-5.41-red.svg)]()
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-8.17-yellow.svg)]()
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)]()

A high-performance, production-grade distributed email scheduling and campaign management engine built for the ReachInbox hiring assignment. Features database-backed job persistence, distributed Redis atomic rate limiting, multi-sender SMTP routing, real Google OAuth 2.0 & Slack OAuth 2.0 notifications, full-text Elasticsearch search, and live Bull Board queue monitoring.

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Key Features](#key-features)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Monorepo Directory Structure](#monorepo-directory-structure)
6. [Prerequisites](#prerequisites)
7. [Installation & Setup](#installation--setup)
8. [Environment Variable Configuration](#environment-variable-configuration)
9. [Infrastructure Services (Docker Compose)](#infrastructure-services-docker-compose)
   - [PostgreSQL Database](#postgresql-database)
   - [Redis Distributed Queue & Rate Limiter](#redis-distributed-queue--rate-limiter)
   - [Elasticsearch Full-Text Search](#elasticsearch-full-text-search)
10. [Third-Party Integrations Setup](#third-party-integrations-setup)
    - [Ethereal SMTP Configuration](#ethereal-smtp-configuration)
    - [Google OAuth 2.0 Setup](#google-oauth-20-setup)
    - [Slack OAuth 2.0 & Webhook Setup](#slack-oauth-20--webhook-setup)
11. [Running the Application](#running-the-application)
    - [1. Backend API Server](#1-backend-api-server)
    - [2. Independent BullMQ Worker Process](#2-independent-bullmq-worker-process)
    - [3. Frontend React Application](#3-frontend-react-application)
12. [Queue Monitoring (Bull Board Dashboard)](#queue-monitoring-bull-board-dashboard)
13. [Core Engineering & Architecture Deep Dive](#core-engineering--architecture-deep-dive)
    - [Strict No-Cron Policy & BullMQ Delayed Jobs](#strict-no-cron-policy--bullmq-delayed-jobs)
    - [Application Restart Persistence & Self-Healing Reconciliation](#application-restart-persistence--self-healing-reconciliation)
    - [Distributed Idempotency Guarantee](#distributed-idempotency-guarantee)
    - [Configurable Worker Concurrency Pool](#configurable-worker-concurrency-pool)
    - [Dual-Constraint Rate Limiting & Throttling Algorithm](#dual-constraint-rate-limiting--throttling-algorithm)
    - [Slack Rate-Limit Alert Pipeline](#slack-rate-limit-alert-pipeline)
    - [Elasticsearch Multi-Field Search & Transparent Database Fallback](#elasticsearch-multi-field-search--transparent-database-fallback)
14. [REST API Documentation](#rest-api-documentation)
15. [Testing & Verification Guide](#testing--verification-guide)
16. [Assumptions & Design Trade-offs](#assumptions--design-trade-offs)
17. [GitHub Repository Submission Guide](#github-repository-submission-guide)
18. [5-Minute Video Demonstration Checklist](#5-minute-video-demonstration-checklist)

---

## Project Overview

The **ReachInbox Email Job Scheduler** is an enterprise-grade outbound cold email infrastructure designed to reliably handle high-throughput scheduling while enforcing strict sender quotas and pacing constraints.

Unlike toy projects that rely on in-memory timers or cron expressions, this system implements:
- **Delayed Queue Architecture:** Schedules emails to the millisecond using BullMQ delayed jobs backed by persistent Redis.
- **Atomic Multi-Sender Rate Limiting:** Enforces minimum intervals between consecutive sends (e.g., 2s) and hourly caps (e.g., 100/hr) per sender using Redis Lua scripts.
- **Fail-Safe Crash Recovery:** Future scheduled emails survive complete API and worker restarts without creating duplicate jobs.
- **Zero Double-Sends:** Atomic conditional state transitions guarantee strict idempotency even under high concurrency.
- **Audit Trails:** Tracks every delivery attempt with message IDs, Ethereal preview URLs, and failure stack traces.

---

## Key Features

- **Responsive React Dashboard:** Pixel-perfect ReachInbox SaaS dashboard with Scheduled/Sent tabs, real-time status pills, and user profile management.
- **CSV & TXT Lead Importer:** In-browser parsing of CSV/TXT lead lists with email syntax validation, case-insensitive deduplication, and an interactive leads preview drawer.
- **Multi-Sender SMTP Management:** Connect and configure multiple SMTP accounts with independent host/port credentials, credentials encryption, and quota controls.
- **Ethereal Mail Delivery & Live Previews:** Dispatches emails via Nodemailer and displays 1-click links to view rendered HTML messages in Ethereal webmail.
- **Google OAuth 2.0 Authentication:** Secure OpenID Connect authorization with signed JWT session tokens and HttpOnly cookies.
- **Slack OAuth 2.0 Webhook Alerts:** Dispatches real-time Block Kit alerts to team Slack channels when a sender's hourly limit is reached.
- **Elasticsearch 8 Full-Text Search:** High-speed search across recipient, subject, and body with relevance boosting (`recipient^3`, `subject^2`, `body^1`) and database fallback resilience.
- **Bull Board Queue Monitoring:** Secure dashboard at `/admin/queues` visualizing active, waiting, delayed, completed, and failed jobs in real time.

---

## Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, Vite 6, TypeScript 5.7, Tailwind CSS 3.4, React Router 6, Axios, Lucide Icons |
| **Backend API** | Node.js 24, Express 4.21, TypeScript 5.7, Zod, Cookie-Parser, Helmet, CORS |
| **Database & ORM** | PostgreSQL 16, Prisma ORM 6.4 (UUID keys, relations, transactions) |
| **Queue & Engine** | BullMQ 5.41, Redis 7 (AOF + RDB persistence, Lua scripting) |
| **Search Engine** | Elasticsearch 8.17 (Custom mappings, multi-match queries) |
| **Email Transport** | Nodemailer 6.10 with Ethereal SMTP |
| **Authentication** | Google OAuth 2.0 (OpenID Connect), JWT, Secure Cookies |
| **Notifications** | Slack OAuth 2.0, Web API (`chat:write`), Block Kit messages |
| **Monitoring** | Bull Board Express Adapter (`@bull-board/express`) |
| **Infrastructure** | Docker Compose, Multi-container network with persistent volumes |

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React + Vite)"]
        UI[ReachInbox Web UI]
        CSV[CSV / TXT Parser & Validator]
        AuthUI[Google OAuth & Profile State]
    end

    subgraph API["Backend API (Node.js + Express)"]
        Router[REST API Router]
        AuthCtrl[Auth Controller & JWT]
        CampCtrl[Campaign & Scheduler Controller]
        SearchCtrl[Elasticsearch / DB Fallback Controller]
    end

    subgraph DataStore["Persistence & Storage"]
        PG[(PostgreSQL 16 - Prisma)]
        ES[(Elasticsearch 8 Search)]
    end

    subgraph QueueEngine["Distributed Queue & Rate Limiter"]
        R[(Redis 7 - BullMQ & Lua)]
        Q[email-scheduling-queue]
    end

    subgraph WorkerService["Independent Worker Process"]
        W[BullMQ Worker Pool\n5 Concurrency Slots]
        Throttle[Lua Atomic Rate Limiter\nMin Delay & Hourly Cap]
        SMTP[Nodemailer Transport Pool]
    end

    subgraph External["External Services"]
        Google[Google OAuth 2.0]
        Slack[Slack OAuth & Webhooks]
        Ethereal[Ethereal SMTP Server]
    end

    UI -->|HTTP / Cookies| Router
    CSV -->|Parsed Recipients| CampCtrl
    AuthUI -->|OAuth Redirect| Google
    Router --> AuthCtrl
    Router --> CampCtrl
    Router --> SearchCtrl

    CampCtrl -->|Prisma $transaction| PG
    CampCtrl -->|Bulk Schedule Delayed Jobs| Q
    CampCtrl -.->|Async Indexing| ES
    SearchCtrl -->|Full-Text Search| ES
    SearchCtrl -.->|Cluster Fallback| PG

    Q --> R
    W -->|Poll Delayed / Active Jobs| Q
    W -->|Atomic Token Reservation| Throttle
    Throttle -->|Lua Script| R
    Throttle -->|Quota Limit Reached| Slack
    W -->|Conditional Update State| PG
    W -->|SMTP Dispatch| SMTP
    SMTP -->|MIME Message| Ethereal
    SMTP -->|Preview URL & Msg ID| PG
```

---

## Monorepo Directory Structure

```text
reachinbox-scheduler/
├── .gitignore                      # Monorepo-level git ignore rules
├── docker-compose.yml              # PostgreSQL, Redis & Elasticsearch infrastructure
├── package.json                    # Root workspace orchestrator scripts
├── README.md                       # Comprehensive system documentation
│
├── backend/                        # Node.js + Express + TypeScript Backend
│   ├── .env.example                # Documented backend environment configuration template
│   ├── package.json                # Backend dependencies, tsx runner & test scripts
│   ├── tsconfig.json               # Backend TypeScript configuration
│   ├── prisma/
│   │   ├── schema.prisma           # Prisma schema (User, Sender, Campaign, Email, Slack)
│   │   └── migrations/             # Production migration SQL history
│   └── src/
│       ├── app.ts                  # Express application factory & middleware setup
│       ├── server.ts               # Primary HTTP API server entry point
│       ├── worker.ts               # Dedicated, independently runnable BullMQ worker
│       ├── config/                 # Zod validated configuration & service clients
│       │   ├── index.ts            # Environment schema & secrets validator
│       │   ├── redis.ts            # Global Redis connection singleton
│       │   ├── queueConnection.ts  # Isolated BullMQ Redis connections
│       │   ├── elasticsearch.ts    # Elasticsearch client instance
│       │   └── bullBoard.ts        # Bull Board queue adapter & dashboard route
│       ├── controllers/            # Request handlers (auth, campaigns, emails, senders, slack)
│       ├── middleware/             # Auth guard, Bull Board basic auth, error handler, logger
│       ├── queues/                 # BullMQ Queue instance definition
│       ├── routes/                 # Express REST endpoint routing
│       ├── scripts/                # Standalone CLI tools (reindex, test email sender)
│       ├── services/               # Core business services
│       │   ├── campaignService.ts  # Atomic campaign creation & batch scheduling
│       │   ├── emailJobService.ts  # Scheduled/sent email queries & stats aggregation
│       │   ├── emailService.ts     # Multi-sender Nodemailer transport pool
│       │   ├── elasticsearchService.ts # ES index mapping, search queries & DB fallback
│       │   ├── googleAuthService.ts    # Google OAuth 2.0 flow & profile sync
│       │   ├── rateLimiterService.ts   # Distributed Redis Lua rate limiting engine
│       │   ├── schedulerService.ts # Deterministic BullMQ delayed scheduling & recovery
│       │   ├── senderService.ts    # Sender CRUD & user isolation
│       │   ├── slackAuthService.ts # Slack OAuth 2.0 & token encryption
│       │   └── slackNotificationService.ts # Slack Block Kit rate limit alert dispatcher
│       ├── tests/                  # Automated integration & performance test suites
│       │   ├── api.test.ts         # REST API validation & user isolation tests (33 tests)
│       │   ├── scheduler.test.ts   # Delayed queue & recovery tests (22 tests)
│       │   ├── rateLimiter.test.ts # Redis Lua rate limiting & throttle tests (25 tests)
│       │   ├── authAndSlack.test.ts# OAuth & Slack integration tests (38 tests)
│       │   ├── elasticsearchAndBullBoard.test.ts # Search & dashboard tests (23 tests)
│       │   ├── integrationAudit.test.ts # 20-case full-stack requirement audit (20 tests)
│       │   └── loadTest.ts         # 1,000-job high-throughput benchmark
│       ├── utils/                  # Cryptographic helpers & Winston logger
│       ├── validators/             # Zod input schemas for query & payload validation
│       └── workers/                # BullMQ job processor & worker lifecycle
│
└── frontend/                       # React 18 + Vite + TypeScript Frontend
    ├── .env.example                # Documented frontend environment template
    ├── package.json                # Frontend dependencies
    ├── vite.config.ts              # Vite bundler configuration
    ├── tailwind.config.js          # Tailwind CSS theme extensions
    ├── tsconfig.json               # Frontend TypeScript configuration
    ├── index.html                  # HTML entry point
    └── src/
        ├── App.tsx                 # Root router & layout mounting
        ├── main.tsx                # React DOM client entry
        ├── components/
        │   ├── common/             # Navbar, Sidebar, StatusBadge, Skeleton, EmptyState, Pagination
        │   ├── compose/            # ComposeModal, CsvUploader (parser & leads preview)
        │   ├── emails/             # ScheduledEmailsTable, SentEmailsTable, EmailDetailModal
        │   └── senders/            # CreateSenderModal, TestEmailModal
        ├── hooks/                  # useAuth, useToast, useDebounce custom hooks
        ├── layouts/                # DashboardLayout with modal orchestrator
        ├── pages/                  # Dashboard, JobHistory, ScheduleEmail, Senders, NotFound
        ├── services/               # Typed Axios REST API client
        ├── types/                  # TypeScript interfaces matching backend models
        └── utils/                  # CSV parser, email validator, date formatters
```

---

## Prerequisites

Ensure you have the following installed on your host system:
- **Node.js:** v18.0.0 or higher (v24 LTS recommended)
- **npm:** v9.0.0 or higher
- **Docker & Docker Compose:** For running PostgreSQL, Redis, and Elasticsearch
- **Git:** For source control and submission

---

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <your-repository-url> reachinbox-scheduler
   cd reachinbox-scheduler
   ```

2. **Install backend dependencies:**
   ```bash
   npm --prefix backend install
   ```

3. **Install frontend dependencies:**
   ```bash
   npm --prefix frontend install
   ```

4. **Generate Prisma Client:**
   ```bash
   npx --prefix backend prisma generate
   ```

---

## Environment Variable Configuration

### 1. Backend Environment (`backend/.env`)

Copy `backend/.env.example` to `backend/.env`:
```bash
cp backend/.env.example backend/.env
```

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Backend API HTTP server port | `5000` |
| `NODE_ENV` | Application runtime environment | `development` |
| `API_PREFIX` | Versioned REST API path prefix | `/api/v1` |
| `FRONTEND_URL` | Frontend origin for CORS and OAuth redirects | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/reachinbox_scheduler?schema=public` |
| `REDIS_HOST` | Redis server hostname | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `REDIS_PASSWORD` | Redis authentication password (optional) | `""` |
| `EMAIL_QUEUE_NAME` | BullMQ queue namespace | `email-scheduling-queue` |
| `WORKER_CONCURRENCY` | Maximum simultaneous worker execution slots | `5` |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | Minimum pacing interval between sends per sender | `2000` (2 seconds) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER`| Maximum allowed sends per sender per UTC hour | `100` |
| `ELASTICSEARCH_NODE` | Elasticsearch HTTP endpoint | `http://localhost:9200` |
| `ELASTICSEARCH_INDEX` | Elasticsearch email document index | `reachinbox_emails` |
| `SMTP_HOST` | Fallback SMTP server host | `smtp.ethereal.email` |
| `SMTP_PORT` | Fallback SMTP server port | `587` |
| `SMTP_SECURE` | Enable SSL/TLS transport (true for port 465) | `false` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console OAuth Client ID | `your-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth Client Secret | `your-google-client-secret` |
| `GOOGLE_CALLBACK_URL` | Google OAuth authorized redirect URI | `http://localhost:5000/api/v1/auth/google/callback` |
| `SLACK_CLIENT_ID` | Slack App OAuth Client ID | `your-slack-client-id` |
| `SLACK_CLIENT_SECRET` | Slack App OAuth Client Secret | `your-slack-client-secret` |
| `BULL_BOARD_PATH` | Mount path for queue monitoring dashboard | `/admin/queues` |

### 2. Frontend Environment (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:
```bash
cp frontend/.env.example frontend/.env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Backend REST API base URL | `http://localhost:5000/api/v1` |
| `VITE_BULL_BOARD_URL` | Direct URL to Bull Board dashboard | `http://localhost:5000/admin/queues` |
| `VITE_APP_TITLE` | Application browser title | `ReachInbox Email Scheduler` |

---

## Infrastructure Services (Docker Compose)

Start the backing services using Docker Compose:

```bash
docker compose up -d
```

### PostgreSQL Database
- **Container:** `reachinbox-postgres` (Image: `postgres:16-alpine`)
- **Port:** `5432`
- **Volume:** `postgres_data` (Persistent relational storage)
- **Healthcheck:** Validates connection with `pg_isready`

Run database migrations:
```bash
npx --prefix backend prisma migrate dev --name init
```

### Redis Distributed Queue & Rate Limiter
- **Container:** `reachinbox-redis` (Image: `redis:7-alpine`)
- **Port:** `6379`
- **Volume:** `redis_data`
- **Persistence Flags:**
  - `--appendonly yes`: Enables Append-Only File (AOF) persistence.
  - `--appendfsync everysec`: Fsyncs logs to disk every second to prevent data loss.
  - `--save 60 1`: Creates RDB snapshot if at least 1 key changes within 60 seconds.

### Elasticsearch Full-Text Search
- **Container:** `reachinbox-elasticsearch` (Image: `elasticsearch:8.13.4`)
- **Port:** `9200`
- **Configuration:** Single-node development cluster with security disabled for local development (`xpack.security.enabled=false`).
- **Index:** `reachinbox_emails`

---

## Third-Party Integrations Setup

### Ethereal SMTP Configuration
Ethereal Email is a fake SMTP service used for development and testing.

1. **Automatic Test Accounts:** The system automatically generates ephemeral Ethereal test accounts via `nodemailer.createTestAccount()` when credentials are left empty.
2. **Custom Account:** To persist messages in a single mailbox:
   - Visit [https://ethereal.email/create](https://ethereal.email/create) to generate credentials.
   - Enter your username and password into `backend/.env`:
     ```ini
     SMTP_USER=your_user@ethereal.email
     SMTP_PASS=your_password
     ```
3. **Inspecting Delivered Messages:** Every sent email in the dashboard includes an **Ethereal Preview** button that opens the message rendered with headers and HTML content in your browser.

### Google OAuth 2.0 Setup
1. Open the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Create a new OAuth 2.0 Client ID with application type **Web Application**.
3. Add Authorized Redirect URI:
   ```
   http://localhost:5000/api/v1/auth/google/callback
   ```
4. Copy the Client ID and Client Secret into `backend/.env`.

### Slack OAuth 2.0 & Webhook Setup
1. Navigate to [Slack API Apps](https://api.slack.com/apps) and create an app.
2. Under **OAuth & Permissions**, add the following Bot Token Scope:
   - `chat:write`: Required to post rate-limit notifications into channels.
3. Set the Redirect URL:
   ```
   http://localhost:5000/api/v1/slack/callback
   ```
4. Copy the Client ID and Client Secret into `backend/.env`.

---

## Running the Application

For true modularity, the API server and worker process run independently.

### 1. Backend API Server
In your first terminal, start the Express API process:
```bash
npm --prefix backend run dev
```
*API Server will listen on [http://localhost:5000](http://localhost:5000).*

### 2. Independent BullMQ Worker Process
In your second terminal, start the dedicated background worker:
```bash
npm --prefix backend run worker
```
*The worker reconciles missing jobs upon boot, monitors delayed queues, and executes SMTP delivery.*

### 3. Frontend React Application
In your third terminal, start the Vite development server:
```bash
npm --prefix frontend run dev
```
*Frontend application will open at [http://localhost:5173](http://localhost:5173).*

---

## Queue Monitoring (Bull Board Dashboard)

Bull Board provides a real-time visual interface for BullMQ:

- **URL:** [http://localhost:5000/admin/queues](http://localhost:5000/admin/queues)
- **Security:** Protected by dual authentication:
  1. Active user session cookie (`reachinbox_session`), or
  2. HTTP Basic Authentication:
     - **Username:** `admin`
     - **Password:** `reachinbox2026`
- **Capabilities:**
  - View real-time job counts: **Active**, **Waiting**, **Delayed**, **Completed**, and **Failed**.
  - Inspect job payloads, stack traces, and delays.
  - Manually retry failed jobs or purge completed entries.

---

## Core Engineering & Architecture Deep Dive

### Strict No-Cron Policy & BullMQ Delayed Jobs
Traditional cron jobs are prone to missed executions across reboots and require constant polling. This engine **never uses cron**. 

Instead, every email is scheduled as a **BullMQ delayed job**:
```typescript
const delay = Math.max(0, new Date(email.scheduledAt).getTime() - Date.now());

await emailQueue.add(EMAIL_JOB_NAME, payload, {
  delay,
  jobId: email.id, // Deterministic Job ID derived directly from database record
});
```
BullMQ stores delayed jobs in a Redis Sorted Set (`zset`) with the score set to `timestamp + delay`. When the scheduled time arrives, Redis atomically moves the job to the active stream.

### Application Restart Persistence & Self-Healing Reconciliation
If the API server or worker process crashes, no scheduled jobs are lost:
1. **Source of Truth:** Scheduled emails are committed to PostgreSQL inside an atomic Prisma transaction before queueing.
2. **Worker Boot Reconciliation:** When `worker.ts` starts, `recoverPendingJobs()` runs automatically:
   ```typescript
   const pendingEmails = await prisma.scheduledEmail.findMany({
     where: { status: { in: [EmailStatus.SCHEDULED, EmailStatus.PENDING] } }
   });

   for (const email of pendingEmails) {
     // Re-enqueues into BullMQ using the same deterministic jobId.
     // If the job already exists in Redis, BullMQ rejects the duplicate.
     await schedulerService.scheduleEmail(email);
   }
   ```

### Distributed Idempotency Guarantee
To prevent an email from being dispatched twice under worker competition or retry events, the worker performs an **atomic conditional update** in PostgreSQL:
```typescript
const updateResult = await prisma.scheduledEmail.updateMany({
  where: {
    id: emailId,
    status: { in: [EmailStatus.SCHEDULED, EmailStatus.PENDING] },
  },
  data: {
    status: EmailStatus.PROCESSING,
    attempts: { increment: 1 },
  },
});

if (updateResult.count === 0) {
  // Another worker already claimed the row or the job was completed
  return { skipped: true, reason: 'ALREADY_PROCESSED' };
}
```
Only the worker thread that successfully transitions the row from `SCHEDULED` to `PROCESSING` proceeds to SMTP transmission.

### Configurable Worker Concurrency Pool
Worker concurrency is governed by the `WORKER_CONCURRENCY` environment variable (default: `5`):
```typescript
export const emailWorker = new Worker<EmailJobPayload>(
  EMAIL_QUEUE_NAME,
  jobProcessor,
  {
    connection: redisQueueConnection,
    concurrency: config.queue.workerConcurrency,
    lockDuration: 30000, // 30s lock duration prevents stalled job stealing
  }
);
```

### Dual-Constraint Rate Limiting & Throttling Algorithm
Rate limiting is evaluated atomically using an optimized Redis Lua script:
1. **Constraint 1 (Pacing):** Ensures at least `MIN_DELAY_BETWEEN_EMAILS_MS` (e.g., 2000ms) has elapsed since the sender's last email.
2. **Constraint 2 (Hourly Quota):** Limits total sends per sender per UTC hour window to `MAX_EMAILS_PER_HOUR_PER_SENDER` (e.g., 100/hr).

**Redis Key Schema:**
- `ratelimit:sender:{senderId}:last_sent`: Unix timestamp of last dispatch.
- `ratelimit:sender:{senderId}:hour:{YYYYMMDDHH}`: Integer counter tracking dispatches in the current UTC hour.

**Non-Blocking Rescheduling:**
If a sender's hourly limit is reached, the worker **never blocks or sleeps**. It computes the exact delay to the start of the next UTC hour:
```typescript
const now = new Date();
const nextHour = new Date(now);
nextHour.setUTCHours(nextHour.getUTCHours() + 1, 0, 0, 0);
const delayMs = nextHour.getTime() - now.getTime();

await schedulerService.rescheduleWithDelay(emailId, delayMs);
```
The job returns immediately (<1ms), freeing up the worker concurrency slot for other senders.

### Slack Rate-Limit Alert Pipeline
When a sender exhausts their hourly quota, the worker dispatches a Slack Block Kit notification:
```
🚨 ReachInbox Rate Limit Alert
Sender "Growth Team" has reached the hourly limit of 100 emails.
Remaining jobs have been automatically rescheduled for the next UTC hour.
```
**Deduplication:** Uses a temporary Redis key (`notif:ratelimit:sender:{id}:hour:{YYYYMMDDHH}`) with a 3600-second TTL so the user workspace is notified exactly once per rate-limited hour.

### Elasticsearch Multi-Field Search & Transparent Database Fallback
- **Index Mapping:** Analyzes recipient, sender, subject, and body fields with dedicated keyword subfields for exact filtering.
- **Query Boosting:**
  ```json
  "multi_match": {
    "query": "partnership",
    "fields": ["recipient^3", "subject^2", "body^1"]
  }
  ```
- **Transparent Fallback:** If the Elasticsearch container is stopped or unreachable, `searchEmails()` automatically catches the network error and falls back to a PostgreSQL relational query using `contains`:
  ```typescript
  try {
    return await esClient.search(...);
  } catch (err) {
    logger.warn('Elasticsearch unavailable. Falling back to PostgreSQL.');
    return await searchDatabaseFallback(...);
  }
  ```

---

## REST API Documentation

All API routes are prefixed with `/api` and `/api/v1`.

### 1. Authentication
- `GET /api/v1/auth/google` - Initiate Google OAuth 2.0 redirect.
- `GET /api/v1/auth/google/callback` - OAuth code exchange, user sync, and session cookie issue.
- `GET /api/v1/auth/me` - Retrieve current authenticated user profile.
- `POST /api/v1/auth/logout` - Clear session cookie.

### 2. Campaigns
- `POST /api/v1/campaigns` - Atomically create an email campaign and schedule delayed jobs.
- `GET /api/v1/campaigns` - List user campaigns with pagination and filters.

### 3. Emails
- `GET /api/v1/emails/scheduled` - List scheduled and pending delayed emails.
- `GET /api/v1/emails/sent` - List delivered emails with sent timestamps and metadata.
- `GET /api/v1/emails/stats` - Return aggregate status counts (`SCHEDULED`, `SENT`, `PROCESSING`, `FAILED`).
- `GET /api/v1/emails/search` - Full-text search across recipient, subject, and body via Elasticsearch.
- `GET /api/v1/emails/:id` - Fetch single email audit details.
- `POST /api/v1/emails/test-send` - Dispatch an immediate test email and receive Ethereal preview link.
- `POST /api/v1/emails/reindex` - Bulk reindex all database email records into Elasticsearch.

### 4. Senders
- `POST /api/v1/senders` - Create a new SMTP sender configuration.
- `GET /api/v1/senders` - List all configured senders for the tenant.

### 5. Slack Integration
- `GET /api/v1/slack/connect` - Initiate Slack OAuth authorization.
- `GET /api/v1/slack/callback` - Exchange Slack code and store encrypted bot token.
- `GET /api/v1/slack/status` - Check Slack connection status.
- `POST /api/v1/slack/disconnect` - Disconnect workspace integration.
- `POST /api/v1/slack/test-notify` - Send a sample alert notification to Slack.

---

## Testing & Verification Guide

The project includes an automated test harness covering unit, integration, and load tests.

```bash
# 1. Run all core backend test suites (141 tests)
npm --prefix backend run test

# 2. Run the 20-Case Integration Audit Suite
npm --prefix backend run test:audit

# 3. Run the Frontend CSV & Formatter Suite
npm --prefix backend run test:csv

# 4. Run the 1,000-Job High-Throughput Load Test
npm --prefix backend run test:load

# 5. Run full monorepo typecheck
npm run typecheck

# 6. Run frontend production build
npm --prefix frontend run build
```

---

## Assumptions & Design Trade-offs

1. **BullMQ Delayed Queues over Cron:** Cron jobs introduce polling overhead and fail to recover if the process is down during the trigger window. Delayed jobs with deterministic IDs provide resilient execution and native retry handling.
2. **Elasticsearch as an Accelerator:** Elasticsearch is treated as a secondary search index. The relational database (PostgreSQL) remains the sole authoritative source of truth. If Elasticsearch becomes unavailable, search transparently falls back to PostgreSQL.
3. **Optimistic Rate Limit Reservation:** Rate limit slots are reserved atomically before calling Nodemailer. If SMTP fails due to a network timeout, the slot is consumed to prevent runaway spamming of degraded mail servers.
4. **Token Encryption:** Slack OAuth tokens are encrypted at rest in PostgreSQL using AES-256-GCM.

---

## GitHub Repository Submission Guide

To prepare this repository for private evaluation on GitHub:

1. **Create a Private GitHub Repository:**
   - Navigate to [https://github.com/new](https://github.com/new).
   - Set repository name: `reachinbox-email-scheduler`.
   - Set visibility to **Private**.
   - Do **NOT** initialize with README or .gitignore (this project already includes them).

2. **Push Local Code:**
   ```bash
   git add .
   git commit -m "feat: complete ReachInbox Full-Stack Email Job Scheduler"
   git remote add origin https://github.com/<your-username>/reachinbox-email-scheduler.git
   git push -u origin main
   ```

3. **Grant Evaluator Access:**
   - In your repository, click **Settings** > **Collaborators** > **Add people**.
   - Invite the following accounts:
     - **Mitrajit**
     - **Yadav036**
   - Click **Add to repository**.

---

## 5-Minute Video Demonstration Checklist

Follow this sequence to demonstrate all core capabilities in your recorded demo:

- [ ] **1. Google Login (0:00 - 0:45)**
  - Open `http://localhost:5173`.
  - Click **Sign in with Google**.
  - Show user profile in the top-right corner with authenticated name, email, and avatar.
- [ ] **2. System Dashboard (0:45 - 1:15)**
  - Walk through the metrics cards: Scheduled Queue, Delivered Total, Processing, and Failed.
  - Review the Services Health indicators (API, PostgreSQL, Redis, Elasticsearch).
- [ ] **3. CSV Upload & Email Scheduling (1:15 - 2:00)**
  - Click **Compose Email**.
  - Drag and drop a sample CSV file containing 10-20 email addresses.
  - Show the automatic detection of valid leads and filtering of duplicates/invalid entries.
  - Expand the **Preview Leads** drawer to show individual validation statuses.
  - Configure delay (e.g., 5 seconds) and click **Schedule Campaign**.
- [ ] **4. Scheduled Emails Table (2:00 - 2:45)**
  - Navigate to **Emails Hub** > **Scheduled Emails** tab.
  - Demonstrate real-time status badges (`SCHEDULED`, `PROCESSING`).
  - Click an email to open the **Job Audit Modal** showing BullMQ job ID and idempotency key.
- [ ] **5. Ethereal Email Delivery (2:45 - 3:15)**
  - Switch to the **Sent Emails** tab.
  - Click **Ethereal Preview** on any sent message to open the rendered email in Ethereal webmail.
- [ ] **6. Server Restart & Job Persistence (3:15 - 3:50)**
  - In your terminal, stop the backend API server (`Ctrl+C`) and worker (`Ctrl+C`).
  - Demonstrate that future scheduled emails remain visible in the dashboard.
  - Restart the worker process and observe the recovery logs re-enqueuing pending jobs without duplicates.
- [ ] **7. Rate Limiting & Slack Notification (3:50 - 4:45)**
  - Navigate to **Senders & SMTP**.
  - Show the **Slack Integration** card in connected state.
  - Click **Test Notification** to trigger a real Slack rate-limit alert message.
  - Display the formatted Slack alert received in your workspace channel.
- [ ] **8. Bull Board Queue Dashboard (4:45 - 5:00)**
  - Open `/admin/queues` in your browser.
  - Authenticate with `admin:reachinbox2026`.
  - Show the active, delayed, and completed jobs visible in real time.
