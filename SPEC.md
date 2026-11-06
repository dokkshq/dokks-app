# Dokks app spec

Status: 25 Oct 2026. This file is the source of truth for OpentipHQ/opentip-app. Update it when a decision changes.

Dokks is a hosted docs and Changelog platform. The name in the product is `NEXT_PUBLIC_PRODUCT_NAME`. The app origin is `APP_URL`. Docs are served on `{subdomain}.{DOCS_ROOT_DOMAIN}`. The marketing site is `NEXT_PUBLIC_MARKETING_URL`. The GitHub App slug is `GITHUB_APP_SLUG`. Those values are read from the environment. They are not defaults in code.

The word for money a person sends a project is tip. The only assets are ETH and USDC. Tipping itself is out of scope until a later phase. Do not invent brand facts that are not in this file or in the product decisions below.

## Product decisions

Recorded from the roadmap on 23 Oct 2026.

### Phase 0, in optimusexe/Opentip (done, not this repo)

- Docs product landing at opentip.tech. Tipping moved to /tip as Opentip Tip, with redirects.
- Landing redesign and the CTA paragraph centering fix are merged.
- Terms, Privacy, Subprocessors, and 404 pages are merged. Nigerian law. The liability cap is the greater of 12 months paid or US$100.
- /beta application form writes to Neon via `BETA_DATABASE_URL`. One question per screen, optional X handle, free input price question.
- Admin reviews that same `beta_application` table through this app's `MARKETING_DATABASE_URL`. Review state uses `status`, `reviewed_at`, and `reviewed_by`.
- Private repo OpentipHQ/opentip-app exists and Cursor has access.

### Phase 1, this repository

Foundation: app skeleton, database schema, GitHub App sign-in, webhook intake, Copilot job interface, dashboard shell, admin shell, and a public docs renderer. Outside services are faked until keys exist.

Elijah still has to:

- Register the GitHub App on the OpentipHQ org as Opentip Copilot, slug `opentip-copilot`. The name Opentip is reserved. Sign-in and push updates use the same app. Install URL: https://github.com/apps/opentip-copilot/installations/new. See GITHUB_APP_SETUP.md. Override the slug with `GITHUB_APP_SLUG` only if GitHub assigns a different one.
- Create a separate Neon database for this app (Free plan). It becomes the production database at launch. Do not reuse the marketing site database.
- Add xAI and Resend keys.

Beta access is sent by email. The beta app origin is `APP_URL`. Email is branded HTML with a plain-text version. Transactional email covers sign-in codes, email-change codes, beta invites, beta approvals, and internal spend alerts. Announcements are product email and respect a signed opt-out link and one-click unsubscribe. There is no invented support or reply-to address.

### Workspace entry (implemented)

- Primary path: create an empty workspace (`Site.repoId` null), open Preview & chat, use the empty-state Import repository dialog to attach a GitHub repo, then watch `JobEvent` progress in the agent panel.
- Standalone `/dashboard/import` can still create a site with a repo; it redirects into `/dashboard/w/:subdomain` chat, not the old per-job build page.
- Builds list and chat always surface a failure reason from `Job.error`, error events, or `detail`.

### Phase 2, docs engine and Copilot (implemented)

- One worker, fed by the queue this app writes when a webhook arrives. It scales from zero. The host is an Azure Container App.
- Job kinds: first build, push update, chat edit.
- Approvals for pages waiting on review.
- Never silently overwrite a page a customer edited by hand. `Page.handEdited` records that, and `pageWriteMode` returns skip.
- A failed build keeps the live site running.
- Uninstall or a removed repo pauses the site and, in that phase, emails the owner. This foundation already pauses the site. The email is not sent yet.
- Repo renamed, moved, or archived. The webhook handler records the rename and pauses on archive, delete, or transfer.
- Webhooks that fail or arrive twice. Signature checks, a delivery id claim, and a job idempotency key are in this foundation. A failed claim is released so GitHub can retry.
- Private repos are supported. Code is sent to xAI. That is covered in the Privacy policy. Private docs behind sign-in are a later paid feature, still undecided for the first paid plans.

