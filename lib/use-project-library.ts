'use client';
import { useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { emptyLibrary, localDraftKey, localLibraryKey, type Library, type Saved } from './project-types';

type Cache = { library: Library; revision: number; dirty: boolean; draft?: Saved };
const cacheKey = (id: string) => `schema-studio-cloud-${id}`;
const message = (e: unknown) => (e as { message?: string })?.message || '클라우드에 연결하지 못했습니다.';

export function useProjectLibrary(restore: (document: Saved) => void, blank: Saved) {
  const [library, setLibrary] = useState<Library>(emptyLibrary);
  const libraryRef = useRef(library);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('연결 중…');
  const [syncError, setSyncError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [imported, setImported] = useState(false);
  const callbacks = useRef({ restore, blank }); callbacks.current = { restore, blank };
  const engine = useRef({ userId: null as string | null, ready: false, revision: 0, dirty: false, version: 0, epoch: 0, loading: true, running: false, writable: false, conflict: false, draft: undefined as Saved | undefined });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  function writeCache() {
    const state = engine.current;
    if(state.userId) localStorage.setItem(cacheKey(state.userId),JSON.stringify({library:libraryRef.current,revision:state.revision,dirty:state.dirty,draft:state.draft} satisfies Cache));
    else localStorage.setItem(localLibraryKey,JSON.stringify(libraryRef.current));
  }
  function schedule() { if(timer.current)clearTimeout(timer.current); timer.current=setTimeout(()=>{void flushRef.current();},700); }
  flushRef.current = async () => {
    const state = engine.current, client = getSupabase();
    if(!client || !state.userId || !state.ready || !state.writable || !state.dirty || state.running || state.conflict) return;
    const epoch=state.epoch, version=state.version, current=structuredClone(libraryRef.current);
    state.running=true;setSyncStatus('클라우드 저장 중…');
    try {
      const {data,error}=await client.rpc('save_erd_library',{p_expected_revision:state.revision,p_folders:current.folders,p_projects:current.projects});
      if(engine.current.epoch!==epoch)return;
      if(error)throw error;
      state.revision=Number(data);state.dirty=state.version!==version;state.running=false;
      writeCache();setSyncError('');setSyncStatus(state.dirty?'저장 대기 중…':'클라우드에 저장됨');
      if(state.dirty)schedule();
    } catch(error) {
      if(engine.current.epoch!==epoch)return;
      state.running=false;
      state.conflict=(error as {code?:string}).code==='40001';
      setSyncError(state.conflict?'다른 창에서 변경되었습니다. 현재 작업을 내보낸 뒤 최신 목록을 불러오세요.':`클라우드 저장 실패: ${message(error)}`);
      setSyncStatus('브라우저에 보관됨 · 동기화 필요');
    }
  };

  useEffect(()=>{
    const client=getSupabase();
    if(!client){setAuthReady(true);return;}
    const {data}=client.auth.onAuthStateChange((_event,session)=>{
      const id=session?.user.id || null;
      if(id!==engine.current.userId) { engine.current.ready=false;engine.current.loading=true;setReady(false); }
      setUser(session?.user || null);setAuthReady(true);
    });
    return ()=>data.subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!authReady)return;
    if(timer.current)clearTimeout(timer.current);
    const epoch=engine.current.epoch+1;
    engine.current={userId:user?.id || null,ready:false,revision:0,dirty:false,version:0,epoch,loading:true,running:false,writable:false,conflict:false,draft:undefined};
    setReady(false);setSyncError('');setSyncStatus(user?'클라우드 불러오는 중…':'브라우저 저장');
    const apply=(next:Library,draft?:Saved)=>{
      libraryRef.current=next;setLibrary(next);
      callbacks.current.restore(next.projects.find(p=>p.id===next.activeId) || draft || callbacks.current.blank);
      engine.current.ready=true;engine.current.loading=false;setReady(true);
    };
    if(!user){
      try { const raw=localStorage.getItem(localLibraryKey),draft=localStorage.getItem(localDraftKey);apply(raw?JSON.parse(raw):emptyLibrary(),draft?JSON.parse(draft):undefined); }
      catch {apply(emptyLibrary());setSyncError('브라우저 저장 데이터를 읽지 못했습니다.');}
      return;
    }
    const userId=user.id;
    let cached:Cache|undefined;
    try {const raw=localStorage.getItem(cacheKey(userId));if(raw)cached=JSON.parse(raw);setImported(localStorage.getItem(`schema-studio-imported-${userId}`)==='yes');}catch{ /* Fetch the cloud copy if cache is unavailable. */ }
    void (async()=>{
      try {
        const {data,error}=await getSupabase()!.rpc('get_erd_library');
        if(engine.current.epoch!==epoch)return;
        if(error)throw error;
        const revision=Number(data.revision);
        const remote:Library={folders:data.folders,projects:data.projects,activeId:cached?cached.library.activeId:data.projects[0]?.id || null};
        if(remote.activeId && !remote.projects.some(p=>p.id===remote.activeId))remote.activeId=remote.projects[0]?.id || null;
        engine.current.revision=revision;engine.current.writable=true;engine.current.draft=cached?.draft;
        if(cached?.dirty){
          engine.current.revision=cached.revision;engine.current.dirty=true;engine.current.conflict=cached.revision!==revision;
          apply(cached.library,cached.draft);
          if(engine.current.conflict)setSyncError('다른 창의 변경과 저장 대기 중인 작업이 충돌했습니다. 작업을 내보낸 뒤 최신 목록을 불러오세요.');
          else schedule();
          setSyncStatus('저장 대기 중…');
        } else {apply(remote,cached?.draft);writeCache();setSyncStatus('클라우드 연결됨');}
      } catch(error){
        if(engine.current.epoch!==epoch)return;
        engine.current.revision=cached?.revision || 0;engine.current.dirty=cached?.dirty || false;engine.current.draft=cached?.draft;
        apply(cached?.library || emptyLibrary(),cached?.draft);
        setSyncError(`클라우드 불러오기 실패: ${message(error)} · DB 추가 SQL 실행 여부를 확인하세요.`);setSyncStatus('브라우저에만 보관 중');
      }
    })();
    return ()=>{engine.current.ready=false;engine.current.epoch++;if(timer.current)clearTimeout(timer.current);};
  },[user?.id,authReady,reloadVersion]);

  function persistLibrary(next:Library) {
    const state=engine.current;
    if(!state.ready)return false;
    const before=libraryRef.current, dirty=state.dirty;
    const changed=JSON.stringify([before.folders,before.projects])!==JSON.stringify([next.folders,next.projects]);
    libraryRef.current=next;
    if(state.userId && changed){state.dirty=true;state.version++;}
    try{writeCache();setLibrary(next);if(state.userId && changed){setSyncStatus('클라우드 저장 대기…');schedule();}return true;}
    catch{libraryRef.current=before;state.dirty=dirty;setSyncError('브라우저 저장 공간이 부족합니다. 현재 작업을 파일로 내보내세요.');return false;}
  }
  function saveDraft(draft:Saved) {
    if(!engine.current.ready)return;
    if(engine.current.userId){engine.current.draft=draft;writeCache();}
    else localStorage.setItem(localDraftKey,JSON.stringify(draft));
  }
  function importLocal() {
    if(!engine.current.userId || !engine.current.ready || imported)return;
    try {
      const raw=localStorage.getItem(localLibraryKey),draft=localStorage.getItem(localDraftKey);
      const local:Library=raw?JSON.parse(raw):emptyLibrary();
      if(draft){const document:Saved=JSON.parse(draft);if(!local.projects.some(p=>p.dbml===document.dbml&&p.title===document.title))local.projects.push({...document,id:crypto.randomUUID(),folderId:null,tableNames:[],updatedAt:new Date().toISOString()});}
      const ids=new Map(local.folders.map(f=>[f.id,crypto.randomUUID()]));
      const next={...libraryRef.current,folders:[...libraryRef.current.folders,...local.folders.map(f=>({...f,id:ids.get(f.id)!}))],projects:[...libraryRef.current.projects,...local.projects.map(p=>({...p,id:crypto.randomUUID(),folderId:p.folderId?ids.get(p.folderId)||null:null}))]};
      if(persistLibrary(next)){localStorage.setItem(`schema-studio-imported-${engine.current.userId}`,'yes');setImported(true);}
    } catch(error){setSyncError(`브라우저 프로젝트 가져오기 실패: ${message(error)}`);}
  }
  function refresh() {
    if(engine.current.dirty && !confirm('저장 대기 중인 변경을 최신 클라우드 내용으로 바꿀까요? 현재 작업과 프로젝트 목록은 내보내기로 먼저 보관하세요.'))return;
    try{if(engine.current.userId){engine.current.dirty=false;writeCache();}setReloadVersion(v=>v+1);}catch{setSyncError('브라우저 저장 데이터를 갱신하지 못했습니다.');}
  }
  async function retry() {
    if(engine.current.conflict)return;
    if(!engine.current.writable){setReloadVersion(v=>v+1);return;}
    await flushRef.current();
  }
  async function signOut() {
    await flushRef.current();
    if(engine.current.dirty){setSyncError('아직 클라우드에 저장하지 못했습니다. 저장을 재시도한 뒤 로그아웃하세요.');return;}
    const {error}=await getSupabase()!.auth.signOut();if(error)setSyncError(message(error));
  }
  useEffect(()=>{const online=()=>{void retry();};window.addEventListener('online',online);return()=>window.removeEventListener('online',online);},[]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(engine.current.dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
  return {library,libraryRef,persistLibrary,saveDraft,ready,user,authReady,syncStatus,syncError,importLocal,imported,refresh,retry,signOut};
}
