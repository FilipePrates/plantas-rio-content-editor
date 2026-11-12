import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {prepareSave,validPhotoName} from '../worker/core.mjs';
import {trustedPhotoUrl} from '../worker/inaturalist.mjs';
const seed=JSON.parse(readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
test('contributors cannot approve or grant their own text/photo review',()=>{
  const previous=structuredClone(seed.plants.find(p=>p.photos.length));
  const draft=structuredClone(previous);draft.reviewStatus='reviewed';draft.photos[0].caption+=' edited';draft.photos[0].reviewStatus='reviewed';
  const saved=prepareSave({...seed,plants:[previous]},draft,previous,'contributor','submitted');
  assert.equal(saved.reviewStatus,'draft');assert.equal(saved.photos[0].reviewStatus,'draft');
  assert.throws(()=>prepareSave({...seed,plants:[previous]},draft,previous,'contributor','approved'));
});
test('media paths and observation URLs reject traversal, hostile hosts and unsupported rights',()=>{
  assert.equal(validPhotoName('inat-123.jpg'),true);assert.equal(validPhotoName('../secret'),false);
  assert.throws(()=>trustedPhotoUrl({id:123,url:'https://evil.test/photos/123/large.jpg',license_code:'cc0'}));
  assert.throws(()=>trustedPhotoUrl({id:123,url:'https://static.inaturalist.org/photos/123/large.jpg',license_code:'cc-by-nc'}));
});
test('database enforces permissions, atomic revisions, cross-record uniqueness and approval roles',async()=>{
  const db=new PGlite();try{
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values ('11111111-1111-4111-8111-111111111111');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/001_plant_editor.sql',import.meta.url),'utf8'));
    const catalog={...seed,plants:seed.plants.slice(0,2)};
    await db.query('select public.seed_plant_catalog($1::jsonb)',[JSON.stringify(catalog)]);
    await db.exec(`insert into public.plant_editors values ('11111111-1111-4111-8111-111111111111','Expert','contributor',true)`);
    const plant={...catalog.plants[0],description:catalog.plants[0].description+' revised'};
    const save=(doc,revision,catalogRevision,state='draft')=>db.query('select public.save_plant($1,$2::jsonb,$3,$4,$5)', ['11111111-1111-4111-8111-111111111111',JSON.stringify(doc),revision,catalogRevision,state]);
    await save(plant,1,1,'submitted');
    await assert.rejects(()=>save(plant,1,2),/revision_conflict/);
    await assert.rejects(()=>save(plant,2,2,'approved'),/reviewer_required/);
    await assert.rejects(()=>save({...plant,id:'duplicate-species'},0,2),/duplicate_or_excess_species/);
    assert.equal((await db.query('select count(*)::int n from public.plants')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.plant_history')).rows[0].n,3);
    await db.exec('set role authenticated');await assert.rejects(()=>db.query('select * from public.plants'),/permission denied/);
    await assert.rejects(()=>save(plant,2,2),/permission denied/);
  }finally{await db.close()}
});
