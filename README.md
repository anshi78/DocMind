
---

## What is DocuMind?

DocuMind is a **production-grade Retrieval-Augmented Generation (RAG) platform** that lets teams upload PDF and Markdown documents, then query them using natural language — receiving AI-generated answers with inline citations pointing back to the exact source passage.

Built as a real SaaS product with **multi-tenancy**, **Stripe billing**, **streaming responses**, and a **hybrid search pipeline** (semantic + keyword fusion), DocuMind demonstrates how a modern AI engineering system is architected from scratch.

```
You ask:   "What was the revenue growth in Q3?"

DocuMind:  "Revenue grew by 23% year-over-year, reaching $4.2B in Q3 2024
            [Source 1]. This exceeded analyst expectations by 3.1% [Source 3]."

            ┌─ Source 1 ──────────────────────────┐
            │ q3_report.pdf · Page 7              │
            │ Relevance: 94%                      │
            └─────────────────────────────────────┘
```

---

## Feature Highlights

| Category | Features |
|---|---|
| **Document Processing** | PDF parsing, Markdown support, async ingestion pipeline, version control |
| **AI Search** | Semantic search (pgvector HNSW), BM25 full-text, Reciprocal Rank Fusion hybrid |
| **Chat Interface** | Streaming responses (SSE), inline citations, conversation history, context scoping |
| **Multi-Tenancy** | Organizations, role-based access (owner/admin/member), invite system |
| **Embeddings** | OpenAI `text-embedding-3-small`, Gemini `text-embedding-004`, pluggable abstraction |
| **LLM Layer** | GPT-4o-mini streaming, context window management, source attribution |
| **Billing** | Stripe integration, Free/Pro/Enterprise plans, usage tracking, billing portal |
| **Webhooks** | Outbound event delivery, HMAC signing, retry with exponential backoff |
| **Security** | JWT + refresh rotation, API keys (SHA-256), rate limiting, SSRF prevention |
| **Caching** | Redis query/response/embedding cache, sliding window rate limiter |
| **Observability** | Structured JSON logging, Sentry error tracking, request tracing |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENTS                                                    │
│  Next.js App (SSR)  │  API Clients (REST)  │  Webhooks     │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS / SSE
┌────────────────────────────▼────────────────────────────────┐
│  GATEWAY — FastAPI                                          │
│  JWT/API Key Auth · Org Scoping · Rate Limiting · CORS      │
└────┬──────────────┬──────────────┬──────────────┬───────────┘
     │              │              │              │
┌────▼───┐    ┌─────▼──┐    ┌─────▼──┐    ┌─────▼──┐
│Ingest  │    │Retrieval│    │Chat/LLM│    │Billing │  SERVICES
│Pipeline│    │Hybrid   │    │Stream  │    │Stripe  │
└────┬───┘    └─────┬───┘    └─────┬──┘    └─────┬──┘
     │              │              │              │
┌────▼──────────────▼──────────────▼──────────────▼──────────┐
│  DATA                                                       │
│  PostgreSQL + pgvector  │  Redis  │  Object Storage        │
│  (HNSW vector index)    │  Cache  │  ARQ Job Queue         │
└─────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  EXTERNAL APIs                                              │
│  OpenAI  │  Gemini  │  Stripe  │  SendGrid  │  Sentry       │
└─────────────────────────────────────────────────────────────┘
```

### RAG Pipeline

```
PDF / Markdown Upload
        │
        ▼
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │   Parser    │────▶│   Chunker    │────▶│  Embeddings     │
  │ pypdf/MD    │     │ Recursive    │     │ OpenAI / Gemini  │
  │ per-page    │     │ 1000 tokens  │     │ batched API call │
  └─────────────┘     │ 200 overlap  │     └────────┬────────┘
                      └──────────────┘              │
                                                    ▼
                                         ┌──────────────────┐
                                         │  pgvector Store  │
                                         │  HNSW index      │
                                         │  + tsvector FTS  │
                                         └──────────────────┘

