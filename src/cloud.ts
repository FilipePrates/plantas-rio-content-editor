import type { SupabaseClient } from '@supabase/supabase-js';
import type { Catalog, Plant } from './catalog.mjs';
import { parseCatalog } from './catalog.mjs';
export const cloudMode=import.meta.env.MODE==='cloud';
export type Membership={user_id:string;display_name:string;role:'admin'|'reviewer'|'contributor';email:string};
export type RecordMeta={id:string;revision:number;editorial_state:'draft'|'submitted'|'approved';updated_at:string};
export const records=new Map<string,RecordMeta>();
export let membership:Membership|null=null;
let client:SupabaseClient;
export function configureCloud(value:SupabaseClient,member:Membership){client=value;membership=member;}
export async function cloudRequest<T>(path:string,body?:unknown,method?:string):Promise<T>{
  const {data,error}=await client.auth.getSession();
  if(error||!data.session)throw Error('Sessão expirada. Entre novamente.');
  const response=await fetch(path,{method:method||(body===undefined?'GET':'POST'),headers:{authorization:`Bearer ${data.session.access_token}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Não foi possível concluir a operação.');return value;
}
export async function loadSharedCatalog():Promise<Catalog>{
  const value=await cloudRequest<{catalog:Catalog;records:RecordMeta[]}>('/api/catalog');
  const catalog=parseCatalog(value.catalog);records.clear();for(const row of value.records)records.set(row.id,row);return catalog;
}
export async function saveSharedPlant(plant:Plant,state:string){
  const row=await cloudRequest<RecordMeta&{document:Plant}>('/api/plant',{plant,revision:records.get(plant.id)?.revision||0,state});records.set(row.id,row);return row.document;
}
export async function authenticatedPhoto(name:string,thumbnail:boolean){
  const {data}=await client.auth.getSession();if(!data.session)throw Error('Sessão expirada.');
  const response=await fetch(`/photos/${encodeURIComponent(name)}${thumbnail?'?thumbnail=1':''}`,{headers:{authorization:`Bearer ${data.session.access_token}`}});
  if(!response.ok)throw Error('Não foi possível carregar a foto.');return URL.createObjectURL(await response.blob());
}
