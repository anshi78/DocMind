# DocuMind Deployment Guide

This guide explains how to deploy the entire DocuMind stack (FastAPI backend, ARQ worker, Next.js frontend, PostgreSQL, and Redis) using **Render** and **Vercel**.

---

## 🚀 Option 1: Deployment on Render (Recommended)

Render is the simplest way to deploy the entire stack from a single GitHub repository using a **Render Blueprint** (`render.yaml`).

### Part 1: Infrastructure and Redis Warning
> [!IMPORTANT]
> **Render Redis Pricing**: Render does not offer a free tier for Redis (pricing starts at $7/month).
> *   **Option A (Paid Render Redis)**: Proceed with the default `render.yaml` Blueprint. Render will provision PostgreSQL, Redis, Backend, Worker, and Frontend all together.
> *   **Option B (Free External Redis - Recommended for Free Tier)**: 
>     1. Create a free Redis instance on [Upstash](https://upstash.com/) or [Aiven](https://aiven.io/).
>     2. Delete the `documind-redis` block (lines 75–80) from the `render.yaml` file in your repository.
>     3. Change the `REDIS_URL` in both `documind-backend` and `documind-worker` services inside `render.yaml` to `sync: false` so Render prompts you to enter your Upstash/Aiven `REDIS_URL` on deployment.

### Part 2: One-Click Deploy using Blueprint
1.  Log in to [Render](https://render.com/).
2.  Click **New** (top right) → **Blueprint**.
3.  Connect your GitHub repository containing the `DocMind` codebase.
4.  Render will auto-detect the `render.yaml` file and parse the services.
5.  Configure the requested parameters:
    *   **Service Group Name**: `documind-stack`
    *   **GEMINI_API_KEY**: Paste your Google Gemini API Key.
6.  Click **Apply**. Render will automatically provision:
    *   PostgreSQL Database (`documind-db`)
    *   Redis Instance (`documind-redis`)
    *   FastAPI Backend (`documind-backend` Web Service)
    *   ARQ Worker (`documind-worker` Background Worker)
    *   Next.js Frontend (`documind-frontend` Web Service)
7.  Once the backend build completes, it will automatically run migrations and start serving requests on Render's internal network.

### Part 3: Enable Vector Extension
1.  Once the PostgreSQL database is provisioned on Render, connect to it using a client (like TablePlus or psql CLI) or run a query directly in Render's dashboard.
2.  Execute the SQL:
    ```sql
    CREATE EXTENSION IF NOT EXISTS vector;
    ```
    *(Note: The initial migration script also executes this automatically on startup, but running this manually ensures pgvector is enabled beforehand).*

---

## 💻 Part 2: Frontend on Vercel (Optional)

You can choose to host the Next.js frontend on Vercel instead of Render (it's faster and has a generous free tier for Next.js):

1.  Log in to [Vercel](https://vercel.com/).
2.  Click **Add New** → **Project** and import your `DocMind` repository.
3.  Set the **Framework Preset** to **Next.js**.
4.  Set the **Root Directory** to `frontend`.
5.  Add the environment variable:
    *   `NEXT_PUBLIC_API_URL`: *[Your Render Backend Domain]* (e.g. `https://documind-backend.onrender.com`)
6.  Click **Deploy**.
7.  *Update the `CORS_ORIGINS` environment variable in your backend settings to include your Vercel URL.*

---

## 🗄️ Part 3: Troubleshooting Database Migrations

During migration or database setup, you might encounter pgvector index errors. Here is how to handle them.

### 1. The `unrecognized parameter "opclass"` Error
If you see the error:
`unrecognized parameter "opclass" [SQL: CREATE INDEX ... USING hnsw ... WITH (opclass = vector_cosine_ops)]`

*   **The Cause**: Alembic's autogenerate command (`alembic revision --autogenerate`) attempts to auto-detect pgvector HNSW indexes and incorrectly writes them in python like:
    `postgresql_with={'opclass': 'vector_cosine_ops'}`
    This causes SQLAlchemy to compile `opclass` into the `WITH` clause of PostgreSQL, which is invalid syntax.
*   **The Fix**: You must write the HNSW index using raw SQL execution in Alembic. The file `d60a6eb1dd79_add_indexes.py` already implements this correctly:
    ```python
    op.execute(
        "CREATE INDEX ix_embeddings_embedding_hnsw ON embeddings "
        "USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)"
    )
    ```

### 2. Fixing a Stalled/Locked Database Migration
If a migration hangs or gets locked due to another active database session holding a lock:
1.  Connect to your database via `psql` or a database GUI.
2.  Check for blocking locks:
    ```sql
    SELECT pid, query, state, age(clock_timestamp(), query_start) 
    FROM pg_stat_activity 
    WHERE state != 'idle' AND age(clock_timestamp(), query_start) > interval '10 seconds';
    ```
3.  Terminate the blocking process using:
    ```sql
    SELECT pg_terminate_backend(pid);
    ```
