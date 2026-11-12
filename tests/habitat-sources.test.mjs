import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('habitat source notes require an administrator and preserve revisions on conflicts',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/001_plant_editor.sql',import.meta.url),'utf8'));
    await db.exec(readFileSync(new URL('../supabase/migrations/005_habitat_sources.sql',import.meta.url),'utf8'));
    await db.exec(`insert into public.plant_editors values ('11111111-1111-4111-8111-111111111111','Admin','admin',true),('22222222-2222-4222-8222-222222222222','Contributor','contributor',true)`);
    const save=(actor,content,revision)=>db.query('select public.save_habitat_source_notes($1,$2,$3)',[actor,content,revision]);
    const admin='11111111-1111-4111-8111-111111111111';
    await assert.rejects(()=>save('22222222-2222-4222-8222-222222222222','no',0),/admin_required/);
    await save(admin,'first',0);
    await assert.rejects(()=>save(admin,'stale',0),/revision_conflict/);
    await save(admin,'second',1);
    assert.equal((await db.query('select count(*)::int n from public.habitat_source_notes_history')).rows[0].n,2);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select * from public.habitat_source_notes'),/permission denied/);
  } finally {await db.close()}
});
