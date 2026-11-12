import {createClient} from '@supabase/supabase-js';
import {writeFile} from 'node:fs/promises';
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ownerEmail=process.argv[2];if(!ownerEmail)throw Error('Provide the owner email.');
const {data,error}=await client.auth.admin.listUsers({perPage:100});if(error)throw error;
for(const user of data.users){
  if(!/^qa-editor-\d+-(admin|contributor|invite)@example\.com$/.test(user.email||''))continue;
  const fixture=user.email.match(/^(qa-editor-\d+)-/)[1];
  for(const [table,column,value]of [['plant_comments','plant_id',fixture],['plant_history','plant_id',fixture],['plants','id',fixture],['plant_editors','user_id',user.id]]){
    const result=await client.from(table).delete().eq(column,value);if(result.error)throw result.error;
  }
  const removed=await client.auth.admin.deleteUser(user.id);if(removed.error)throw removed.error;
}
const owner=data.users.find(user=>user.email===ownerEmail);if(!owner)throw Error('Owner account not found.');
const member=await client.from('plant_editors').select('role').eq('user_id',owner.id).single();if(member.data?.role!=='admin')throw Error('This is not the configured plant owner.');
const access=await client.auth.admin.generateLink({type:owner.email_confirmed_at?'recovery':'invite',email:ownerEmail,options:{redirectTo:'https://admin.plantas.avesdobrasil.app'}});
if(access.error)throw access.error;
await writeFile(new URL('../.local/owner-invite-link.txt',import.meta.url),access.data.properties.action_link+'\n');
const safeLink=access.data.properties.action_link.replaceAll('&','&amp;').replaceAll('"','&quot;');
await writeFile(new URL('../.local/owner-first-access.html',import.meta.url),`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acesso ao editor de plantas</title><style>body{font:16px system-ui;background:#f5f1e7;color:#243127;max-width:560px;margin:12vh auto;padding:24px}a{display:inline-block;background:#70815f;color:white;padding:14px 22px;border-radius:8px;text-decoration:none}</style><h1>Editor de Plantas do Rio</h1><p>Acesso de administrador para ${ownerEmail}. Abra o link para definir sua senha. Este arquivo contém um link individual; não compartilhe.</p><a href="${safeLink}" rel="noreferrer">Definir minha senha e entrar</a><p>Depois, entre em admin.plantas.avesdobrasil.app e use Colaboradores para convidar especialistas.</p></html>`);
const usage=await client.rpc('plant_editor_usage');if(usage.error)throw usage.error;
console.log('Test accounts removed. Fresh owner setup link saved privately in .local/owner-first-access.html and .local/owner-invite-link.txt.');
console.log('Clean project usage:',usage.data);
