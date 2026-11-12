import React,{useEffect,useState} from 'react';
import {createClient,type SupabaseClient,type Session} from '@supabase/supabase-js';
import App from './App';
import {configureCloud,type Membership} from './cloud';
export function CloudApp(){
  const [client,setClient]=useState<SupabaseClient|null>(null),[session,setSession]=useState<Session|null>(null),[member,setMember]=useState<Membership|null>(null);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [passwordSetup,setPasswordSetup]=useState(()=>/type=(invite|recovery)/.test(location.hash));
  useEffect(()=>{
    let disposed=false;let stop:(()=>void)|undefined;
    fetch('/api/config').then(r=>r.json()).then(config=>{
      if(!config.configured)throw Error('O editor está aguardando a configuração do Supabase. Seus rascunhos locais permanecem no navegador.');
      if(disposed)return;const auth=createClient(config.url,config.key);setClient(auth);
      auth.auth.getSession().then(({data})=>{if(!disposed)setSession(data.session)});
      const {data}=auth.auth.onAuthStateChange((event,value)=>{if(disposed)return;setSession(value);if(event==='PASSWORD_RECOVERY')setPasswordSetup(true);if(!value)setMember(null)});stop=()=>data.subscription.unsubscribe();
    }).catch(e=>setError(e.message));return()=>{disposed=true;stop?.()};
  },[]);
  useEffect(()=>{
    let disposed=false;if(!session||!client)return;
    fetch('/api/session',{headers:{authorization:`Bearer ${session.access_token}`}}).then(async r=>{const value=await r.json();if(!r.ok)throw Error(value.error);if(!disposed){configureCloud(client,value);setMember(value);setError('')}}).catch(e=>{if(!disposed)setError(e.message)});return()=>{disposed=true};
  },[session,client]);
  async function submit(event:React.FormEvent){
    event.preventDefault();if(!client)return;setBusy(true);setError('');
    try{const result=passwordSetup?await client.auth.updateUser({password}):await client.auth.signInWithPassword({email,password});if(result.error)throw result.error;if(passwordSetup)setPasswordSetup(false)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
  }
  if(member&&session&&!passwordSetup)return <App key={member.user_id} onSignOut={()=>void client?.auth.signOut()}/>;
  return <main className="loginPanel"><h1>Plantas do Rio</h1><p>Editor de conteúdo · acesso por convite</p>{error&&<p role="alert" className="error">{error}</p>}{message&&<p role="status">{message}</p>}{client&&(!session||passwordSetup)&&<form onSubmit={submit}>{!passwordSetup&&<label>Email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}<label>{passwordSetup?'Defina sua senha':'Senha'}<input type="password" autoComplete={passwordSetup?'new-password':'current-password'} minLength={10} required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'Aguarde…':passwordSetup?'Salvar senha':'Entrar'}</button>{!passwordSetup&&<button type="button" disabled={busy||!email} onClick={()=>setMessage('Peça um novo link de acesso ao administrador do guia.')}>Esqueci minha senha</button>}</form>}{client&&session&&!member&&<button onClick={()=>void client.auth.signOut()}>Sair desta conta</button>}</main>;
}
