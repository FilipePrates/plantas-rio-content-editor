# Shared plant editor

Address: https://admin.plantas.avesdobrasil.app

## Shared guide branding

The editor uses the guide's Mandevilla mark in its toolbar, loading state,
login and browser favicon, with the same pine and cream palette. The two
small PNG assets are copied into `src/assets` and imported by Vite, so the
cloud build includes the branding while continuing to exclude `public/`.
Local IndexedDB drafts, explicit Save, unsaved-change prompts and the cloud
review/publication boundaries are preserved. No authentication, API, database
or bucket settings are changed by the branding update.

Deployed branding/UI version: `bea12368-ac3f-465b-acec-73182dc3db2c`.
TypeScript and all 12 editor tests passed. Isolated local browser checks covered
unsaved-change cancellation and saved-draft persistence after reload. The cloud
build was checked to exclude the seed catalog and private photos. Live checks
verified the Mandevilla login/favicon at desktop and mobile widths and confirmed
`GET /api/catalog` still returns 401 without authentication. No shared records,
members, approvals or credentials were changed during verification.
Artifacts: `.local/local-branding-result.json`, `.local/live-branding-result.json`
and branding screenshots. The matching public-guide desktop catalog deployment
is `e7320b61-4761-4479-82fc-300a0c45e319`.

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

## November 12, 2026 common-name update

Published editor version `d4696c0c-ff17-4c82-9827-2ac422893fdb`. The identity
field is now “Nome comum principal (opcional)”. Empty common names are accepted,
and saving a repeated scientific name clears that placeholder. Scientific-name
fallback headings use regular-weight italics without a repeated subtitle.

Migration `004_common_names.sql` cleared 220 repeated names in the shared plant
database. A private backup and verification confirmed all unrelated records,
drafts, review states and existing history were preserved. Each correction has a
new history revision; no common-name placeholders remain. The migration was
tested for idempotence before application.

TypeScript and all 14 tests passed. Isolated local desktop/mobile checks verified
save/reload, empty-name JSON export and unsaved-change cancellation. Cloud
preview and live checks verified login, branding, exact asset hashes and the
exclusion of the seed catalog, private photos and service key. Unauthenticated
catalog and media requests still return 401. Authenticated live editing was not
used for verification. Artifacts and the private backup are under
`.local/deploy-finish-20261112/`.