This repository now has the durable worker, job leases and retries, `JobEvent` progress, curated repo reading, `PageRevision` review and approval, the build progress page, and Chat edit. Deployment steps are in `docs/WORKER_DEPLOYMENT.md`.

### Phase 3, docs sites, branding, and SEO

- Themes on Free: Ledger and Minimal.
- Fonts: Geist and Geist Mono. Headings at weight 500. Body at weight 400.
- Branding, the way Mintlify does it: logo light and dark, favicon, primary color, theme.
- Dynamic signed OG image per page, 1200 by 630, cached. Reference checked 23 Oct 2026: docs.shieldhq.xyz. The image shows the logo, section, title, and description on a light field with a hairline grid and a soft tint of the site color.
- OG overrides, in increasing control: own background (logo, title, and description stay), one image for the whole site, one image for a page.
- Floating "Built with {NEXT_PUBLIC_PRODUCT_NAME}" pill in a bottom corner. It opens `NEXT_PUBLIC_MARKETING_URL`.
- Free subdomains. Custom domains with automatic HTTPS and status messages are not on Free.
- Sitemap and robots.txt per site.
- Canonical link from the subdomain to the custom domain once the custom domain is active.
- Noindex on preview builds (`Page.noindex`) and on paused sites.

### Phase 4, Changelog, money, and admin

- Carry over the existing Changelog code, including the PR #34 fix. This foundation has the schema and a read-only list.
- Optional tip button under a Money section. ETH and USDC only. Tip fees unchanged. Not in this release.
- Admin, the nine items that were written down: applications, users, usage and costs, jobs, plans and limits, feedback, tips overview, invite waves, GitHub App installs. Thirteen features were approved and only these nine are recorded. Do not invent the other four.
- Takedown tools for abuse reports.

### Phase 5, trust, safety, and data

- Export docs as Markdown or as a pull request to the repo.
- Deleting a site: a grace period, then a full wipe including the CDN cache.
- Deleting an account, including the GDPR path.
- Emails for failed builds, pages waiting for approval, and domain status.
- Report abuse link on every site, and checks on new sites.
- DMCA and takedown policy in the Terms.
- Tip button rules: who receives the tip, and Terms covering crypto.

### Phase 6, launch and paid plans

- Paddle account and website review before launch. Needs live pricing, Terms, Privacy, and a refund policy.
- Plans: Free, Pro $20 a month, Team $200 a month. Prices stay hidden during beta. Prices may change from beta form answers.
- A discount on the first two months after launch. No lifetime deal.
- Feature scenes as short videos on the landing page. Uncertain whether that already landed in the marketing repo.

### Later

- Monorepos: pick one package or folder.
- Docs search. Still a decision. It is not in the beta scope until that decision changes.
- `llms.txt` per site.
- AI crawler opt-out (Content-Signal in robots.txt).
- Public API and webhooks for customers.
- Limit of 3 Changelog updates a day.
- Private docs behind sign-in as a paid feature.
- Code with comments that are not in English.

## Branding model

Each site stores:

- `logoLightUrl` and `logoDarkUrl`. One file is enough if the other is empty.
- `logoHref` for where the logo click goes.
- `faviconUrl`.
- `primaryColor`. Required in the product sense. Default `#2A2AD6` until the customer sets one.
- `theme`: `LEDGER` or `MINIMAL`.
- `appearance`: `SYSTEM`, `LIGHT`, or `DARK`.
- `ogBackgroundUrl`: the customer's background, with the automatic logo, section, title, and description still drawn on top.
- `ogImageUrl`: one fixed image for the whole site.
- `Page.ogImageUrl`: one fixed image for that page.

The automatic image wins only when neither the page nor the site has a fixed image. The route is `/api/og`. Query fields are `site`, `section`, `title`, `description`, `primary`, optional `logo`, optional `background`, and `sig`. The signature is HMAC-SHA256 over a versioned canonical string, encoded as base64url, using `OG_SIGNING_SECRET`. A bad or missing signature returns 403. Colors must be `#RRGGBB`. Logo and background URLs must be https. The response is a 1200 by 630 PNG from `next/og` `ImageResponse`, cached for a day at the edge.

