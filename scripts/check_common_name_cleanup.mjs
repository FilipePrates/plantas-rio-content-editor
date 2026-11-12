import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [stage, directory = '.local/deploy-finish-20261112'] = process.argv.slice(2);
assert.ok(['before', 'after'].includes(stage));
const project = JSON.parse(await readFile('.local/project.json', 'utf8'));
assert.equal(project.name, 'plantas-do-rio');
assert.equal(process.env.SUPABASE_URL, `https://${project.id}.supabase.co`);
const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
async function rows(table, order) {
  const result = [];
  for (let offset = 0; ; offset += 250) {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}?select=*&order=${order}&offset=${offset}&limit=250`, { headers, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Plant backup read failed (${response.status})`);
    const batch = await response.json(); result.push(...batch);
    if (batch.length < 250) return result;
  }
}
const snapshot = { plants: await rows('plants', 'id'), metadata: await rows('plant_catalog_meta', 'id'), history: await rows('plant_history', 'plant_id,revision') };
const repeated = plant => typeof plant.document.commonName === 'string' && plant.document.commonName.trim() && plant.document.commonName.trim().toLowerCase() === plant.document.scientificName.trim().toLowerCase();
const target = resolve(directory); await mkdir(target, { recursive: true });
if (stage === 'before') {
  const file = resolve(target, 'database-before.json');
  await writeFile(file, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ backedUpRecords: snapshot.plants.length, repeatedCommonNames: snapshot.plants.filter(repeated).length, historyRows: snapshot.history.length }));
} else {
  const before = JSON.parse(await readFile(resolve(target, 'database-before.json'), 'utf8'));
  const changed = before.plants.filter(repeated);
  assert.equal(snapshot.plants.length, before.plants.length);
  assert.equal(snapshot.plants.filter(repeated).length, 0);
  for (const original of before.plants) {
    const actual = snapshot.plants.find(row => row.id === original.id); assert.ok(actual);
    if (!repeated(original)) assert.deepEqual(actual, original);
    else {
      assert.deepEqual(actual.document, { ...original.document, commonName: '' });
      assert.equal(actual.revision, original.revision + 1);
      assert.equal(actual.editorial_state, original.editorial_state);
      assert.equal(actual.updated_by, null);
      const entry = snapshot.history.find(row => row.plant_id === actual.id && row.revision === actual.revision);
      assert.ok(entry); assert.deepEqual(entry.document, actual.document);
      assert.equal(entry.editorial_state, actual.editorial_state); assert.equal(entry.changed_by, null);
    }
  }
  for (const entry of before.history) assert.deepEqual(snapshot.history.find(row => row.plant_id === entry.plant_id && row.revision === entry.revision), entry);
  assert.equal(snapshot.history.length, before.history.length + changed.length);
  assert.equal(snapshot.metadata[0].revision, before.metadata[0].revision + (changed.length ? 1 : 0));
  const result = { changedRecords: changed.length, remainingRepeatedCommonNames: 0, unrelatedRecordsPreserved: true, originalHistoryPreserved: true, cleanupRevisionsRecorded: true, editorialStatesPreserved: true };
  await writeFile(resolve(target, 'database-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
