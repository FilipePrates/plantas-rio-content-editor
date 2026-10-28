# Plantas do Rio — Content Editor

- Independent local React + Vite + TypeScript editor. Do not edit the bird
  editor or reuse its credentials, Supabase project, Worker, bucket or remotes.
- This initial editor uses IndexedDB, not a shared cloud database. Do not imply
  multi-user sync, server authentication, revisions or hosted deployment exist.
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