Query
  │
  ├──▶ Embed query ──▶ Vector Search (cosine ANN)  ──┐
  │                                                  ├──▶ RRF Fusion ──▶ Top-8 ──▶ LLM ──▶ Stream
  └──▶ Parse query ──▶ BM25 Full-Text Search    ──────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 App Router, TypeScript | Server Components + native SSE streaming |
| **UI** | Tailwind CSS, shadcn/ui | Consistent design system, dark mode |
| **State** | TanStack Query, Zustand | Server + client state separation |
| **Backend** | FastAPI, Python 3.11 | Async-native, auto OpenAPI docs, Pydantic v2 |
| **Database** | PostgreSQL 16 + pgvector | ACID + vector search in one query, no split-brain |
| **Vector Index** | HNSW (pgvector) | ANN at 95%+ recall, no extra infra |
| **Cache + Queue** | Redis 7 + ARQ | 5 data structures, async job queue |
| **Embeddings** | OpenAI / Gemini | Pluggable abstraction, per-document model tracking |
| **LLM** | GPT-4o-mini | Streaming, low cost, citation-capable |
| **Billing** | Stripe | Industry standard, webhook testing with CLI |
| **Deploy** | Railway | Zero DevOps, managed Postgres + Redis |
| **Monitoring** | Sentry, structlog | Error tracking + structured JSON logs |

---

## Getting Started

### Prerequisites

```bash
python3 --version    # 3.11+
node --version       # 20+
docker --version     # 24+
```

### Quick Start (Docker)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/documind.git
cd documind

# 2. Set up environment
cp .env.example .env
# Edit .env — add your OPENAI_API_KEY at minimum

# 3. Start infrastructure
cd docker && docker compose up -d postgres redis

# 4. Run migrations
cd ../backend
# macOS/Linux (requires Python 3.11+): python3 -m venv .venv && source .venv/bin/activate
# Windows (requires Python 3.11+): py -3.12 -m venv .venv && .venv\Scripts\activate
pip install -e ".[dev]"
alembic upgrade head

# 5. Start backend
uvicorn app.main:app --reload --port 8000

# 6. Start worker (new terminal)
arq app.workers.tasks.ingest.WorkerSettings

# 7. Start frontend (new terminal)
cd ../frontend
npm install && npm run dev

# 8. Open http://localhost:3000
```

### Manual Setup

<details>
<summary>Click to expand full manual setup</summary>

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -e ".[dev]"

# Database (requires running PostgreSQL with pgvector)
alembic upgrade head

# Start API server
uvicorn app.main:app \
  --reload \
  --port 8000 \
  --log-level debug

# Start async worker (separate terminal)
arq app.workers.tasks.ingest.WorkerSettings

# Frontend
cd ../frontend
npm install
npm run dev
```

</details>

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
# Required — the app will not start without these
SECRET_KEY=          # python3 -c "import secrets; print(secrets.token_hex(32))"
OPENAI_API_KEY=      # https://platform.openai.com/api-keys

# Required for billing
STRIPE_SECRET_KEY=   # https://dashboard.stripe.com/apikeys
STRIPE_WEBHOOK_SECRET=

# Required for email
SENDGRID_API_KEY=    # https://app.sendgrid.com/settings/api_keys

# Optional but recommended for production
GEMINI_API_KEY=      # https://aistudio.google.com/app/apikey (Optional — app falls back to OpenAI)
SENTRY_DSN=          # https://sentry.io
```

> **Full `.env.example`** with all variables and descriptions is in the repository root.

### 🗄️ Railway Database Environment Variables

When you provision a PostgreSQL instance on Railway, the platform automatically generates and injects the following environment variables. The FastAPI backend is configured to automatically detect and use these for connection pooling:

| Variable | Example Value / Description |
|---|---|
| `DATABASE_URL` | `postgresql://postgres:<password>@postgres.railway.internal:5432/railway` |
| `PGDATA` | `/var/lib/postgresql/data/pgdata` |
| `PGDATABASE` | `railway` |
| `PGHOST` | `postgres.railway.internal` |
| `PGPASSWORD` | `<your-db-password>` |
| `PGPORT` | `5432` |
| `PGUSER` | `postgres` |
| `POSTGRES_DB` | `railway` |
| `POSTGRES_PASSWORD` | `<your-db-password>` |
| `POSTGRES_USER` | `postgres` |
| `RAILWAY_ENVIRONMENT` | `production` |
| `RAILWAY_PRIVATE_DOMAIN` | `postgres.railway.internal` |
| `RAILWAY_PROJECT_NAME` | `DocMind` |
| `RAILWAY_SERVICE_NAME` | `Postgres` |

