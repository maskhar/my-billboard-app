# Production Runbook

Use this runbook for a controlled staging validation and production release. Do
not paste `DATABASE_URL`, passwords, API keys, webhook tokens, or backup
contents into terminals with shared history, chat, tickets, or logs.

## Preconditions

- Make the deployment window and rollback owner explicit. Put the application
  into maintenance mode or otherwise prevent new bookings before a destructive
  restore or incompatible migration.
- Install PostgreSQL client tools on the operator workstation or deployment
  host. `pg_dump` and `pg_restore` must both be on `PATH`.
- Give the backup directory restricted access. It contains customer and payment
  data; encrypt it at rest and copy it to a separate, protected location.
- Run commands from repository root in Windows PowerShell. The scripts use
  `DATABASE_URL` from the current process, or prompt for it without echoing it.
  Use the deployment secret manager to set the process environment variable, or
  let each script request the connection URL through its hidden prompt.

## Deployment Topology

- Nginx uses `nginx.conf`, listens on container port `80`, and must be published
  by the separately managed deployment compose as `127.0.0.1:18087:80`. Do not
  publish it on `0.0.0.0`; Cloudflared is the public ingress.
- `billboard.uteroindonesia.com` proxies to `billboard-prod:3000` and
  `dev-billboard.uteroindonesia.com` proxies to `billboard-dev:3000`. These
  names must be resolvable container names or network aliases on Nginx's Docker
  networks.
- Use `compose.production.yml`. Nginx joins four external networks:
  `carubra-network`, `maskhar-network`, `utero-id-network`,
  `uteroindonesia-network`. Both apps and their databases stay on
  isolated project networks. Verify external networks before deployment.
- Cloudflared configuration, tunnel credentials, DNS routes, and TLS remain an
  operator responsibility. Existing `cloudflared-tunnel` runs inside Docker on
  `carubra-network`: point both public hostnames to
  `http://billboard-nginx:80` (Compose project DNS permitting), NOT
  `http://127.0.0.1:18087`, which would mean the tunnel container itself.
  Host loopback port `18087` is for local checks only.
- Chat stays off in both environments. Do not deploy `chat-server`, expose a
  chat port, or set chat-server secrets while `NEXT_PUBLIC_CHAT_ENABLED=false`.

Nginx resolves both upstream names at startup. Start both apps before proxy.
Check host routing after both are healthy:

```powershell
curl.exe -H "Host: billboard.uteroindonesia.com" http://127.0.0.1:18087/api/health
curl.exe -H "Host: dev-billboard.uteroindonesia.com" http://127.0.0.1:18087/api/health
```

## Environment Checklist

Before the staging build, confirm the secret manager provides these values
without printing their values:

- Start from `.env.production.example` for production and
  `.env.development.example` for the deployed development environment. They are
  templates only: copy to `.env.production.local` and
  `.env.development.local`, replace every placeholder, and never commit
  completed files. Use distinct PostgreSQL credentials for each environment.
  Set `DATABASE_URL` to matching container hostname and credentials;
  percent-encode URL-reserved password characters inside that URL.

- Required application values: `DATABASE_URL`, `NEXTAUTH_SECRET`,
  `NEXTAUTH_URL`, `SETTINGS_ENCRYPTION_KEY`, production `APP_ORIGIN`, and
  `PRIVATE_UPLOAD_STORAGE_ROOT` pointing to a pre-provisioned persistent mount.
- Payment values: `XENDIT_SECRET_KEY`, `XENDIT_CALLBACK_TOKEN`; leave
  `XENDIT_API_BASE_URL` empty unless Xendit documents a supported sandbox
  endpoint. `APP_ORIGIN` must be HTTPS in production.
