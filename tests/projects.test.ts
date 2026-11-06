import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readSaved,readLibrary} from '../lib/project-validation';
import {saveDocument,activateDocument} from '../lib/project-documents';
import {hasLibraryConflict} from '../lib/cache-reconciliation';
import {emptyLibrary,type Saved} from '../lib/project-types';
const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222';
const document:Saved={title:'test',dbml:'Table users {\n id int\n}',positions:{'public.users':{x:12,y:34}}};
test('offline caches without a fetched revision cannot overwrite cloud data',()=>{
  assert.equal(hasLibraryConflict({revision:0,knownRevision:false},0),true);
  assert.equal(hasLibraryConflict({revision:5},5),true);
  assert.equal(hasLibraryConflict({revision:4,knownRevision:true},5),true);
  assert.equal(hasLibraryConflict({revision:5,knownRevision:true},5),false);
});
test('opening a document never creates another document',()=>{
  let library=saveDocument(emptyLibrary(),document,['users'],{id:one});library=saveDocument(library,{...document,title:'two'},['users'],{newDocument:true,id:two});
  for(let i=0;i<10;i++)library=activateDocument(library,i%2?one:two);
  assert.equal(library.projects.length,2);assert.equal(activateDocument(library,'missing'),library);
});
test('saving and moving a table updates the same document and preserves its folder',()=>{
  let library=saveDocument(emptyLibrary(),document,['users'],{id:one});library.folders=[{id:two,name:'folder'}];library.projects[0].folderId=two;
  const changed=saveDocument(library,{...document,positions:{'public.users':{x:50,y:60}}},['users']);assert.equal(changed.projects.length,1);assert.equal(changed.projects[0].id,one);assert.equal(changed.projects[0].folderId,two);assert.equal(changed.projects[0].positions['public.users'].x,50);assert.equal(library.projects[0].positions['public.users'].x,12);
});
test('explicit new document creates exactly one independent file',()=>{
  const library=saveDocument(emptyLibrary(),document,['users'],{id:one});const next=saveDocument(library,document,['users'],{newDocument:true,id:two});assert.equal(next.projects.length,2);assert.equal(next.activeId,two);next.projects[1].positions['public.users'].x=99;assert.equal(next.projects[0].positions['public.users'].x,12);
});
test('valid project backups round-trip layout, viewport and colors',()=>{
  const original=saveDocument(emptyLibrary(),{...document,viewport:{x:10,y:20,zoom:.5},edgeColors:{ref:'#aabbcc'}},['users'],{id:one});const loaded=readLibrary(JSON.parse(JSON.stringify(original)));assert.equal(loaded.projects[0].viewport?.zoom,.5);assert.equal(loaded.projects[0].edgeColors?.ref,'#aabbcc');
});
test('malformed imports, duplicate IDs and foreign folders are rejected',()=>{
  assert.throws(()=>readSaved({dbml:42}));assert.throws(()=>readSaved({...document,positions:{node:{x:'bad',y:0}}}));assert.throws(()=>readSaved({...document,viewport:{x:0,y:0,zoom:-1}}));assert.throws(()=>readSaved({...document,edgeColors:{ref:'url(javascript:alert(1))'}}));
  const library=saveDocument(emptyLibrary(),document,[],{id:one});assert.throws(()=>readLibrary({...library,projects:[...library.projects,...library.projects]}),/중복/);assert.throws(()=>readLibrary({...library,projects:[{...library.projects[0],folderId:two}]}),/폴더/);
});
test('prototype-looking position keys cannot change object prototypes',()=>{
  const saved=readSaved(JSON.parse('{"dbml":"","positions":{"__proto__":{"x":1,"y":2}}}'));assert.equal(Object.getPrototypeOf(saved.positions),null);assert.equal(({} as {x?:number}).x,undefined);
});
