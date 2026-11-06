import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema,starter,errorMessage} from '../lib/schema';
import {sourceIssues} from '../lib/diagnostics';
import {setTableColors} from '../lib/source-colors';

test('starter document parses and resolves every relationship handle',()=>{
  const schema=parseSchema(starter);assert.equal(schema.tables.length,3);
  for(const relation of schema.relations){assert.ok(schema.tables.find(t=>t.id===relation.from)?.fields.some(f=>f.name===relation.fromField));assert.ok(schema.tables.find(t=>t.id===relation.to)?.fields.some(f=>f.name===relation.toField));}
});
test('composite relations include all three column pairs',()=>{
  const schema=parseSchema(`Table Admin {\n TypeCode varchar\n PositionCode varchar\n NationalCodeCompare varchar\n}\nTable PFTitle {\n code varchar\n title varchar\n country varchar\n}\nRef: Admin.(TypeCode, PositionCode, NationalCodeCompare) > PFTitle.(code, title, country)`);
  assert.deepEqual(schema.relations.map(r=>[r.fromField,r.toField]),[['TypeCode','code'],['PositionCode','title'],['NationalCodeCompare','country']]);assert.equal(new Set(schema.relations.map(r=>r.id)).size,3);
});
test('self-references, notes, Korean text and optional relations remain valid',()=>{
  const schema=parseSchema(`Table users {\n id int [pk]\n parent_id int [note: '상위 계정']\n Note: '''\n 여러 줄 메모\n '''\n}\nRef: users.parent_id ?<>? users.id`);
  assert.equal(schema.relations[0].from,schema.relations[0].to);assert.match(schema.tables[0].note,/메모/);
});
test('fenced input preserves line and column offsets for editor markers',()=>{
  const source='```dbml\nTable users {\n id int [pkk]\n}\n```';
  assert.throws(()=>parseSchema(source),error=>{const issues=sourceIssues(error,source);assert.equal(source.slice(issues[0].from,issues[0].to),'pkk');return true;});
});
test('unknown referenced table is underlined at its name',()=>{
  const source='Table posts {\n id int\n user_id int\n}\nRef: posts.user_id > missing.id';
  assert.throws(()=>parseSchema(source),error=>{const issue=sourceIssues(error,source)[0];assert.equal(source.slice(issue.from,issue.to),'missing');assert.match(issue.message,/does not exist/);return true;});
});
test('diagnostics clamp invalid locations and handle empty documents',()=>{
  const [issue]=sourceIssues({diags:[{message:'bad',location:{start:{line:999,column:999},end:{line:0,column:-1}}}]},'abc');assert.equal(issue.from,3);assert.equal(issue.to,3);
  assert.equal(sourceIssues(null,'')[0].from,0);assert.doesNotThrow(()=>errorMessage({errors:{}}));
});
test('large documents are rejected before parsing',()=>{assert.throws(()=>parseSchema('x'.repeat(1_000_001)),/1MB/);});
test('color edits preserve comments, notes and only change the selected schema',()=>{
  const source="// Table users [headercolor: #112233] {\nTable a.users [headercolor: #123456] {\n id int\n note: 'headercolor: #123456'\n}\nTable b.users [note: 'headercolor: #654321 { example }'] {\n id int\n}";
  const changed=setTableColors(source,['b.users'],'#dbe5ff');
  assert.match(changed,/Table a.users \[headercolor: #123456\]/);assert.match(changed,/\/\/ Table users \[headercolor: #112233\]/);assert.match(changed,/note: 'headercolor: #654321 \{ example \}'/);
  assert.equal(parseSchema(changed).tables.find(t=>t.id==='b.users')?.color,'#dbe5ff');
});
test('group colors can be changed in one edit and are schema-qualified',()=>{
  const source='Table a.one {\n id int\n}\nTable a.two {\n id int\n}\nTableGroup group {\n a.one\n a.two\n}';
  const schema=parseSchema(source);assert.deepEqual(schema.groups[0].tables,['a.one','a.two']);
  assert.ok(parseSchema(setTableColors(source,schema.groups[0].tables,'#d1eee4')).tables.every(t=>t.color==='#d1eee4'));
});
