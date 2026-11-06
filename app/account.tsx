'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { Cloud, LogIn, LogOut, X } from 'lucide-react';
import { getSupabase } from '../lib/supabase';

export default function Account({user,ready,onBeforeAuth,onSignOut}:{user:User|null;ready:boolean;onBeforeAuth:()=>void;onSignOut:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[mode,setMode]=useState<'login'|'signup'|'forgot'|'reset'>('login');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const configured=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  useEffect(()=>{
    const client=getSupabase();if(!client)return;
    const {data}=client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){setMode('reset');setOpen(true);}else if(event==='SIGNED_IN'){setPassword('');setOpen(false);}});
    return()=>data.subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){setOpen(false);setPassword('');}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[open,busy]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const client=getSupabase();if(!client)return;
    setBusy(true);setNotice('');
    try {
      if(mode==='login'){
        const {error}=await client.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setOpen(false);setPassword('');
      } else if(mode==='signup'){
        const {data,error}=await client.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin}});
        if(error)throw error;
        setPassword('');if(data.session)setOpen(false);else setNotice('가입 확인 이메일을 보냈습니다. 이메일의 링크를 누른 뒤 로그인하세요.');
      } else if(mode==='forgot'){
        const {error}=await client.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});if(error)throw error;
        setNotice('가입된 이메일이라면 비밀번호 재설정 링크가 발송됩니다.');
      } else {
        const {error}=await client.auth.updateUser({password});if(error)throw error;setPassword('');setNotice('비밀번호를 변경했습니다. 창을 닫고 계속 사용하세요.');
      }
    } catch(error){setNotice((error as Error).message || '요청을 처리하지 못했습니다.');}
    finally{setBusy(false);}
  }
  return <><div className="account-bar">{user?<><span title={user.email}><Cloud size={14}/>{user.email}</span><button title="로그아웃" aria-label="로그아웃" onClick={()=>{void onSignOut();}}><LogOut size={15}/></button></>:<button disabled={!ready} onClick={()=>{onBeforeAuth();setOpen(true);setNotice('');}}><LogIn size={15}/>로그인</button>}</div>
    {open&&<div className="account-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy){setOpen(false);setPassword('');}}}><section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="account-close" aria-label="닫기" disabled={busy} onClick={()=>{setOpen(false);setPassword('');}}><X size={18}/></button><h2 id="account-title">{mode==='signup'?'계정 만들기':mode==='forgot'?'비밀번호 찾기':mode==='reset'?'새 비밀번호':'Schema Studio 로그인'}</h2><p>로그인하면 프로젝트와 폴더를 클라우드에 저장하고 다른 기기에서도 열 수 있습니다.</p>
      {!configured?<p role="alert">Supabase 환경 변수 두 개를 설정한 뒤 다시 배포해 주세요.</p>:<form onSubmit={submit}>{mode!=='reset'&&<label>이메일<input autoFocus required type="email" autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label>}{mode!=='forgot'&&<label>비밀번호<input required minLength={8} type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>}<button className="primary" type="submit" disabled={busy}>{busy?'처리 중…':mode==='signup'?'가입하기':mode==='forgot'?'재설정 링크 보내기':mode==='reset'?'비밀번호 변경':'로그인'}</button></form>}
      {notice&&<p className="account-notice" role="status">{notice}</p>}<div className="account-links">{mode!=='login'&&<button disabled={busy} onClick={()=>{setMode('login');setNotice('');setPassword('');}}>로그인</button>}{mode==='login'&&<><button onClick={()=>{setMode('signup');setNotice('');setPassword('');}}>회원가입</button><button onClick={()=>{setMode('forgot');setNotice('');setPassword('');}}>비밀번호 찾기</button></>}</div></section></div>}
  </>;
}
