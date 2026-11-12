import {readFile} from 'node:fs/promises';
import {parseCatalog} from '../src/catalog.mjs';
const catalog=parseCatalog(JSON.parse(await readFile(new URL('../../plantas-do-rio-de-janeiro/src/data/plants.json',import.meta.url),'utf8')));
const response=await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/seed_plant_catalog`,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},body:JSON.stringify({p_catalog:catalog})});
if(!response.ok)throw Error('Seed refused. Confirm this is an empty plant project; do not overwrite a working shared catalog.');
console.log(`Seeded ${catalog.plants.length} plants.`);
