import {inaturalistPhotoRights} from '../src/catalog.mjs';
const API='https://api.inaturalist.org/v1/observations/';
export function trustedPhotoUrl(photo,size='large'){
  if(!photo||!Number.isSafeInteger(photo.id)||photo.id<1||!['cc0','cc-by'].includes(photo.license_code)||photo.hidden||photo.flags?.length||photo.moderator_actions?.length)throw Error('Foto indisponível ou com licença não permitida.');
  inaturalistPhotoRights(photo);
  const url=new URL(photo.url);
  if(url.protocol!=='https:'||!['inaturalist-open-data.s3.amazonaws.com','static.inaturalist.org'].includes(url.hostname)||url.port||url.username||url.password||!new RegExp(`^/photos/${photo.id}/(square|small|medium|large|original)\\.(jpg|jpeg|png|webp)$`).test(url.pathname))throw Error('Endereço de foto não permitido.');
  url.pathname=url.pathname.replace(/\/(square|small|medium|large|original)\./,`/${size}.`);url.search='';url.hash='';return url.href;
}
async function bounded(url,limit,fetcher=fetch){
  const response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('O iNaturalist não respondeu. Tente novamente.');
  if(Number(response.headers.get('content-length'))>limit)throw Error('Resposta muito grande.');
  const reader=response.body.getReader(),chunks=[];let length=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw Error('Resposta muito grande.');chunks.push(value)}}finally{await reader.cancel()}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}return bytes;
}
async function observation(id,fetcher=fetch){
  if(!Number.isSafeInteger(id)||id<1)throw Error('Observação inválida.');
  const data=JSON.parse(new TextDecoder().decode(await bounded(API+id,4_000_000,fetcher))).results?.[0];
  if(!data||data.id!==id||!data.taxon||data.flags?.length)throw Error('Observação indisponível.');return data;
}
export async function inspectObservation(id,fetcher=fetch){
  const item=await observation(id,fetcher),photos=[];
  for(const photo of item.photos||[]){try{photos.push({id:photo.id,url:trustedPhotoUrl(photo),previewUrl:trustedPhotoUrl(photo,'medium'),licenseCode:photo.license_code,attribution:photo.attribution})}catch{}}
  return{id:item.id,url:`https://www.inaturalist.org/observations/${id}`,taxonName:item.taxon.name,taxonId:item.taxon.id,observer:item.user?.name||item.user?.login||'Colaborador iNaturalist',qualityGrade:item.quality_grade,photos,excludedPhotos:(item.photos||[]).length-photos.length};
}
export async function importObservationPhotos(input,bucket,fetcher=fetch){
  if(!Array.isArray(input.photoIds)||!input.photoIds.length||input.photoIds.length>8||new Set(input.photoIds).size!==input.photoIds.length||!input.photoIds.every(id=>Number.isSafeInteger(id)&&id>0))throw Error('Selecione de 1 a 8 fotos por importação. Você pode repetir a importação.');
  const item=await observation(input.observationId,fetcher),result=[];
  for(const id of input.photoIds){
    const photo=item.photos?.find(p=>p.id===id),url=trustedPhotoUrl(photo),fileName=`inat-${id}.${new URL(url).pathname.split('.').pop()}`,rights=inaturalistPhotoRights(photo);
    const existing=await bucket.get(`evidence/${id}.json`);let proof;
    if(existing){
      proof=await existing.json();
      if(proof.photo.license_code!==photo.license_code||proof.photo.attribution!==photo.attribution||proof.observation.id!==item.id||proof.observation.taxon.name!==item.taxon.name||proof.download.url!==url)throw Error('A aquisição anterior desta foto precisa ser revisada.');
      if(!await bucket.head(`photos/${fileName}`))throw Error('Arquivo original ausente.');
    }else{
      const bytes=await bounded(url,15_000_000,fetcher);
      const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10',webp=new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
      if(!jpg&&!png&&!webp)throw Error('Arquivo de imagem inválido.');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
      proof={apiUrl:API+item.id,photo,creator:rights.creator||photo.attribution_name||item.user?.name||item.user?.login||'Colaborador iNaturalist',observation:{id:item.id,quality_grade:item.quality_grade,taxon:{id:item.taxon.id,name:item.taxon.name},observerLogin:item.user?.login},download:{url,sha256:hash,retrievedAt:new Date().toISOString()}};
      await bucket.put(`photos/${fileName}`,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:jpg?'image/jpeg':png?'image/png':'image/webp'}});
      const stored=await bucket.put(`evidence/${id}.json`,JSON.stringify(proof),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
      if(!stored){const acquired=await bucket.get(`evidence/${id}.json`);proof=await acquired.json();if(proof.download.sha256!==hash||proof.observation.id!==item.id)throw Error('A foto foi importada por outra pessoa. Recarregue a observação.');}
    }
    result.push({id:`inat-${id}`,fileName,photoId:id,observationId:proof.observation.id,taxonId:proof.observation.taxon.id,taxonName:proof.observation.taxon.name,creator:proof.creator,...inaturalistPhotoRights(proof.photo),sourceUrl:proof.download.url,observationUrl:`https://www.inaturalist.org/observations/${proof.observation.id}`,downloadedAt:proof.download.retrievedAt,sha256:proof.download.sha256,markers:['unknown'],caption:'',reviewStatus:'draft'});
  }
  return result;
}
