import { parseCatalog } from '../src/catalog.mjs';
import { prepareSave, validPhotoName } from './core.mjs';
import {createClient} from '@supabase/supabase-js';
import {inspectObservation,importObservationPhotos} from './inaturalist.mjs';

const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' } });
async function db(env, path, options={}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey:env.SUPABASE_SERVICE_ROLE_KEY, authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type':'application/json', ...options.headers } });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    if (value?.message?.includes('conflict')) throw Object.assign(new Error('Outra pessoa salvou esta ficha. Exporte seu texto e recarregue o catálogo antes de tentar novamente.'),{status:409});
    throw new Error('Não foi possível concluir a operação no banco.');
  }
  return value;
}
async function member(request, env) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Entre para acessar o editor.'),{status:401});
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers:{authorization,apikey:env.SUPABASE_PUBLISHABLE_KEY} });
  if (!response.ok) throw Object.assign(new Error('Sessão expirada. Entre novamente.'),{status:401});
  const user = await response.json();
  const rows = await db(env,`plant_editors?user_id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=user_id,display_name,role`);
  if (!rows?.[0]) throw Object.assign(new Error('Seu acesso ainda não foi autorizado pelo administrador.'),{status:403});
  return { ...rows[0], email:user.email };
}
async function load(env) {
  const metadata = (await db(env,'plant_catalog_meta?select=document,revision'))[0];
  if (!metadata) throw new Error('O catálogo inicial ainda não foi carregado.');
  const rows=[];
  for(let start=0;;start+=250) {
    const batch=await db(env,`plants?select=*&order=id&offset=${start}&limit=250`);
    rows.push(...batch);
    if(batch.length<250) break;
  }
  return { rows, revision:metadata.revision, catalog:parseCatalog({...metadata.document,plants:rows.map(row=>row.document)}) };
}
async function body(request, limit=2_000_000) {
  if(Number(request.headers.get('content-length'))>limit) throw Object.assign(new Error('Arquivo muito grande.'),{status:413});
  const reader=request.body?.getReader();
  if(!reader) throw new Error('Requisição vazia.');
  const chunks=[];let length=0;
  try { for(;;){ const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Object.assign(new Error('Arquivo muito grande.'),{status:413});chunks.push(value); } } finally { await reader.cancel(); }
  const data=new Uint8Array(length);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
  return JSON.parse(new TextDecoder().decode(data));
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url), path=url.pathname;
    if(path==='/api/config') return json({configured:!!(env.SUPABASE_URL&&env.SUPABASE_PUBLISHABLE_KEY&&env.SUPABASE_SERVICE_ROLE_KEY),url:env.SUPABASE_URL||'',key:env.SUPABASE_PUBLISHABLE_KEY||''});
    if(!path.startsWith('/api/')&&!path.startsWith('/photos/')) return env.ASSETS.fetch(request);
    try {
      if(!env.SUPABASE_SERVICE_ROLE_KEY) return json({error:'O editor está aguardando a configuração do banco de dados.'},503);
      const actor=await member(request,env);
      if(request.method==='GET'&&path==='/api/session') return json(actor);
      if(request.method==='GET'&&path==='/api/usage'&&actor.role==='admin')return json(await db(env,'rpc/plant_editor_usage',{method:'POST',body:'{}'}));
      if(request.method==='GET'&&path==='/api/catalog') {
        const response=await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/plant_catalog_snapshot`,{method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:'{}'});
        if(!response.ok)throw new Error('Não foi possível carregar o catálogo compartilhado.');
        return new Response(response.body,{headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
      }
      if(request.method==='POST'&&path==='/api/plant') {
        const input=await body(request);
        const metadata=(await db(env,'plant_catalog_meta?select=document,revision'))[0];
        if(!metadata)throw new Error('Catálogo não configurado.');
        const old=(await db(env,`plants?id=eq.${encodeURIComponent(input.plant?.id||'')}&select=document,revision`))[0];
        if(!Number.isSafeInteger(input.revision)||input.revision<0) return json({error:'Revisão inválida.'},400);
        if((old?.revision||0)!==input.revision)return json({error:'Outra pessoa salvou esta ficha. Copie seu texto e atualize o catálogo antes de salvar novamente.'},409);
        const plant=prepareSave({...metadata.document,plants:old?[old.document]:[]},input.plant,old?.document,actor.role,input.state);
        // Every photograph must have immutable acquisition evidence in the plant bucket.
        for(const photo of plant.photos) {
          const previous=old?.document.photos.find(item=>item.id===photo.id);
          const immutable=['fileName','photoId','observationId','taxonId','taxonName','creator','license','licenseCode','attribution','licenseUrl','photoPageUrl','sourceUrl','observationUrl','downloadedAt','sha256'];
          if(previous&&immutable.every(key=>previous[key]===photo[key]))continue;
          const evidence=await env.MEDIA_BUCKET.get(`evidence/${photo.photoId}.json`);
          if(!evidence) return json({error:`Foto ${photo.photoId}: falta a comprovação de origem.`},400);
          const proof=await evidence.json();
          if(proof.download.sha256!==photo.sha256||proof.photo.id!==photo.photoId||proof.photo.license_code!==photo.licenseCode||proof.observation.id!==photo.observationId||proof.observation.taxon.id!==photo.taxonId||proof.observation.taxon.name!==photo.taxonName||proof.download.url!==photo.sourceUrl||proof.download.retrievedAt!==photo.downloadedAt||proof.creator!==photo.creator) return json({error:'A origem ou os direitos da foto foram alterados.'},400);
          const rights=proof.photo.license_code==='cc-by';
          if(rights&&(photo.attribution!==proof.photo.attribution||photo.creator!==proof.creator||photo.licenseUrl!=='https://creativecommons.org/licenses/by/4.0/'||photo.photoPageUrl!==`https://www.inaturalist.org/photos/${photo.photoId}`))return json({error:'O crédito CC BY precisa corresponder à aquisição.'},400);
        }
        const result=await db(env,'rpc/save_plant',{method:'POST',body:JSON.stringify({p_actor:actor.user_id,p_document:plant,p_expected_revision:input.revision,p_catalog_revision:metadata.revision,p_state:input.state})});
        return json(result);
      }
      const history=path.match(/^\/api\/plants\/([^/]+)\/history$/);
      if(request.method==='GET'&&history) {
        const [items,people]=await Promise.all([db(env,`plant_history?plant_id=eq.${encodeURIComponent(decodeURIComponent(history[1]))}&select=*&order=revision.desc&limit=20`),db(env,'plant_editors?select=user_id,display_name')]);
        return json(items.map(item=>({...item,author_name:people.find(person=>person.user_id===item.changed_by)?.display_name||'Catálogo inicial'})));
      }
      const comments=path.match(/^\/api\/plants\/([^/]+)\/comments$/);
      if(comments) {
        const id=decodeURIComponent(comments[1]);
        if(request.method==='GET') {
          const [items,people]=await Promise.all([db(env,`plant_comments?plant_id=eq.${encodeURIComponent(id)}&select=id,body,created_at,author_id&order=created_at.desc&limit=100`),db(env,'plant_editors?select=user_id,display_name')]);
          return json(items.map(item=>({...item,author_name:people.find(person=>person.user_id===item.author_id)?.display_name||'Colaborador'})));
        }
        if(request.method==='POST') {const input=await body(request,10000);if(typeof input.body!=='string'||!input.body.trim()||input.body.length>4000)return json({error:'Escreva um comentário de até 4.000 caracteres.'},400);await db(env,'plant_comments',{method:'POST',body:JSON.stringify({plant_id:id,author_id:actor.user_id,body:input.body.trim()})});return json({ok:true},201);}
      }
      if(path==='/api/members'&&request.method==='GET'&&actor.role==='admin') return json(await db(env,'plant_editors?select=*&order=display_name'));
      if(path==='/api/invitations'&&request.method==='POST'&&actor.role==='admin') {
        const input=await body(request,10000);
        if(typeof input.email!=='string'||!/^\S+@\S+\.\S+$/.test(input.email)||!['contributor','reviewer'].includes(input.role)||typeof input.name!=='string'||!input.name.trim()||input.name.length>120)return json({error:'Informe nome, email e permissão válidos.'},400);
        const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
        const {data,error}=await admin.auth.admin.generateLink({type:'invite',email:input.email,options:{redirectTo:url.origin}});
        if(error||!data.user)return json({error:'Não foi possível criar o convite. Confira se esse email já possui uma conta.'},400);
        await db(env,'plant_editors',{method:'POST',body:JSON.stringify({user_id:data.user.id,display_name:input.name.trim(),role:input.role})});return json({ok:true,link:data.properties.action_link},201);
      }
      if(path==='/api/members'&&request.method==='PATCH'&&actor.role==='admin') {
        const input=await body(request,10000);
        if(input.user_id===actor.user_id||!['contributor','reviewer'].includes(input.role)||typeof input.active!=='boolean')return json({error:'Permissão inválida; administradores são gerenciados separadamente.'},400);
        await db(env,`plant_editors?user_id=eq.${encodeURIComponent(input.user_id)}&role=neq.admin`,{method:'PATCH',body:JSON.stringify({role:input.role,active:input.active})});return json({ok:true});
      }
      if(path==='/api/recovery-links'&&request.method==='POST'&&actor.role==='admin') {
        const input=await body(request,10000);
        const person=(await db(env,`plant_editors?user_id=eq.${encodeURIComponent(input.user_id)}&active=eq.true&select=user_id`))[0];
        if(!person)return json({error:'Colaborador não encontrado.'},404);
        const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
        const user=await admin.auth.admin.getUserById(person.user_id);
        if(!user.data.user?.email)throw new Error('Conta indisponível.');
        const {data,error}=await admin.auth.admin.generateLink({type:'recovery',email:user.data.user.email,options:{redirectTo:url.origin}});
        if(error)throw new Error('Não foi possível criar o link.');return json({link:data.properties.action_link});
      }
      if(path.startsWith('/photos/')&&request.method==='GET') {
        const name=path.slice(8);if(!validPhotoName(name))return json({error:'Foto inválida.'},400);
        const thumbnail=url.searchParams.get('thumbnail')==='1'?await env.MEDIA_BUCKET.get(`thumbnails/${name.replace(/\.[^.]+$/,'.webp')}`):null;
        const object=thumbnail||await env.MEDIA_BUCKET.get(`photos/${name}`);if(!object)return json({error:'Foto não encontrada.'},404);
        const headers=new Headers({'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'});object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);return new Response(object.body,{headers});
      }
      const observation=path.match(/^\/api\/inaturalist\/observations\/([1-9]\d*)$/);
      if(observation&&request.method==='GET')return json(await inspectObservation(Number(observation[1])));
      if(path==='/api/inaturalist/photos'&&request.method==='POST')return json({photos:await importObservationPhotos(await body(request,10000),env.MEDIA_BUCKET)});
      return json({error:'Operação não permitida.'},404);
    } catch(error) {console.error('Plant editor operation failed',error.message);return json({error:error.message||'Não foi possível concluir a operação.'},error.status||400);}
  }
};
