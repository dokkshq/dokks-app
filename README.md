# Dokks

Dokks publishes a documentation site for a GitHub repository. You create a workspace, import a repo, and the docs agent reads the product and writes the site. Later pushes update the pages whose behavior changed. Each site is served at `{subdomain}.{DOCS_ROOT_DOMAIN}`, with its own branding, theme, and Changelog.

The product name is `NEXT_PUBLIC_PRODUCT_NAME`. The app origin is `APP_URL`. The marketing site is `NEXT_PUBLIC_MARKETING_URL`. None of those are set in code. Product decisions live in [SPEC.md](SPEC.md).

## What you do in the app

1. Sign in with GitHub or an email code. Beta access is required.
2. Create a workspace. It has a name, a subdomain, a theme, and a review mode, and it does not need a repository yet.
3. Open the workspace and import a GitHub repository. The thread starts with that repo, then the agent works in the chat.
4. Watch the agent think, read, and write. The send button shows a spinner while a turn is running. You can ask a question or ask for a change in the same composer. A question that does not write a page leaves the docs alone.
5. Review drafts when the workspace is set to review first, or let auto-publish put them live.
6. Open the public site, adjust branding, and read the Changelog.

The GitHub App signs people in and receives push webhooks. Its slug is `GITHUB_APP_SLUG`, and the install URL is `https://github.com/apps/<slug>/installations/new`. Installing the app does not create a site. A site is created only when you import a repository into a workspace.

## The docs agent

The agent is a loop, not a single prompt. It lists the repository, searches it, reads files, reads the current pages, and writes a page only when the docs should change. The chat shows each step, then a reply.

- First builds and the agent loop use `grok-build-0.1`.
- Smaller jobs, such as a short chat edit, a push update, or a summary refresh, use `grok-build-0.1`.
- Override those with `XAI_HEAVY_MODEL` and `XAI_SMALL_MODEL`. `grok-4.7` is a config option, not the default.
- Every model call goes to xAI. There is no second provider.

A retry continues the same job. The agent is given the steps it already took and the pages already written.

Spend is capped per repository and globally, in UTC days. The defaults are `$8` for one first build, `$2` for other repo spend, and `$25` globally. Those numbers are internal estimates for the cap, not an invoice.

## Docs sites

Published pages render on the workspace subdomain. Two themes ship: Ledger and Minimal. Branding covers logos, a favicon, a primary color, and the theme. A Changelog is part of the site. Hand-edited pages are not overwritten by a later build.

## Run it locally

```bash
npm install
cp .env.example .env
```

Fill in `.env`. Never commit it. Then apply migrations to this app's Neon database:

```bash
npx prisma migrate deploy
```

Use `migrate deploy`, or `migrate dev` on your own machine. Do not use `db push`.

```bash
npm run dev
npm run worker
```

Open http://localhost:3000. The worker is a separate process. In production it runs as an Azure Container App, not on Vercel. See [docs/WORKER_DEPLOYMENT.md](docs/WORKER_DEPLOYMENT.md).

Without `DATABASE_URL`, the dashboard and a preview docs site still render. Set `AUTH_DEV_BYPASS=1` to open the dashboard without GitHub. That flag is ignored when `NODE_ENV` is production.

Without `XAI_API_KEY`, Copilot uses a fake provider in development and tests. Production refuses to run a job when that key is missing.

## Access and accounts

Sign-up and log in are closed to the beta list. In production, set `ADMIN_EMAILS` to a comma-separated list of operator emails. The next time one of those people signs in, the app gives that account the admin role. They can approve other people on the admin applications page. An address removed from `ADMIN_EMAILS` keeps the admin role it already has.

The admin applications page reads and writes the marketing site's `beta_application` table through `MARKETING_DATABASE_URL`. Apply `docs/marketing-db/002_beta_application_review.sql` to the marketing database once. Approving an application grants local `BetaAccess` and sends one branded access email. A failed email does not undo access. Rejecting an application revokes local access and invalidates existing sessions for that email.

On a localhost database, the same approval can be done by hand:

```bash
npx tsx scripts/approve-beta-email.ts you@example.com
npx tsx scripts/approve-beta-email.ts you@example.com --admin
```

The script exits if `DATABASE_URL` is not `localhost` or `127.0.0.1`.

Email uses Resend (`RESEND_API_KEY`, `RESEND_FROM`) and is branded HTML with a plain-text version. That covers sign-in codes, email-change codes, beta invites, beta approvals, announcements, and internal spend alerts. Sign-in codes are HMAC-SHA256 hashed with `SESSION_SECRET`. Locally, set `LOGIN_CODE_SINK=.local/login-codes.log` when Resend is unset. Leave that unset in production.

Announcements respect email preferences. Every announcement includes a signed preferences link and a one-click List-Unsubscribe header. The public page is `/email/preferences`. Transactional email does not use this setting.

Profile pictures use Vercel Blob (`BLOB_READ_WRITE_TOKEN`). Only the public blob URL is stored. Replacing or removing a picture deletes the old blob.

Spend alerts use `SPEND_ALERT_DAILY_USD`, `SPEND_ALERT_USER_USD`, `SPEND_ALERT_USER_MULTIPLE`, and `SPEND_ALERT_EMAILS`. The cron route is `GET /api/cron/spend-alerts` with `Authorization: Bearer $CRON_SECRET`.

## Scripts

- `npm run dev` starts the app.
- `npm run worker` runs the docs agent worker. `npm run worker:dev` watches it.
- `npm test` runs the unit tests.
- `npm run lint` runs eslint.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run email:preview` renders sample emails to `.local/email-preview`.
- `npm run build` generates the Prisma client and builds Next.js.

## Where things live

- `prisma/schema.prisma` and `prisma/migrations` are the database.
- `src/lib/copilot/agent-loop.ts` is the docs agent. `src/lib/copilot/pipeline.ts` is the fallback writer.
- `src/worker` claims queued jobs, reads GitHub, runs the agent, and publishes or prepares revisions.
- `src/app/(product)/dashboard` is the signed-in app: workspaces, import, chat, builds, review, Changelog, usage, and billing.
- `src/app/(product)/profile` is the picture, name, email, sign-in methods, connected GitHub accounts, and account deletion.
- `src/app/(product)/admin` is applications, users, usage, jobs, plans, feedback, invites, installs, announcements, spend alerts, and read-only act-as.
- `src/app/api/webhooks/github` verifies the webhook and enqueues one job.
- `src/app/api/auth/github` is GitHub sign-in. `src/app/api/auth/email` sends and checks the 6-digit code.
- `src/app/api/workspaces/[site]/activity` is the live agent thread.
- `src/lib/sites/publish.ts` applies drafts and handles revision approval.
- `src/lib/github/repo-content.ts` reads the default branch and push diffs.
- `src/proxy.ts` sends `{subdomain}.{DOCS_ROOT_DOMAIN}` to the docs renderer and keeps the app routes signed in.
- `public/dokks_brand_kit` holds the Dokks marks. Customer sites keep their own logos.

## Tests

Unit tests cover the agent loop, webhook signatures, duplicate deliveries, spend caps, import, profile rules, email, and beta review. They do not need a database. Worker integration against Postgres is separate.

GitHub App registration for the OpentipHQ org is in [GITHUB_APP_SETUP.md](GITHUB_APP_SETUP.md).
