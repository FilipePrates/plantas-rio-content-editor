import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {parseCatalog} from '../src/catalog.mjs';
const root=resolve(import.meta.dirname,'..'),app=resolve(root,'../plantas-do-rio-de-janeiro');
await mkdir(resolve(root,'.local'),{recursive:true});
const project=JSON.parse(await readFile(resolve(root,'.local/project.json'),'utf8'));
if(project.name!=='plantas-do-rio')throw Error('Unexpected project; refusing to configure another backend.');
const keys=JSON.parse(await readFile(resolve(root,'.local/api-keys.json'),'utf8'));
const service=keys.find(key=>key.name==='service_role')?.api_key,publicKey=keys.find(key=>key.name==='anon')?.api_key;
if(!service||!publicKey)throw Error('Plant project keys are missing.');
const env={SUPABASE_URL:`https://${project.id}.supabase.co`,SUPABASE_PUBLISHABLE_KEY:publicKey,SUPABASE_SERVICE_ROLE_KEY:service};
await writeFile(resolve(root,'.env.cloud'),Object.entries(env).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n')+'\n');
await writeFile(resolve(root,'.local/worker-secrets.json'),JSON.stringify(env));
const catalog=parseCatalog(JSON.parse(await readFile(resolve(app,'src/data/plants.json'),'utf8')));
const tag='$plant_seed_'+createHash('sha256').update(JSON.stringify(catalog)).digest('hex').slice(0,16)+'$';
await writeFile(resolve(root,'.local/seed.sql'),`select public.seed_plant_catalog(${tag}${JSON.stringify(catalog)}${tag}::jsonb);\n`);
const manifests=new Map(),seen=new Set();let bytes=0;
function add(type,key,file){if(!manifests.has(type))manifests.set(type,[]);manifests.get(type).push({key,file})}
for(const plant of catalog.plants)for(const photo of plant.photos){
  if(seen.has(photo.photoId))continue;seen.add(photo.photoId);
  const file=resolve(app,'assets/plants',photo.fileName),evidenceFile=resolve(app,`sources/inaturalist/photos/${photo.photoId}.json`);
  const payload=await readFile(file),proof=JSON.parse(await readFile(evidenceFile,'utf8'));
  if(createHash('sha256').update(payload).digest('hex')!==photo.sha256||proof.download.sha256!==photo.sha256||proof.photo.license_code!==photo.licenseCode||proof.observation.id!==photo.observationId)throw Error(`Photo evidence mismatch: ${photo.photoId}`);
  bytes+=payload.length;
  add(photo.fileName.endsWith('.png')?'png':photo.fileName.endsWith('.webp')?'webp':'jpeg',`photos/${photo.fileName}`,file);
  add('json',`evidence/${photo.photoId}.json`,evidenceFile);
  const thumb=resolve(app,`assets/plants/thumbnails/inat-${photo.photoId}.webp`);
  try{bytes+=(await stat(thumb)).size;add('webp',`thumbnails/inat-${photo.photoId}.webp`,thumb)}catch{}
}
for(const [type,entries]of manifests)await writeFile(resolve(root,`.local/media-${type}.json`),JSON.stringify(entries));
await writeFile(resolve(root,'.local/media-summary.json'),JSON.stringify({photos:seen.size,bytes,manifests:[...manifests.keys()]}));
console.log(`Prepared ${catalog.plants.length} plant records, ${seen.size} verified photos, ${(bytes/1e9).toFixed(3)} GB. Credentials saved only in ignored setup files.`);
