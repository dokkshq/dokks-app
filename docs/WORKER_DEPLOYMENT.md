# Copilot worker deployment

The docs worker is a separate long-running container. It reads queued `Job` rows from Postgres, claims them with `FOR UPDATE SKIP LOCKED`, and writes progress to `JobEvent`.

Do not run the worker on Vercel. Vercel functions have request timeouts and do not provide durable background execution.

## Build

```bash
docker build -f Dockerfile.worker -t opentip-worker .
```

The image runs:

```bash
npm run worker
```

The worker uses the same `DATABASE_URL`, GitHub App credentials, and model keys as the Next.js app.

## Database order

1. Deploy the Next.js app and apply migrations with `npx prisma migrate deploy`.
2. Start or update the worker.
3. Never run `prisma db push` against production.

The worker does not run migrations. A container must not race another container to migrate the same database.

## Azure Container Apps settings

Create a Container App with ingress disabled and no HTTP health probe.

```text
min replicas: 0
max replicas: 3
CPU: 1.0
memory: 2 Gi
WORKER_CONCURRENCY=2
MAX_CONCURRENT_HEAVY=1
```

Each replica can run two jobs at once. At four jobs per replica, add replicas before raising per-container concurrency.

The worker uses a five-minute lease and a 30-second heartbeat. If a container is killed, another worker retries the job after the lease expires. Jobs stop retrying after `maxAttempts` and are marked `FAILED`.

## KEDA PostgreSQL scaler

Use a KEDA PostgreSQL scale rule with this query:

```sql
SELECT ceil(
  (COUNT(*) FILTER (WHERE status = 'QUEUED') +
   COUNT(*) FILTER (WHERE status = 'RUNNING'))::decimal / 2
) FROM "Job";
```

The divisor is `WORKER_CONCURRENCY`. If concurrency changes, change the divisor too.

Example Azure CLI rule:

```bash
az containerapp create \
  --name opentip-worker \
  --resource-group opentip \
  --environment opentip-env \
  --image <registry>/opentip-worker:<tag> \
  --min-replicas 0 \
  --max-replicas 3 \
  --cpu 1.0 \
  --memory 2Gi \
  --secrets \
    database-url="$DATABASE_URL" \
    github-app-private-key="$GITHUB_APP_PRIVATE_KEY" \
    xai-api-key="$XAI_API_KEY" \
  --env-vars \
    DATABASE_URL=secretref:database-url \
    GITHUB_APP_ID="$GITHUB_APP_ID" \
    GITHUB_APP_PRIVATE_KEY=secretref:github-app-private-key \
    XAI_API_KEY=secretref:xai-api-key \
    NODE_ENV=production \
    WORKER_CONCURRENCY=2 \
    MAX_CONCURRENT_HEAVY=1 \
  --scale-rule-name docs-jobs \
  --scale-rule-type postgresql \
  --scale-rule-metadata \
    connectionFromEnv=DATABASE_URL \
    query="SELECT ceil((COUNT(*) FILTER (WHERE status = 'QUEUED') + COUNT(*) FILTER (WHERE status = 'RUNNING'))::decimal / 2) FROM \"Job\"" \
    targetQueryValue=1
```

Azure Container Apps KEDA metadata uses the PostgreSQL scaler key names for your environment. Confirm the `connectionFromEnv` key against the current Azure Container Apps docs before applying.

## Required environment

- `DATABASE_URL`
- `GITHUB_APP_ID`
- `GITHUB_APP_PRIVATE_KEY`
- `XAI_API_KEY`
- `REPO_DAILY_CAP_USD`
- `GLOBAL_DAILY_CAP_USD`
- `WORKER_CONCURRENCY`
- `MAX_CONCURRENT_HEAVY`

`RESEND_API_KEY`, `SESSION_SECRET`, and `APP_URL` are only needed by the web app. The worker does not send build failure email in phase 2.

## Operating checks

- A queued job with no worker running stays queued. It is not lost.
- A browser refresh does not affect a running job.
- `JobEvent` is the source of truth for the build page activity.
- `UsageEntry` rows are reserved before a model call and finalized after the call. A retry writes a new row, so usage stays per attempt. Reserved rows for failed calls are released.
- An owner can retry a terminal failed job from its build page. Admins can retry any failed job from `/admin/jobs`. The retry resets attempts, lease, and progress, and releases any reserved usage from the failed attempt.
