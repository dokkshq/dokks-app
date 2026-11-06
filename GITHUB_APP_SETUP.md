# Register the Dokks GitHub App

Create this app on the OpentipHQ organization. One app handles sign-in and repository webhooks.

The product name, app origin, docs domain, and marketing origin come from `.env`. Put the same `APP_URL` in the GitHub App URLs below. Put the slug GitHub assigns in `GITHUB_APP_SLUG`.

Open: https://github.com/organizations/OpentipHQ/settings/apps/new

Install URL, after the app exists: `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new`

## App settings

| Field | Value |
| --- | --- |
| GitHub App name | The name you register. The in-app name is `NEXT_PUBLIC_PRODUCT_NAME`. |
| GitHub App slug | The slug GitHub assigns. Copy it to `GITHUB_APP_SLUG`. |
| Description | Writes docs for a repository and updates them on every push. |
| Homepage URL | `APP_URL` |
| Callback URL | `{APP_URL}/api/auth/github/callback` |
| Setup URL | `{APP_URL}/api/github/setup` |
| Redirect on update | Checked |
| Expire user authorization tokens | Checked |
| Request user authorization (OAuth) during installation | Checked |
| Enable Device Flow | Unchecked |
| Webhook Active | Checked |
| Webhook URL | `{APP_URL}/api/webhooks/github` |
| Webhook secret | A long random string. Store it as `GITHUB_WEBHOOK_SECRET`. |
| Webhook content type | application/json |
| SSL verification | Enabled |
| Where can this GitHub App be installed? | Any account |

After you type the name, copy the slug GitHub saved into `GITHUB_APP_SLUG`. The install URL uses that slug. The name people see in the product is `NEXT_PUBLIC_PRODUCT_NAME`.

## Permissions

Repository permissions:

- Contents: Read-only. Copilot reads the repo to write docs.
- Metadata: Read-only. GitHub requires this.
- Pull requests: Read and write. A later phase opens a pull request to export docs. Request it now so installed users are not prompted again.

Account permissions:

- Email addresses: Read-only. Sign-in uses the primary verified email when GitHub has one.

Organization permissions: none.

Leave every other permission at No access.

## Events

Subscribe to:

- Installation
- Installation repositories
- Push
- Repository

Those events cover install, uninstall, repo added or removed, push, rename, transfer, archive, and delete.

## After you create the app

1. Copy the App ID into `GITHUB_APP_ID`.
2. Generate a private key. Put the PEM in `GITHUB_APP_PRIVATE_KEY` with newlines written as `\n`. Do not commit the `.pem` file.
3. Copy the Client ID into `GITHUB_CLIENT_ID`.
4. Generate a client secret into `GITHUB_CLIENT_SECRET`.
5. Create a Neon database for this app on the Free plan. It is separate from the marketing site `BETA_DATABASE_URL`. Put the connection string in `DATABASE_URL`. Use a direct connection for migrations.
6. Create the other secrets in `.env.example`: `XAI_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `OG_SIGNING_SECRET`, `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN`, `SPEND_ALERT_EMAILS`, and `CRON_SECRET`. Vercel Cron sends the bearer token from `CRON_SECRET` to `/api/cron/spend-alerts` once a day.
7. Add `MARKETING_DATABASE_URL` for the marketing site database. The admin applications page reads and updates its `beta_application` table directly. Use a role with `SELECT` and `UPDATE` on that table, not the database owner. Apply `docs/marketing-db/002_beta_application_review.sql` once to add `status`, `reviewed_at`, and `reviewed_by`. Rejecting an application revokes local beta access and invalidates sessions for that email.
8. Set those variables on the host that serves `APP_URL`.
9. From this repo, run `npx prisma migrate deploy`.
10. Install the app on one test account from `https://github.com/apps/<GITHUB_APP_SLUG>/installations/new`. GitHub sends the browser to the setup URL with `code`, `installation_id`, and `setup_action`, and no sign-in cookie. The app checks that this GitHub user can access that installation, holds the install, and sends them to log in. It does not show "The sign-in attempt expired." The install is linked to an approved account, and no sites are created. An email that is not on the beta list goes to the waitlist. Open `/dashboard`, pick the GitHub account, and click Import on one repo. Enter the site name, subdomain, description, theme, and color, then click Build site. That creates one pending site and one queued first-build job.
11. Push a commit. The webhook should return 200. A second delivery of the same event must not create a second job. Uninstalling the app pauses the site. It does not delete it. Repositories added later through GitHub sync into the import list and still create no sites until someone clicks Build site.

Local webhook checks need a public tunnel to `http://localhost:3000/api/webhooks/github` and a real `DATABASE_URL`. Without a database the route still checks the signature, answers ping, and returns 503 for other events.

The marketing site at `NEXT_PUBLIC_MARKETING_URL` is a different app. Do not point this GitHub App at that project.
