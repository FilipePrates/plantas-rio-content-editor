import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const secrets=await readFile(new URL('../.local/worker-secrets.json',import.meta.url),'utf8');
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','bulk'],{input:secrets,encoding:'utf8'});
if(result.status!==0)throw Error('Worker secret configuration failed.');
console.log('Plant Worker secrets configured.');