App chrome, separate from customer sites:

- Background `#FAFAFA`.
- Opentip blue `#2A2AD6`.
- Hairline `#EBEBEB`, 1px, on cards.
- Pill buttons.
- Geist and Geist Mono, weights 400 and 500 only.

## Models and cost caps

Decided 23 Oct 2026.

- Heavy jobs (first full build, large chat edits over 2,000 characters): xAI `grok-build-0.1`. `grok-4.7` is a config option only, via `XAI_HEAVY_MODEL`. It is not the default.
- Small jobs (push updates, smaller edits): xAI `grok-build-0.1`. Override with `XAI_SMALL_MODEL`.
- One provider layer: `resolveProvider`. A missing xAI key uses a fake provider in development and tests. Production fails closed.
- Fake completions cost 0, so local preview does not burn the cap. Real calls use internal USD estimates (`XAI_*_USD_PER_MTOK`). Those estimates are for caps, not an invoice. Unset prices default to $1 per million input tokens and $2 per million output tokens, the grok-build-0.1 list prices.
- Before a job runs, reserve an estimate (heavy: 20k prompt and 8k completion tokens, small: 4k and 1.5k). Reject the job when the reserve would pass the per-repo daily cap or the global daily cap.
- Default caps: $2 per repo per day, $25 global per day. Both are UTC days and are env-configurable.
- The database path sums `UsageEntry` rows inside a serializable transaction (`reserveDailySpend`) so two jobs cannot both pass a cap they would share.
- Repo summaries are cached on the repo row (`summary`, `summarySha`, `summaryCachedAt`) and behind `getOrCreateRepoSummary`. Reuse the summary until the sha changes or the TTL passes. Refreshing a summary is its own job and must pass the cap on its own. Do not hide a second model call inside a job that was reserved once.
- Token totals and estimated spend are shown on the admin Usage page. They are not shown on the customer dashboard. The customer Usage page lists sites, published pages, and builds only.

## What this foundation includes