- Email and scheduled work: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`,
  `ADMIN_EMAIL`, and `CRON_SECRET`.
- Set `NEXT_PUBLIC_CHAT_ENABLED=false` while chat is paused. In that mode no
  chat URL or chat-server environment is required. When re-enabling it, set
  `NEXT_PUBLIC_CHAT_ENABLED=true` and `NEXT_PUBLIC_CHAT_URL` before building.
  `NEXT_PUBLIC_*` values are embedded by `next build`; changing them requires a
  rebuild and redeploy.
- When chat is enabled, its process values live in **`chat-server/.env`**:
  `DATABASE_URL`, `NEXTAUTH_SECRET`, `CHAT_CORS_ORIGINS`,
  `CHAT_GUEST_TOKEN_SECRET`, `GEMINI_API_KEY`, `PORT`, and
  `CHAT_AI_BATAS_GLOBAL_PER_MENIT`. `NEXTAUTH_SECRET` and `DATABASE_URL` must
  match the Next application.

Run `node scripts/check-production-env.mjs` in the deployment environment
before traffic is opened. Export chat variables into the checking process only
when chat is enabled. The validator does not load `.env` files automatically.
Treat any nonzero exit as a failed deploy.

Docker order after both local env files are complete:

```powershell
docker compose -f compose.production.yml --env-file .env.production.local --profile prod-migrate up --build --abort-on-container-exit --exit-code-from billboard-migrate-prod billboard-migrate-prod
docker compose -f compose.production.yml --env-file .env.production.local --profile prod up -d --build billboard-db-prod billboard-prod
docker compose -f compose.production.yml --env-file .env.development.local --profile dev-migrate up --build --abort-on-container-exit --exit-code-from billboard-migrate-dev billboard-migrate-dev
docker compose -f compose.production.yml --env-file .env.development.local --profile dev up -d --build billboard-db-dev billboard-dev
docker compose -f compose.production.yml --env-file .env.production.local --profile proxy up -d billboard-nginx
```

Do not start Nginx before both app containers exist; Nginx resolves its
upstream names while loading configuration.
The Compose file does not run the scheduled sweep or automate backups. Set an
external scheduler to call `GET /api/cron/sweep` on each domain using its
own `CRON_SECRET`, and schedule encrypted PostgreSQL backups plus regular
restore drills. Register each domain and its callback URLs separately in
Google OAuth and Xendit (sandbox for dev, live only after approval for prod).

This repository's `vercel.json` configures a cron only; it does not establish
a deployment target. If hosting Next on a serverless platform without persistent
filesystem mounts, private uploads cannot use its ephemeral local disk. Choose
hosting with a persistent volume or move private uploads to object storage
before deploying that configuration.

## Staging Deploy Order

1. Select production-like staging credentials, a sandbox Xendit account, and a
   unique staging domain. Ensure staging cannot send payments or callbacks to
   production.
2. Inject staging secrets from `.env.development.example`. Keep
   `NEXT_PUBLIC_CHAT_ENABLED=false`; no `chat-server/.env` is needed while chat
   is paused.
3. Install locked dependencies, run the relevant tests, then build the Next
   application with staging `NEXT_PUBLIC_*` values present.
4. Back up staging before database changes. Run
   `./scripts/backup-postgres.ps1 -OutputDirectory <protected-backup-directory>`.
   Record only the generated archive path and checksum in release notes.
5. Review migration state, then run `npx prisma migrate deploy`. Never use
   `prisma db push`, `prisma migrate reset`, or seed commands against staging or
   production as a deployment substitute.
6. Start or restart `billboard-dev`, then verify Nginx reaches
   `billboard-dev:3000` using the development hostname through port `18087`.
7. Smoke-test login, a normal booking path, admin access, uploads, and scheduled
   sweep authentication. Confirm chat UI stays absent, then open staging to
   reviewers.

## Backup And Restore

Create a timestamped custom-format archive:

```powershell
./scripts/backup-postgres.ps1 -OutputDirectory D:\protected-backups
```

The backup script checks `pg_dump` and `pg_restore`, uses credentials only in
its child-process environment, creates `postgres-<database>-<timestamp>.dump`,
then validates the archive with `pg_restore --list`. It never writes the
connection URL or password.

Verify recovery before relying on a backup:

1. Provision a disposable database with the same PostgreSQL major version.
2. Set its `DATABASE_URL` through the secret manager, then run the restore
   script against that target archive.
3. Type the exact confirmation text displayed by the script, or pass the same
   value with `-Confirmation`; restoration otherwise stops before changing the
   database.
4. Run `npx prisma migrate status`, start the application against the restored
   database, and smoke-test login, a representative booking, payment records,
   and chat history. Delete the disposable environment only after verification.

Example restore command:

```powershell
./scripts/restore-postgres.ps1 -BackupPath D:\protected-backups\postgres-example-20261018-120000.dump
```

The restore uses `--clean --if-exists`; it removes database objects before
recreating them. It must never target a live database unless the release owner
has declared an incident, traffic is stopped, and a current backup exists.

## Xendit Sandbox E2E

1. Use only sandbox credentials and a staging callback URL for
`/api/xendit/webhook`. Confirm `XENDIT_CALLBACK_TOKEN` matches the token set in
the Xendit sandbox dashboard.
2. Create a new staging booking and open the payment component. Confirm the
   Xendit session has the expected reference ID, customer, amount, and return
   URL; do not record component keys or secrets.
3. Complete payment with an approved sandbox method. Confirm Xendit delivers
   the webhook successfully, then confirm exactly one matching payment and the
   expected booking state exist in the application.
4. Replay the sandbox webhook once. The second delivery must be accepted or
   safely ignored without creating another payment, booking, or fulfillment.
5. Test a declined or expired sandbox payment. The booking must not be marked
   paid. Save redacted request IDs and resulting status for release evidence.

## Production Release And Rollback

Deploy production in the same order as staging: verified environment, backup,
`npx prisma migrate deploy`, then `billboard-prod`. Verify the production
hostname through Nginx before Cloudflared traffic is enabled. Chat remains off.
Do not introduce a non-backward-compatible migration until all application
instances that require the old schema are drained.

If smoke tests fail, stop traffic expansion. Roll back application and
chat-server artifacts first when the deployed schema remains compatible. Do not
blindly restore a database to roll back code: it discards post-deploy writes.
For a database incident, stop writes, create an additional incident backup,
restore only after the explicit script confirmation, verify in isolation where
possible, then reopen traffic after the checks in this runbook pass.
