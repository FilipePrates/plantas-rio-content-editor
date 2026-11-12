import {useEffect, useState} from 'react';
import {cloudRequest} from './cloud';
import urbana from './assets/habitats/urbana-habitat.jpg';
import caatinga from './assets/habitats/caatinga-habitat.jpg';
import cerrado from './assets/habitats/cerrado-habitat.jpg';
import ciliar from './assets/habitats/ciliar-habitat.jpg';
import mangue from './assets/habitats/manguezal-habitat.jpg';
import mista from './assets/habitats/mista-habitat.jpg';
import ombrofila from './assets/habitats/ombrofila-habitat.jpg';
import rochas from './assets/habitats/afloramento-habitat.jpg';
import {HabitatSources} from './HabitatSources';

const defaults:Record<string,string>={'Área Antrópica':urbana,'Caatinga (stricto sensu)':caatinga,'Cerrado (lato sensu)':cerrado,'Floresta Ciliar ou Galeria':ciliar,'Manguezal':mangue,'Floresta Ombrófila Mista':mista,'Floresta Ombrófila (= Floresta Pluvial)':ombrofila,'Vegetação Sobre Afloramentos Rochosos':rochas};
const names=['Área Antrópica','Caatinga (stricto sensu)','Campo de Altitude','Campo Limpo','Campo rupestre','Carrasco','Cerrado (lato sensu)','Floresta Ciliar ou Galeria','Floresta Estacional Decidual','Floresta Estacional Semidecidual','Floresta Ombrófila (= Floresta Pluvial)','Floresta Ombrófila Mista','Manguezal','Palmeiral','Restinga','Vegetação Aquática','Vegetação Sobre Afloramentos Rochosos'];
type Draft={habitat:string;image:string;source:string;creator:string;license:string;updatedAt:string};
export function HabitatPanel({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void}){
  const [name,setName]=useState(names[0]),[draft,setDraft]=useState<Draft|null>(null),[etag,setEtag]=useState<string|null>(null),[image,setImage]=useState(''),[source,setSource]=useState(''),[creator,setCreator]=useState(''),[license,setLicense]=useState(''),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [sourcesDirty,setSourcesDirty]=useState(false);
  useEffect(()=>{let active=true;setBusy(true);setMessage('');cloudRequest<{draft:Draft|null;etag:string|null}>(`/api/habitats/${encodeURIComponent(name)}`).then(value=>{if(!active)return;setDraft(value.draft);setEtag(value.etag);setImage(value.draft?.image||'');setSource(value.draft?.source||'');setCreator(value.draft?.creator||'');setLicense(value.draft?.license||'');setDirty(false)}).catch(e=>{if(active)setMessage(String(e))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[name]);
  useEffect(()=>{const handler=(e:BeforeUnloadEvent)=>{if(dirty||sourcesDirty)e.preventDefault()};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,sourcesDirty]);
  useEffect(()=>{onDirtyChange(dirty||sourcesDirty)},[dirty,sourcesDirty,onDirtyChange]);
  const change=(fn:(v:string)=>void,v:string)=>{fn(v);setDirty(true)};
  return <main className="membersScreen"><h1>Fotos das fitofisionomias</h1><p>Selecione uma imagem de paisagem e registre sua origem e direitos. As alterações ficam em rascunho até serem exportadas e revisadas para o guia.</p>
    <label>Ambiente<select value={name} disabled={busy} onChange={e=>{if(!dirty||window.confirm('Descartar alterações não salvas?'))setName(e.target.value)}}>{names.map(x=><option key={x}>{x}</option>)}</select></label>
    {(image||defaults[name])&&<img src={image||defaults[name]} alt={`Paisagem de ${name}`} style={{display:'block',maxWidth:'100%',width:500,maxHeight:240,objectFit:'cover',margin:'16px 0'}}/>}
    {!image&&<p>{defaults[name]?'Imagem atual do guia':'Sem imagem no guia.'}</p>}
    <label>Nova imagem (JPEG, PNG ou WebP, até 2 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2_000_000){setMessage('A imagem deve ter até 2 MB.');return}const reader=new FileReader();reader.onload=()=>change(setImage,String(reader.result));reader.readAsDataURL(f)}}/></label>
    <label>Autor<input value={creator} disabled={busy} onChange={e=>change(setCreator,e.target.value)}/></label>
    <label>Link da fonte<input type="url" value={source} disabled={busy} onChange={e=>change(setSource,e.target.value)}/></label>
    <label>Licença e direitos<input value={license} disabled={busy} placeholder="Ex.: CC0 1.0" onChange={e=>change(setLicense,e.target.value)}/></label>
    <div className="actions"><button disabled={busy||!dirty||!image||!source||!creator||!license} onClick={async()=>{setBusy(true);try{const result=await cloudRequest<{etag:string}>(`/api/habitats/${encodeURIComponent(name)}`,{image,source,creator,license,etag});setEtag(result.etag);setDraft({habitat:name,image,source,creator,license,updatedAt:new Date().toISOString()});setDirty(false);setMessage('Rascunho salvo. Revise os direitos antes de aplicar ao guia.')}catch(e){setMessage(String(e))}finally{setBusy(false)}}}>Salvar rascunho</button>
    <button disabled={!draft||dirty||busy} onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='fitofisionomia.json';a.click();URL.revokeObjectURL(url)}}>Exportar para revisão</button></div>{message&&<p role="status">{message}</p>}
    <HabitatSources onDirtyChange={setSourcesDirty}/>
  </main>;
}
