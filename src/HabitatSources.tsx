import {useEffect, useState} from 'react';
import {cloudRequest} from './cloud';
import initialNotes from './assets/habitat-photo-sources.md?raw';

type Notes = {content:string;revision:number;updated_at:string};
export function HabitatSources({onDirtyChange}:{onDirtyChange:(dirty:boolean)=>void}) {
  const [content,setContent]=useState(''),[revision,setRevision]=useState(0),[saved,setSaved]=useState(''),[busy,setBusy]=useState(true),[ready,setReady]=useState(false),[message,setMessage]=useState('');
  const dirty=ready && content!==saved;
  useEffect(()=>{let active=true;cloudRequest<Notes|null>('/api/habitat-sources').then(value=>{if(!active)return;const text=value?.content??initialNotes;setContent(text);setSaved(text);setRevision(value?.revision??0);setReady(true)}).catch(e=>{if(active)setMessage(String(e))}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[]);
  useEffect(()=>{onDirtyChange(dirty)},[dirty,onDirtyChange]);
  return <section><h2>Fontes e direitos das fotos</h2>
    <p>Documento Markdown de origem e licenças. Salve no editor e exporte para revisão antes de atualizar o guia.</p>
    <label>Documento de fontes<textarea aria-label="Documento de fontes das fitofisionomias" rows={18} value={content} disabled={busy||!ready} onChange={e=>setContent(e.target.value)} style={{width:'100%',fontFamily:'monospace'}} /></label>
    <div className="actions"><button disabled={!ready||busy||(!dirty&&revision!==0)} onClick={async()=>{setBusy(true);try{const result=await cloudRequest<Notes>('/api/habitat-sources',{content,revision});setRevision(result.revision);setSaved(result.content);setContent(result.content);setMessage('Documento salvo no editor.')}catch(e){setMessage(String(e))}finally{setBusy(false)}}}>Salvar fontes</button>
    <button disabled={!ready||busy||dirty} onClick={()=>{const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='habitat-photo-sources.md';a.click();URL.revokeObjectURL(url)}}>Exportar Markdown</button></div>
    {message&&<p role="status">{message}</p>}
  </section>;
}
