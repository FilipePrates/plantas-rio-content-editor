# Plantas do Rio — Content Editor

- Independent local React + Vite + TypeScript editor. Do not edit the bird
  editor or reuse its credentials, Supabase project, Worker, bucket or remotes.
- Local development uses IndexedDB. The separate `cloud` build uses the dedicated
  plant Supabase project, authenticated Worker APIs and private R2 media described
  in `docs/cloud-editor.md`. Preserve both modes and keep cloud credentials out
  of browser bundles. Saving and approval must not directly publish the guide.
- Canonical reviewed app data lives in the sibling
  `plantas-do-rio-de-janeiro/src/data/plants.json`. Refresh this editor's seed,
  schema and local photos with `npm run editor:sync` from the app repository.
- Preserve explicit Save, unsaved-change prompts, validated JSON import/export,
  photo-level CC0 or CC BY 4.0 photos (authorized 2026-10-28), attribution and license links, source provenance, flora IDs and grouped-member records.
- New photos enter through the local editor's verified observation importer or
  the app's iNaturalist downloader; license
  declarations entered in a browser are not sufficient evidence for release.
- Max 1,500 represented species, including group members. Native, introduced
  and invasive classifications are editable; do not cap the invasive count.
  State evidence must not silently become city evidence.
- Run `npx tsc --noEmit` and `npm test` for meaningful changes. Do not run build
  or deployment commands unless the user explicitly requests them.

## Building new plant fichas

- Work in batches of any appropriate size. Start with the existing catalog,
  grouped genus members and the tree/shrub workbook in the guide's `docs/`.
  The workbook is a candidate index, not proof of municipal occurrence, and
  does not cover all life forms. Use the Noblick (2017) Syagrus revision in
  the same directory for palm morphology and specimen citations. Check current
  names and distribution against Flora e Funga do Brasil; record source dates,
  pages, uncertainty and conflicting taxonomic or conservation assessments.
- Prioritize candidates with useful, verifiably licensed photographs and good
  primary botanical descriptions. Confirm accepted name, native status, Rio
  state and Atlantic Forest scope; keep `rio-state` without specific municipal
  evidence. A cultivated or iNaturalist observation alone does not establish
  native occurrence, locality, edibility or conservation status.
- Write original, readable Portuguese descriptions, practical identification
  comparisons and ecology grounded in cited sources. Explain variation and
  identification limits; don't replace approved professional text with generic
  drafts. Attribute conservation categories to the assessment and year.
- Prefer multiple complementary iNaturalist images whose individual photo
  licenses are CC0 or CC BY 4.0. Use the verified importer/downloader, retain
  response evidence, creator, photo and observation URLs, license, hashes and
  required CC BY attribution and modification disclosure. Inspect each image
  for identification, quality, caption and photo-specific markers. Imported
  images and generated text remain drafts until human review; a license claim
  alone is not a release check.
- When splitting a genus, transfer the exact member's photographs and evidence,
  preserve IDs and redirects, remove duplicate membership, and recalculate the
  group's dated state-level member and substrate counts and gallery text.
  Preserve other members, existing photos and evidence. Defer disputed taxa.
- Stage and record candidates, sources, photo choices, unresolved questions and
  before/after counts. Apply reviewed data through the guide's canonical catalog
  and `npm run editor:sync`; do not overwrite cloud drafts or re-seed an active
  catalog. Follow the guide's catalog and photo generation/check commands and
  its explicit web publication workflow. Review and publication are separate;
  an editor save or deployment does not itself publish guide content.

## Branding and UI

- Share the guide's Mandevilla identity and pine/cream palette. Editor branding
  assets are imported from `src/assets`; keep the guide's generated masters and
  provenance in its own branding documentation.
- Preserve both the local editor and cloud login/editor experiences. Check
  narrow screens and desktop toolbars, including unsaved-change cancellation
  and saved-draft persistence in an isolated browser context.
- UI work must not change authentication, membership roles, approval semantics
  or publication behavior without a separate task requiring those changes.

## Cloud build and release checks

- Public login: https://admin.plantas.avesdobrasil.app. Follow
  `docs/cloud-editor.md` for the dedicated plant deployment.
- The cloud build excludes `public/`. Branding belongs in imported assets;
  seed catalogs, private photos, setup files and credentials must not become
  public build assets. Preserve authentication on catalog and media endpoints.
- Never rerun initial cloud seeding against an active catalog. Do not create
  accounts, invitations or shared test records for routine visual checks.
- Local browser checks can exercise saves against isolated IndexedDB. Live
  unauthenticated checks can verify login, branding and API rejection; report
  that scope honestly instead of claiming an authenticated end-to-end test.
- Preserve existing drafts and unrelated work. Do not commit `.env*`, `.local/`,
  invitation/reset links, private exports, service credentials or build logs.
- After an authorized deployment, verify the live login and affected UI and
  document the deployed version. Saving or approving editor content still
  requires the separate reviewed guide publication workflow.
