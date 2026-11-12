import {createClient} from '@supabase/supabase-js';
import {writeFile} from 'node:fs/promises';
const email=process.argv[2];if(!email||!/^\S+@\S+\.\S+$/.test(email))throw Error('Provide the owner email.');
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const {data,error}=await client.auth.admin.generateLink({type:'invite',email,options:{redirectTo:'https://admin.plantas.avesdobrasil.app'}});
if(error)throw Error('Owner invitation could not be created. Check whether the account already exists.');
const {error:saveError}=await client.from('plant_editors').insert({user_id:data.user.id,display_name:'Administrador',role:'admin'});if(saveError)throw Error('Could not assign the plant owner role.');
await writeFile(new URL('../.local/owner-invite-link.txt',import.meta.url),data.properties.action_link+'\n');
console.log('Owner account created. Its one-use password-setup link is in .local/owner-invite-link.txt; it was not sent by email.');
