# DocuMind Deployment Guide

This guide explains how to deploy the entire DocuMind stack (FastAPI backend, ARQ worker, Next.js frontend, PostgreSQL, and Redis) from scratch using **Railway** and **Vercel**. It also explains how to troubleshoot the Railway Railpack build error and pgvector Alembic migration issues.

---

## 🛠️ The Railway Build Error: What Happened?

The build failed with **`railpack process exited with an error`** because:
1. Railway's build engine (Railpack) scans the root of the repository to auto-detect the project type.
2. Since this repository is a monorepo containing both `/backend` and `/frontend`, and has no single root-level `Dockerfile` (instead containing `Dockerfile.backend`, `Dockerfile.frontend`, and `Dockerfile.worker`), Railpack got confused and tried to build the repository as a standard Node project from the root.

### The Fix
Instead of relying on auto-detection, you must explicitly tell Railway which Dockerfile to use for each service. You can do this in two ways:

#### Option 1: UI settings (Recommended)
Set the **Dockerfile Path** in the settings of each service to `Dockerfile.backend`, `Dockerfile.worker`, or `Dockerfile.frontend`.

#### Option 2: Config as Code (`railway.toml`)
Railway supports specifying configuration files under the service settings (under **Settings** -> **Config as Code**). Since a single `railway.toml` file only configures one service at a time, separate config files are provided in the `/railway` folder:
*   `railway/backend.toml` (for FastAPI Backend)
*   `railway/worker.toml` (for ARQ Ingestion Worker)
*   `railway/frontend.toml` (for Next.js Frontend)

You can specify the path to these files in the **Railway Service Settings** (e.g. set the custom config path to `railway/backend.toml` for your backend service).

---

## 🗺️ Deployment Architecture

We recommend the following architecture for production:
*   **Databases (Railway)**: Managed PostgreSQL (with `pgvector` pre-installed) and managed Redis.
*   **Backend & Worker (Railway)**: Built using `Dockerfile.backend` and `Dockerfile.worker` from the root directory.
*   **Frontend (Vercel or Railway)**: 
    *   **Vercel (Recommended)**: Extremely fast, global CDN, and free for Next.js apps.
    *   **Railway (Alternative)**: Simple to keep everything in one place using `Dockerfile.frontend`.

---

## 🚀 Part 1: Database Provisioning (Railway)

First, provision the database services in your Railway project:

