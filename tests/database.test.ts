import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('database migrations enforce ownership, atomic saves and revision conflicts',async()=>{
  const db=new PGlite();
  const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const folder='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users values ('${userA}'),('${userB}');`);
    for(const file of ['202611060001_diagrams.sql','202611060002_cloud_library.sql','202611060003_security.sql'])await db.exec(await readFile(`supabase/migrations/${file}`,'utf8'));
    const asUser=async(id:string)=>{await db.exec(`reset role;set role authenticated;`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
    const save=(revision:number|null,folders:unknown[],projects:unknown[],owner=userA)=>db.query<{revision:number}>('select public.save_erd_library($1,$2::jsonb,$3::jsonb,$4::uuid)::int as revision',[revision,JSON.stringify(folders),JSON.stringify(projects),owner]);
    const get=async()=> (await db.query<{library:{revision:number;ownerId:string;folders:unknown[];projects:{id:string;folderId:string|null}[]}}>('select public.get_erd_library() as library')).rows[0].library;
    const folders=[{id:folder,name:'personal'}],projects=[{id:project,title:'test',dbml:'Table users {\n id int\n}',folderId:folder,positions:{},edgeColors:{},tableNames:['users']}];
    await asUser(userA);
    assert.equal((await save(0,folders,projects)).rows[0].revision,1);
    assert.equal((await get()).projects.length,1);
    await assert.rejects(save(0,folders,[]),/LIBRARY_CONFLICT/);
    await assert.rejects(save(null,folders,projects),/Invalid revision/);
    await assert.rejects(save(1,folders,projects,userB),/Account changed/);
    assert.equal((await get()).revision,1);
    await assert.rejects(db.exec("update public.diagrams set title='bypass'"),/permission denied/);
    await assert.rejects(db.exec('truncate public.diagrams'),/permission denied/);
    await assert.rejects(db.query('select public.save_erd_library($1,$2::jsonb,$3::jsonb)',[1,'[]','[]']),/does not exist/);
    await asUser(userB);
    const other=await get();assert.equal(other.ownerId,userB);assert.equal(other.projects.length,0);assert.equal(other.folders.length,0);
    assert.equal((await db.query('select * from public.diagrams')).rows.length,0);
    await assert.rejects(save(0,folders,projects,userB),/Folder ID conflict/);
    await assert.rejects(save(0,[],[{...projects[0],id:'33333333-3333-4333-8333-333333333333'}],userB),/foreign key/);
    await db.exec('reset role;set role anon;');
    await assert.rejects(get(),/permission denied/);
    await assert.rejects(save(0,[],[]),/permission denied/);
    await asUser(userA);
    assert.equal((await save(1,[],[{...projects[0],folderId:null}])).rows[0].revision,2);
    assert.equal((await get()).folders.length,0);
    await assert.rejects(save(2,[],[{...projects[0],folderId:null,positions:[]}]),/Invalid project payload/);
    await assert.rejects(save(2,[],[{...projects[0],folderId:null},{...projects[0],folderId:null}]),/Duplicate/);
    assert.equal((await get()).revision,2);
    assert.equal((await save(2,[],[])).rows[0].revision,3);
    assert.equal((await get()).projects.length,0);
  }finally{await db.close();}
});
