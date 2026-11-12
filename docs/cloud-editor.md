# Shared plant editor

Address: https://admin.plantas.avesdobrasil.app

The cloud build uses its own Supabase project, private R2 bucket and Cloudflare
Worker. It never uses the bird editor's credentials or data. `npm run dev`
continues to run the browser-local editor; existing IndexedDB drafts are intact.

## Invite experts

Sign in as administrator, open **Colaboradores**, provide the person's name,
email and role, and choose **Criar convite**. Copy the individual link and share
it privately with that person. They open it, choose a password, and can then
sign in normally. No invitation email provider or Cloudflare account is needed.
Treat invitation and password-reset links as credentials. The administrator
can generate a new access link with **Redefinir acesso**. The login page directs
people who forget their password to the administrator; automatic email delivery
is not configured. Suspended members lose access to the API immediately.

Contributors edit and submit drafts. Reviewers and administrators can approve
text; photo review is tracked separately. Every save records its author and a
revision. A stale save is rejected without overwriting another person's work.
History can load an older version as an unsaved draft. Comments support discussion.

## Publishing reviewed content

Saving or approving in this editor does not change the public guide. Export
JSON, run the plant app's validated `catalog:import` workflow, review photo rights
and drafts, then run that app's web deployment. New photo imports retain their
acquisition evidence in the private plant bucket. Exported JSON alone does not
contain those image/evidence files; download them from the bucket before importing
new media into the app. The public guide remains independent of Supabase uptime.

## Usage and backups

Supabase stores text, photo metadata, memberships, comments and record revisions.
Photographs, thumbnails and immutable license evidence are in R2 Standard.
The initial catalog has 429 records and 721 unique photos, approximately 0.38 GB
including thumbnails. Existing account storage was about 6 GB before adding
plants. R2's free allowance is account-wide, not per bucket.

The private admin endpoint `/api/usage` reports database bytes, record/revision
counts and active editors. The Supabase dashboard remains the source for
plan quotas and egress; Cloudflare billing shows account-wide R2/Worker usage.
Free projects can pause after low activity. Keep regular validated JSON exports
and off-cloud copies of photos/evidence. Never prune history without an archive.

## Development and deployment

```sh
npm run typecheck
npm test
npm run build:cloud
npx wrangler deploy
```

`build:cloud` deliberately excludes `public/` so the seed catalog and private
photographs are not deployed as public assets. The Worker authenticates all API
and photo requests. Its service-role key exists only as a Worker secret and in
ignored local setup files; it is never part of the browser bundle.

Apply new migrations once with `supabase db query --remote=<plant-project-ref>
--file supabase/migrations/<file>.sql --yes`. The initial schema and catalog are
already installed. Never rerun the initial seed against a working catalog.

Local `.env.cloud` and `.local/` files contain plant-only setup credentials and
one-use access links; do not commit them. `scripts/prepare-cloud.mjs` verifies
canonical photo hashes before producing bulk-upload manifests. Initial uploads
use `wrangler r2 bulk put`; do not overwrite acquired rights evidence later.

Run cloud integration checks with `node --env-file=.env.cloud
scripts/cloud-smoke.mjs`. They create and remove temporary users and a temporary
plant fixture, exercising the hosted access controls and invitation flow.