1.  Log in to [Railway](https://railway.app/).
2.  Click **New Project** → **Provision PostgreSQL**.
3.  Click **New** → **Database** → **Provision Redis**.
4.  Wait for both services to be ready.

> [!NOTE]
> Railway's official PostgreSQL image comes with the `pgvector` extension pre-installed, so vector search is supported out of the box!

---

## 🐍 Part 2: Deploying Backend & Worker (Railway)

You will create two services in Railway pointing to the same GitHub repository: one for the API backend and one for the async background worker.

### 1. Deploy the API Backend
1.  Click **New** → **GitHub Repo** → select your `DocMind` repository.
2.  Once created, click on the new service, go to **Settings** → **General**, and rename the service to `backend`.
3.  Go to the **Settings** tab → **Build** section:
    *   Set **Root Directory** to `/` (keep default).
    *   Set **Dockerfile Path** to `Dockerfile.backend`.
4.  Go to the **Variables** tab and add the database/cache bindings:
    *   `POSTGRES_HOST`: Select **Reference** → `postgres` → `PGHOST` (or click "Add Reference" and select `DATABASE_URL` / DB credentials).
    *   `POSTGRES_PORT`: `5432` (or reference `PGPORT`).
    *   `POSTGRES_USER`: Reference `PGUSER`.
    *   `POSTGRES_PASSWORD`: Reference `PGPASSWORD`.
    *   `POSTGRES_DB`: Reference `PGDATABASE`.
    *   `REDIS_URL`: Reference `redis` → `REDIS_URL` (or paste the connection string).
5.  Add the remaining configuration variables:
    *   `ENVIRONMENT`: `production`
    *   `DEBUG`: `false`
    *   `SECRET_KEY`: *[Generate a 64-char hex key]*
    *   `DEFAULT_EMBEDDING_PROVIDER`: `gemini`
    *   `DEFAULT_LLM_PROVIDER`: `gemini`
    *   `GEMINI_API_KEY`: *[Your Gemini API Key]*
    *   `CORS_ORIGINS`: `["https://your-frontend-domain.vercel.app"]` (update this once your frontend is deployed).
6.  Go to the **Settings** tab → **Networking** section and click **Generate Domain** to expose the API. Copy this domain (e.g. `https://docmind-backend.up.railway.app`).

### 2. Deploy the Ingestion Worker
The background worker processes document uploads asynchronously using `ARQ`.
1.  Click **New** → **GitHub Repo** → select your `DocMind` repository again.
2.  Once created, rename the service to `worker`.
3.  Go to the **Settings** tab → **Build** section:
    *   Set **Root Directory** to `/`.
    *   Set **Dockerfile Path** to `Dockerfile.worker`.
4.  Go to the **Variables** tab:
    *   Click **Shared Variables** (or copy from the `backend` service) to bind the same PostgreSQL credentials, `REDIS_URL`, `SECRET_KEY`, and `GEMINI_API_KEY`.
    *   The worker does not need to expose any ports or domains.

---

## 💻 Part 3: Deploying Frontend

### Option A: Vercel (Recommended)
1.  Log in to [Vercel](https://vercel.com/).
2.  Click **Add New** → **Project** and import your `DocMind` repository.
3.  In the configuration settings:
    *   Set the **Framework Preset** to **Next.js**.
    *   Set the **Root Directory** to `frontend`.
4.  Expand the **Environment Variables** section and add:
    *   `NEXT_PUBLIC_API_URL`: *[Your Railway Backend Domain]* (e.g. `https://docmind-backend.up.railway.app`)
5.  Click **Deploy**. Vercel will automatically build and serve the app.
6.  *Don't forget to go back to your Railway `backend` service variables and update `CORS_ORIGINS` to include your Vercel URL!*

---

### Option B: Railway (Alternative)
If you prefer keeping the frontend on Railway:
1.  Click **New** → **GitHub Repo** → select your `DocMind` repository.
2.  Rename the service to `frontend`.
3.  Go to **Settings** → **Build** section:
    *   Set **Root Directory** to `/`.
    *   Set **Dockerfile Path** to `Dockerfile.frontend`.
4.  Go to the **Variables** tab and add:
    *   `NEXT_PUBLIC_API_URL`: Reference `backend` → `RAILWAY_STATIC_URL` (or paste the generated backend domain).
5.  Go to **Settings** → **Networking** and click **Generate Domain**.

---

## 🗄️ Part 4: Troubleshooting Database Migrations

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
    *Never use Alembic autogenerate to build pgvector HNSW indexes without manually reviewing and replacing the generated code with raw SQL.*

### 2. Fixing a Stalled/Locked Database Migration
If your local or Railway migration gets stuck because a table or index was partially created:
1.  Connect to your database via `psql` or a GUI client (e.g., TablePlus, pgAdmin).
2.  Clean up any failed tables or indexes manually:
    ```sql
    DROP INDEX IF EXISTS ix_embeddings_embedding_hnsw;
    DROP INDEX IF EXISTS ix_chunks_content_fts;
    ```
3.  Ensure the `alembic_version` table matches the last successful migration:
    *   Check migration files in `backend/app/db/migrations/versions/`.
    *   Set the version manually if needed:
        ```sql
        UPDATE alembic_version SET version_num = 'c59a5ea0cc68'; -- Set to initial schema revision
        ```
    *   Or run command:
        ```bash
        alembic stamp c59a5ea0cc68
        ```
4.  Re-run the migration:
    ```bash
    alembic upgrade head
    ```
