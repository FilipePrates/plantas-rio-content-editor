import {createClient} from '@supabase/supabase-js';
import {chromium} from 'playwright-core';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,options={})=>originalFetch(input,{...options,signal:options.signal||AbortSignal.timeout(30000)});
const origin=process.env.EDITOR_TEST_ORIGIN||'https://admin.plantas.avesdobrasil.app';
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[];let browser;
const id=`qa-editor-${Date.now()}`,password=randomBytes(24).toString('hex');
async function user(role){const email=`${id}-${role}@example.com`;const result=await admin.auth.admin.createUser({email,password,email_confirm:true});if(result.error)throw result.error;const row={id:result.data.user.id,email,role};users.push(row);await writeFile('.local/qa-users.json',JSON.stringify(users));const insert=await admin.from('plant_editors').insert({user_id:row.id,display_name:'Validação temporária',role});if(insert.error)throw insert.error;const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;return{...row,token:login.data.session.access_token};}
async function request(path,actor,body,method){const response=await fetch(origin+path,{method:method||(body?'POST':'GET'),headers:{...(actor?{authorization:`Bearer ${actor.token}`} : {}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return{response,value:await response.json().catch(()=>null)}}
try{
  await mkdir('.local',{recursive:true});
  assert.equal((await request('/api/catalog')).response.status,401);
  assert.equal((await fetch(origin+'/photos/inat-123.jpg')).status,401);
  const owner=await user('admin'),contributor=await user('contributor');
  console.log('Temporary accounts ready.');
  const current=await request('/api/catalog',owner);assert.equal(current.response.status,200);assert.ok(current.value.catalog.plants.length>400);
  console.log('Private catalog access passed.');
  const original=current.value.catalog.plants.find(plant=>plant.photos.length);
  const fixture={...structuredClone(original),id,scientificName:'Testus validus',commonName:'Validação temporária',genus:'Testus',rank:'species',floraId:null,regionalSpecies:[],regionalEvidence:[],municipalEvidence:[],previousIds:[],photos:[],reviewStatus:'draft'};
  const saved=await request('/api/plant',contributor,{plant:fixture,revision:0,state:'submitted'});assert.equal(saved.response.status,200,JSON.stringify(saved.value));assert.equal(saved.value.document.reviewStatus,'draft');
  const blocked=await request('/api/plant',contributor,{plant:fixture,revision:1,state:'approved'});assert.notEqual(blocked.response.status,200);
  const approved=await request('/api/plant',owner,{plant:fixture,revision:1,state:'approved'});assert.equal(approved.response.status,200,JSON.stringify(approved.value));assert.equal(approved.value.document.reviewStatus,'reviewed');
  const conflict=await request('/api/plant',contributor,{plant:fixture,revision:1,state:'draft'});assert.equal(conflict.response.status,409,JSON.stringify(conflict.value));
  console.log('Shared saves, approval roles and conflicts passed.');
  assert.equal((await request(`/api/plants/${id}/comments`,contributor,{body:'Verificação de comentários.'})).response.status,201);
  assert.equal((await request(`/api/plants/${id}/comments`,owner)).value[0].author_name,'Validação temporária');
  assert.equal((await request(`/api/plants/${id}/history`,owner)).value.length,2);
  assert.notEqual((await request('/api/invitations',contributor,{name:'Blocked',email:`${id}-blocked@example.com`,role:'reviewer'})).response.status,201);
  const photo=original.photos[0];assert.equal((await fetch(`${origin}/photos/${photo.fileName}?thumbnail=1`,{headers:{authorization:`Bearer ${contributor.token}`}})).status,200);
  console.log('Comments, history and private photos passed.');
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin,{waitUntil:'networkidle'});
  await page.getByLabel('Email',{exact:true}).fill(owner.email);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('button',{name:'Salvar ficha',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'Colaboradores',exact:true}).click();await page.getByLabel('Nome',{exact:true}).fill('Convite de validação');const inviteEmail=`${id}-invite@example.com`;await page.getByLabel('Email',{exact:true}).fill(inviteEmail);await page.getByRole('button',{name:'Criar convite',exact:true}).click();const inviteInput=page.locator('input[readonly]').first();await inviteInput.waitFor();const inviteLink=await inviteInput.inputValue();assert.ok(inviteLink.startsWith(process.env.SUPABASE_URL));
  console.log('Administrator invitation link created.');
  const invited=(await admin.auth.admin.listUsers({perPage:100})).data.users.find(u=>u.email===inviteEmail);if(invited)users.push({id:invited.id,email:inviteEmail,role:'contributor'});
  const context=await browser.newContext();const guest=await context.newPage();await guest.goto(inviteLink,{waitUntil:'networkidle'});await guest.getByLabel('Defina sua senha',{exact:true}).fill(password);await guest.getByRole('button',{name:'Salvar senha',exact:true}).click();await guest.getByRole('button',{name:'Salvar ficha',exact:true}).waitFor({timeout:30000});assert.equal(await guest.getByRole('button',{name:'Colaboradores',exact:true}).count(),0);assert.equal(await guest.getByRole('button',{name:'Aprovar ficha',exact:true}).count(),0);
  await page.screenshot({path:'.local/cloud-editor-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/cloud-editor-mobile.png'});assert.equal(errors.length,0,errors.join('\n'));
  const usage=await request('/api/usage',owner);console.log('Cloud checks passed: private access, shared saves, conflicts, review roles, comments/history, photos, manual invitation and password setup.');console.log('Usage',usage.value);
}finally{
  if(browser)await browser.close();
  const invitedUsers=await admin.auth.admin.listUsers({perPage:100});
  for(const person of invitedUsers.data?.users||[]){if(person.email?.startsWith(id)&&!users.some(item=>item.id===person.id))users.push({id:person.id,email:person.email});}
  await admin.from('plant_comments').delete().eq('plant_id',id);await admin.from('plant_history').delete().eq('plant_id',id);await admin.from('plants').delete().eq('id',id);
  for(const person of users){await admin.from('plant_editors').delete().eq('user_id',person.id);await admin.auth.admin.deleteUser(person.id)}
}
