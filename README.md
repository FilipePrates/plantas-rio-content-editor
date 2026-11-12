# Plantas do Rio de Janeiro — Content Editor

The shared invitation-only editor is hosted at **https://admin.plantas.avesdobrasil.app**.
See [cloud access, invitations, publishing and usage](docs/cloud-editor.md).
`npm run dev` still opens the independent local draft editor described below.

Independent React + TypeScript + Vite editor for the plant guide. The workflow
is adapted from Aves do Brasil's content editor: searchable species, identity
and profile text, photo order, captions, structure markers, source metadata,
explicit Save, and validated exports. This first version works locally without
a Supabase account, Worker, R2 bucket, or copied production configuration.

```bash
npm ci
npm run dev
```

On this Windows workspace, dependencies and Node are already installed. In
PowerShell, run the local launcher from any folder and keep its terminal open:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Samsung\aves-do-brasil\plantas-rio-content-editor\start-editor.ps1"
```

Press Ctrl+C to stop. The launcher uses this workspace's Node installation and
starts only the plant editor. If it is already running, the launcher prints its
address and exits successfully without starting a second server. Open the address below in the same browser/profile
each time to keep your saved drafts.

Open http://127.0.0.1:5174. The different port prevents colliding with the bird
editor on its default development port. Node 20.19.4+ in the package range.

## Editorial workflow

1. Search by common/scientific/alternate names or family. Filter native/invasive
   entries and draft/reviewed status.
2. Edit the identity, description, identification, ecology, names and habitats.
   Records can represent one species or an explicitly enumerated genus group.
3. Inspect photos; set Flor, Fruto, Folha, Casca, Planta inteira, Semente or Raiz only
   when visible in that individual photo. Reorder photos and edit captions.
4. Mark text/photos reviewed only after checking them. Automatic imports stay
   drafts. The file's verified CC0 / CC BY provenance is not editable through the UI.
5. Set the prominent **Exótica invasora** checkbox, or choose Native/Exotic
   classification in **Origem**. There is no fixed limit of five invasives.
6. Save the record. A successful save commits the entire working catalog to
   IndexedDB in this browser before reporting success.
7. Export JSON regularly. Unsaved record edits block export. Import the JSON
   into the plant app for review; the CLI validates hashes and archived rights
   evidence before applying it.

Data stays in this browser's origin/profile. It is not synchronized with
another device, another port, or another editor, and can be lost if browser
storage is cleared. Export JSON for backups. The original seed in
`public/catalog.json` is never edited by the browser.

Unsaved record changes prompt before switching records or replacing the
catalog. Import validates first, shows the number of records/species, and
requires a UI confirmation before replacing the local working catalog.

## Refresh from the plant app

From the sibling app repository:

```bash
npm run catalog:generate
npm run editor:sync
```

This copies the canonical JSON, shared runtime validator and type declarations,
and local CC0 / CC BY photos. Existing browser edits are preserved: import the updated
`public/catalog.json` explicitly to replace a local draft. New photos can be imported directly from an observation in this editor, or
through `npm run photos:fetch` in the app. The importer verifies and archives
photo-level CC0 / CC BY evidence; a manually entered copyright declaration is not proof.

Then return an export to the app:

```bash
cd ../plantas-do-rio-de-janeiro
npm run catalog:import -- /path/to/export.json
npm run catalog:import -- /path/to/export.json --apply
npm run check
```

The first command is read-only. The second keeps a local backup and applies
the export only after validating the catalog and the exact CC0 / CC BY media evidence.

## Boundaries of this first draft

This is a functional local adaptation, not a production cloud clone. Shared
editor accounts, access controls, optimistic revisions/history, remote media
uploads, deployment and backups require a separate plant cloud setup later.
No existing production editor, account, bucket, app identifier or secrets are
used. No deployment or build is performed by the initial setup.

The `+` button adds a species draft. Sources are required before saving. The
advanced JSON section edits source references, JBRJ ID, curation notes and
enumerated members of grouped genera. Every represented species counts toward
the 1,500 ceiling; duplicate members and unsupported photo licenses fail validation.

```bash
npm run typecheck
npm test
```

The browser smoke test exercises both projects with an isolated browser
profile. Start the app web server on port 8083 and this editor on port 5174,
then run `npm run test:browser`. Set `CHROME_PATH` if Google Chrome is installed
somewhere other than `/usr/bin/google-chrome`. Test exports and screenshots
go to the system temporary directory.

## Add or replace photos from iNaturalist

Restart `npm run dev` after updating the editor, then keep using the same
http://127.0.0.1:5174 address and browser to retain your existing draft.

1. Open a plant and click **Adicionar fotos do iNaturalist**.
2. Paste an observation URL or its numeric ID and click **Carregar observação**.
3. Select individual CC0 or CC BY photos. Photos already in the profile are marked;
   photographs with other licenses are excluded. A different identification from
   the plant's species or genus members shows an amber warning without blocking
   import, save or export. The original observation identification is retained.
4. Click **Adicionar**. Repeat with other observations; there is no per-plant
   two-photo limit. The observation list shows which observations supply photos.
5. **Substituir** opens the same chooser for replacing an individual photo.
   **Usar como primeira** selects the first photo used in the guide and sidebar.
   Reorder or remove photos, or remove all photos from one observation.
6. Set the category icons after inspecting the actual image, then **Salvar ficha**
   and **Exportar JSON**. The app import workflow is unchanged.

This import feature is local to `npm run dev`: it downloads public iNaturalist
images into the sibling plant app's asset cache and writes photo-license
evidence there, without changing its canonical catalog. It also copies the
images into this editor's public photo cache for previews. No bird app, account,
cloud service or production bucket is involved. Existing cached evidence is
kept intact, and removing a photo from a profile does not delete the cached file.

Categories are Flor, Fruto, Folha, Casca, Planta inteira, Semente and Raiz.
Older `Porte` tags load as `Planta inteira` without discarding saved edits.
Turning the invasive checkbox off keeps the plant classified as exotic; choose
**Nativa** in **Origem** when that is the intended botanical classification.

CC BY imports preserve the photo’s original attribution (which may differ from the observer), source page and CC BY 4.0 link. Credits also explain resizing/cropping. NC, SA and ND variants remain unsupported. Existing acquisition evidence is immutable.