- Next.js App Router, TypeScript, Tailwind, shadcn.
- Prisma schema and a SQL migration. Apply it with `prisma migrate deploy`. Do not use `db push`.
- Models: users (role, profile picture URL, email sign-in switch, session version, suspension, credits), GitHub App installations (account avatar), repos (last push), sites (subdomain, custom domain, branding, review mode), pages, jobs (phase, progress, lease, attempts), job events, page revisions, webhook deliveries and errors, chat edits, Changelog entries, plans, subscriptions, usage entries, beta invites, beta applications, email preferences, feedback, activity logs, announcements, and spend alerts. Login codes carry a purpose and optional user for email changes.
- Plan rows seeded by the migration: Free $0, Pro $20, Team $200. The billing page hides prices unless `SHOW_PLAN_PRICES=1`.
- Closed beta. `/sign-up` and `/login` offer GitHub or a 6-digit email code. Codes expire in 10 minutes, are stored hashed, and stop after 5 attempts. Resend waits 60 seconds. There are no passwords and no magic links.
- An email can sign in only after it is on `BetaAccess`, or listed in `ADMIN_EMAILS`. Admin reads the marketing site's `beta_application` table directly. Approving adds a local `BetaAccess` row and sends one access email. A failed email does not undo access, and the admin can resend it. Rejecting removes `BetaAccess` and increments the user's session version so active sessions stop. Emails in `ADMIN_EMAILS` are approved and receive the admin role the next time they sign in, which bootstraps the first admin. An unapproved email sees `/waitlist` and gets no session. The local `BetaApplication` model is unused.
- GitHub and email can share one account when the emails match. A different GitHub account on the same email is refused.
- Installing the GitHub App links the installation and repos to the account but creates zero sites. A GitHub install that arrives without the sign-in cookie does not show "sign-in attempt expired." It is held, then linked after an approved sign-in if the GitHub account or email matches. An unapproved install never links or creates sites.
- `/dashboard` is the import view. It lists personal and organization accounts in a dropdown, supports server-side repo search and pagination, and imports one repo at a time. Import opens a dialog for the site name, subdomain, description, theme, primary color, and review mode. Auto-publish is the default, and review-first keeps generated changes pending until approval. Build site creates only that repo's site in `PENDING` and a `FIRST_BUILD` job in `QUEUED`. It is idempotent, and an imported repo shows Imported. The Sites cards live at `/dashboard/sites`. Installing the GitHub App creates no sites.
- `/profile` covers a validated 2 MB profile picture in Vercel Blob (URL only in Postgres), display name, email change by code, GitHub link and unlink, email sign-in disable, connected GitHub accounts, sign out all devices, and typed-confirmation account deletion. At least one sign-in method must remain. Unlinking email keeps the address but disables email codes, and is allowed only while GitHub is linked. An email change carries the product-email preference to the new address. Account deletion removes it.
- `/email/preferences` is public and token-signed. It controls announcement email only. Sign-in, beta access, and account email stay transactional.
- GitHub App OAuth, setup URL, and `POST /api/webhooks/github`. The app slug defaults to `opentip-copilot` (`GITHUB_APP_SLUG`). The install URL is `https://github.com/apps/opentip-copilot/installations/new`.
- Webhook signature check, idempotent enqueue, uninstall and suspend pause, removed-repo pause, rename, archive, delete, and transfer handling.
- Copilot provider layer, caps, cached summary helper, generation contract, curated repository context, and the durable worker queue.
- Site management at `/dashboard/sites/[id]`, build progress at `/dashboard/sites/[id]/builds/[jobId]`, revision review at `/dashboard/sites/[id]/revisions/[revisionId]`, and Chat edit at `/dashboard/sites/[id]/chat`. The build page polls every 2 seconds and shows stage and `JobEvent` activity without prompts or spend. Owners can retry a terminal failed job from its build page.
- Dashboard: Import, Sites, Changelog, Usage, Billing, and Profile. No credit or token figures on those pages.
- Admin: applications with approve, reject, and resend access email, user search and detail with suspend and unsuspend, read-only act-as with a banner, AI usage and cost per user, jobs with live refresh and retry, plans plus manual credits, feedback, invites in waves of up to 50, GitHub installs plus webhook errors, honest empty ETH and USDC tip cards, announcements with optional email that respects opt-outs, spend alerts with dedupe and a protected cron route, and an activity log. Admin Reset is not built. Tips are read-only. Takedown tools are not built.
- Public docs on `{subdomain}.{DOCS_ROOT_DOMAIN}` and on `{subdomain}.{APP_URL host}` during beta. Custom domains rewrite to the same renderer.
- Per-site branding, Ledger and Minimal, the corner pill, signed OG images, sitemap, robots.txt, canonical tags, noindex when paused or `Page.noindex`.
- Local preview site at `/sites/sample` when `DATABASE_URL` is unset.
- `AUTH_DEV_BYPASS=1` opens the dashboard in development only. Production ignores it.

## What is stubbed

- Email on uninstall, build failure, approval waiting, or domain status. Branded invite, approval, announcement, and spend-alert email is implemented. It no-ops without Resend outside production.
- Worker database integration tests. The worker compiles and its pure logic is unit tested, but a real Postgres instance is still needed for claim, lease, and reaper tests.
- Full repo indexing with per-file summaries. Phase 2 uses a curated tree and selected files.
- Paddle checkout. Billing explains that checkout is not connected.
- Tips. No tip button, no tip ledger, and no fabricated totals. The admin page is an honest empty state for ETH and USDC.
- Custom domain HTTPS provisioning and status polling. The columns exist. The certificate flow does not.
- Admin Reset. It is deliberately not built. Admins can suspend, unsuspend, view as, change a plan, and add credits.
- Changelog composer. The page lists entries.
- Docs search, monorepo picker, export, deletion grace period, abuse reports, and `llms.txt`.
- Admin Reset and the four unrecorded admin features. They are not guessed.

## Language

User-facing copy does not use an em dash. ETH and USDC are the only assets named for tips.