*Note: In your Railway `backend` and `worker` service settings, you can bind these variables directly by referencing the PostgreSQL database service.*

---


## Demo Mode & Cost Control

DocuMind uses live AI APIs (OpenAI, optionally Gemini) which cost real money. To prevent runaway costs during demos or recruiter reviews:

### Built-in Usage Limits (Free Plan)

The Free plan enforces strict limits that prevent excessive API spending:

| Resource | Free Plan Limit | Estimated Max Cost |
|---|---|---|
| RAG Queries | 50 / month | ~$1.50 (GPT-4o-mini) |
| Documents | 5 total | ~$0.10 (embedding cost) |
| Storage | 50 MB | — |
| Team Members | 2 | — |

When a limit is reached, the API returns `402 Payment Required` with a clear upgrade message.

### Adjusting Limits

To change Free plan limits, edit `backend/app/db/seed.py` and re-run:
```bash
cd backend && python -m app.db.seed
```

### Cost Per Query

| Operation | Model | Approx. Cost |
|---|---|---|
| Embedding (per chunk) | text-embedding-3-small | $0.000002 |
| Chat query (avg) | GPT-4o-mini | $0.01-0.03 |
| Full demo session | Mixed | $0.50-2.00 |

### Gemini as Free Alternative

Set `DEFAULT_EMBEDDING_PROVIDER=gemini` and `DEFAULT_LLM_PROVIDER=gemini` with a `GEMINI_API_KEY` to use Google's free tier. If the Gemini API key is not set, the app **gracefully falls back to OpenAI** with a warning log — it will never crash.

---

## Project Structure

```
documind/
├── backend/                    FastAPI application
│   ├── app/
│   │   ├── api/v1/             Route handlers (auth, docs, chat, search...)
│   │   ├── core/               Config, security, exceptions, middleware
│   │   ├── db/                 SQLAlchemy models + Alembic migrations
│   │   ├── services/
│   │   │   ├── ingestion/      PDF/MD parser, recursive chunker, pipeline
│   │   │   ├── embeddings/     OpenAI + Gemini providers (pluggable)
│   │   │   ├── retrieval/      Vector search, BM25, hybrid RRF fusion
│   │   │   ├── llm/            Context builder, streaming, citations
│   │   │   ├── billing/        Stripe integration, plan enforcement
│   │   │   └── webhooks/       Outbound delivery, retry, HMAC signing
│   │   ├── workers/            ARQ async tasks (document ingestion)
│   │   └── cache/              Redis client, cache manager, rate limiter
│   └── tests/                  Unit + integration test suite
│
├── frontend/                   Next.js 14 App Router
│   └── src/
│       ├── app/                Pages: auth, dashboard, chat, documents
│       ├── components/         UI components (chat, upload, layout)
│       ├── lib/                API client, Zustand stores, SSE streaming
│       └── types/              Shared TypeScript types
│
├── docker/                     Dockerfiles + Compose
└── scripts/                    Deployment + maintenance scripts
```

---

## API Reference

Interactive docs at `/docs` (development only). Core endpoints:

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Create account + organization |
| `POST` | `/api/v1/auth/login` | Authenticate, returns JWT + refresh cookie |
| `POST` | `/api/v1/auth/refresh` | Rotate access token using refresh cookie |
| `POST` | `/api/v1/auth/logout` | Clear refresh token cookie |

### Documents
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/documents/` | Upload PDF or Markdown (async processing) |
| `GET` | `/api/v1/documents/` | List org documents (paginated) |
| `GET` | `/api/v1/documents/{id}` | Get document + processing status |
| `DELETE` | `/api/v1/documents/{id}` | Soft delete document |
| `GET` | `/api/v1/documents/{id}/versions` | List document versions |

### Search & Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/search/` | Hybrid semantic + keyword search |
| `POST` | `/api/v1/chat/conversations` | Create conversation |
| `POST` | `/api/v1/chat/conversations/{id}/messages` | Send message (SSE stream) |
| `GET` | `/api/v1/chat/conversations` | List conversations |

