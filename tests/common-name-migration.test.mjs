import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('common-name cleanup preserves drafts, review state and old history and is idempotent', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');
    await db.exec(readFileSync(new URL('../supabase/migrations/001_plant_editor.sql', import.meta.url), 'utf8'));
    const catalog = JSON.parse(readFileSync(new URL('../public/catalog.json', import.meta.url), 'utf8'));
    catalog.plants = catalog.plants.slice(0, 3);
    catalog.plants[0].commonName = ` ${catalog.plants[0].scientificName.toUpperCase()} `;
    catalog.plants[1].commonName = '';
    catalog.plants[2].commonName = 'Nome popular preservado';
    await db.query('select public.seed_plant_catalog($1::jsonb)', [JSON.stringify(catalog)]);
    await db.query("update public.plants set editorial_state='submitted' where id=$1", [catalog.plants[0].id]);
    const migration = readFileSync(new URL('../supabase/migrations/004_common_names.sql', import.meta.url), 'utf8');
    const before = (await db.query('select * from public.plants order by id')).rows;
    await db.exec(migration);
    const after = (await db.query('select * from public.plants order by id')).rows;
    for (const original of before) {
      const row = after.find(item => item.id === original.id);
      if (row.id === catalog.plants[0].id) {
        assert.deepEqual(row.document, { ...original.document, commonName: '' });
        assert.equal(row.editorial_state, 'submitted');
        assert.equal(row.revision, original.revision + 1);
        assert.equal(row.updated_by, null);
        const history = (await db.query('select * from public.plant_history where plant_id=$1 order by revision', [row.id])).rows;
        assert.equal(history.length, 2);
        assert.deepEqual(history[0].document, original.document);
        assert.deepEqual(history[1].document, row.document);
        assert.equal(history[1].editorial_state, 'submitted');
        assert.equal(history[1].changed_by, null);
      } else assert.deepEqual(row, original);
    }
    assert.equal((await db.query('select revision from public.plant_catalog_meta')).rows[0].revision, 2);
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from public.plants order by id')).rows, after);
    assert.equal((await db.query('select revision from public.plant_catalog_meta')).rows[0].revision, 2);
  } finally { await db.close(); }
});