### Organization & Billing
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/orgs` | List user's organizations |
| `POST` | `/api/v1/orgs/{id}/invites` | Invite member by email |
| `GET` | `/api/v1/billing/plans` | List available plans |
| `POST` | `/api/v1/billing/checkout` | Create Stripe checkout session |
| `POST` | `/api/v1/webhooks/stripe` | Stripe inbound webhook handler |

---

## Database Schema

15 tables covering all domains:

```
organizations ──< org_memberships >── users
      │                                 │
      ├──< subscriptions >── plans      ├──< api_keys
      ├──< invites                      └──< conversations ──< messages ──< citations
      ├──< documents                                                              │
      │      └──< document_versions                                               │
      │               └──< chunks ──< embeddings                                 │
      │                      └────────────────────────────────────────────────────┘
      └──< webhook_endpoints ──< webhook_deliveries

usage_events (append-only audit log, partitioned by month)
```

Key design decisions:
- **Everything org-scoped** — multi-tenancy enforced at DB level
- **pgvector HNSW index** — ANN vector search, no separate vector database
- **Soft deletes** — `deleted_at` timestamp, data preserved until purged
- **UUID primary keys** — no sequential ID leakage

---

## Testing

```bash
# Backend — unit tests (no I/O, fast)
cd backend && pytest -m unit -v

# Backend — integration tests (requires PostgreSQL + Redis)
pytest -m integration -v

# Backend — full suite with coverage
pytest --cov=app --cov-report=html
open htmlcov/index.html

# Frontend — component + hook tests
cd frontend && npm test -- --run

# Frontend — with coverage
npm run test:coverage
```

Coverage targets: **80%+ backend**, **70%+ frontend**

### What's tested:
- **Security** — JWT validation, token confusion, timing attacks, API key hashing
- **Chunking** — no content loss, overlap preserved, paragraph boundaries respected
- **Retrieval** — RRF math correctness, graceful degradation, deduplication
- **Auth API** — register, login, cookies, inactive users, no user enumeration
- **Documents API** — upload, list, delete, tenant isolation, soft delete
- **Ingestion pipeline** — full parse→chunk→embed→store, failure handling
- **Frontend** — components render, citations display, streaming cursor

---

## Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login

# Create project with managed Postgres + Redis
railway init --name documind-production
railway add --database postgres
railway add --database redis

# Set secrets
railway variables set \
  SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))") \
  OPENAI_API_KEY=sk-your-key \
  ENVIRONMENT=production \
  DEBUG=false

# Deploy all services
railway up
```

Three Railway services are deployed:
| Service | Dockerfile | Purpose |
|---|---|---|
| `backend` | `Dockerfile.backend` | FastAPI API server (2 workers) |
| `worker` | `Dockerfile.worker` | ARQ async job processor |
| `frontend` | `Dockerfile.frontend` | Next.js standalone server |

### Docker Compose (Self-hosted)

```bash
# Build and start everything
docker compose -f docker/docker-compose.yml up --build

# Run migrations
docker compose exec backend alembic upgrade head
```

---

## Security

| Attack Vector | Mitigation |
|---|---|
| Password brute force | bcrypt work factor 12 + rate limiting (20 req/min on auth) |
| Credential stuffing | Constant-time comparison, generic error messages |
| JWT tampering | HS256 + token type claim + expiry enforcement |
| Token confusion | Explicit `type` claim validated on every decode |
| API key leak | SHA-256 hash stored, plaintext shown once, prefix for UI |
| SQL injection | SQLAlchemy ORM + parameterized raw queries |
| Prompt injection | Pattern detection + context-only system prompt design |
| Malicious uploads | Magic byte verification + PDF structure validation |
| Path traversal | `os.path.basename()` + dangerous char removal |
| SSRF via webhooks | Private IP range blocking + metadata endpoint blocking |
| Webhook replay | Timestamp validation (5 min max age) + HMAC-SHA256 |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Information leakage | Generic error messages + sensitive field redaction in logs |

---

## Performance

| Operation | Latency | Notes |
|---|---|---|
| Auth (JWT decode) | < 1ms | Self-contained, no DB |
| Search (cache hit) | < 5ms | Redis GET |
| Search (cache miss) | < 200ms | Vector + BM25 + RRF fusion |
| Chat first token | < 2s | Retrieval + LLM stream start |
| Document upload | < 100ms | Returns 202 immediately |
| Document ingestion | 10-60s | Async: parse + chunk + embed |
| Embedding (100 chunks) | ~2s | Batched OpenAI API call |

**Redis caching strategy:**

| Cache | TTL | What it avoids |
|---|---|---|
| Query embeddings | 24h | $0.000002 + 200ms per repeat query |
| Search results | 15min | Vector + BM25 DB queries |
| Chat responses | 1h | $0.01 LLM call per identical question |
| Org context | 5min | 2 DB queries per authenticated request |

---

## Roadmap

```
v1.0 — Current (MVP)
  ✅ Auth + multi-tenancy
  ✅ PDF + Markdown ingestion
  ✅ Hybrid search + streaming chat
  ✅ Stripe billing + webhooks
  ✅ Document version control

v1.1 — Polish
  ✅ Admin panel (system stats, user management)
  ✅ Usage analytics & cost tracking
  ✅ Plan limit enforcement (queries, docs, storage, members)
  ⬜ Document re-processing UI
  ⬜ Email notifications

v1.2 — Multi-Model
  ✅ Gemini embedding + chat completion (with graceful fallback)
  ⬜ Local embeddings (sentence-transformers)
  ⬜ Model selection per conversation
  ⬜ Re-ranking (Cohere cross-encoder)

v2.0 — Advanced RAG
  ⬜ Query expansion / HyDE
  ⬜ Parent-child chunking
  ⬜ Table extraction from PDFs
  ⬜ Image understanding (vision models)

v2.1 — Enterprise
  ⬜ SSO / SAML
  ⬜ Audit log export
  ⬜ On-premise deployment
  ⬜ Custom embedding fine-tuning
```

---

## Contributing

Contributions are welcome. Please follow these steps:

```bash
# 1. Fork the repository
# 2. Create a feature branch
git checkout -b feature/amazing-feature

# 3. Make your changes with tests
pytest -m unit  # must pass

# 4. Lint your code
cd backend && ruff check app

# 5. Commit and push
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature

# 6. Open a Pull Request
```

**Code style:** Ruff (Python), ESLint + Prettier (TypeScript)
**Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
**Tests:** New features require unit tests; bug fixes require regression tests

---

## Built With

This project was built across 10 engineering phases:

| Phase | What was built |
|---|---|
| 1 | Product requirements, user stories, MVP scope |
| 2 | System architecture, data flow diagrams |
| 3 | PostgreSQL schema, pgvector, Alembic migrations |
| 4 | FastAPI backend — auth, documents, chat APIs |
| 5 | RAG pipeline — parse, chunk, embed, hybrid search, LLM |
| 6 | Next.js frontend — auth, dashboard, streaming chat UI |
| 7 | Redis — caching, session management, rate limiting |
| 8 | Security — JWT hardening, RBAC, file validation, audit logs |
| 9 | Testing — unit, integration, frontend, CI pipeline |
| 10 | Deployment — Docker, Railway, monitoring, runbook |

---

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for details.

---

## Acknowledgements

- [pgvector](https://github.com/pgvector/pgvector) — Vector similarity search for PostgreSQL
- [FastAPI](https://fastapi.tiangolo.com) — Modern Python web framework
- [shadcn/ui](https://ui.shadcn.com) — Re-usable component library
- [ARQ](https://arq-docs.helpmanual.io) — Async job queue using Redis
- [TanStack Query](https://tanstack.com/query) — Powerful async state management

---



Made with ☕ and a lot of pgvector queries

**[⬆ Back to top](#documind)**

</div>