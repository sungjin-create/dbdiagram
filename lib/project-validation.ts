import type { Library, Project, Saved } from './project-types';
export const MAX_SOURCE_LENGTH=1_000_000;
export const MAX_IMPORT_BYTES=10_000_000;
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const color=/^#[\da-f]{3}(?:[\da-f]{3})?$/i;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('올바른 프로젝트 데이터가 아닙니다.');return value as Record<string,unknown>;}
function text(value:unknown,max:number,fallback?:string):string{if(value===undefined&&fallback!==undefined)return fallback;if(typeof value!=='string'||value.length>max)throw Error('문자열 형식이나 최대 길이를 확인하세요.');return value;}
function number(value:unknown):number{if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>10_000_000)throw Error('테이블 위치 또는 확대율이 올바르지 않습니다.');return value;}
function id(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))throw Error('프로젝트 ID 형식이 올바르지 않습니다.');return value;}
export function readSaved(value:unknown):Saved{
  const item=object(value);
  const positions:Saved['positions']=Object.create(null);
  const entries=Object.entries(object(item.positions??{}));
  if(entries.length>5000)throw Error('테이블 위치가 너무 많습니다.');
  for(const [key,raw] of entries){const point=object(raw);positions[key]={x:number(point.x),y:number(point.y)};}
  const edgeColors:Record<string,string>=Object.create(null);
  for(const [key,raw] of Object.entries(object(item.edgeColors??{}))){if(typeof raw!=='string'||!color.test(raw))throw Error('관계선 색상이 올바르지 않습니다.');edgeColors[key]=raw;}
  const saved:Saved={title:text(item.title,200,'Untitled diagram').trim()||'Untitled diagram',dbml:text(item.dbml,MAX_SOURCE_LENGTH),positions,edgeColors};
  if(item.viewport!=null){const v=object(item.viewport),zoom=number(v.zoom);if(zoom<.03||zoom>2)throw Error('확대율은 0.03~2 범위여야 합니다.');saved.viewport={x:number(v.x),y:number(v.y),zoom};}
  return saved;
}
export function readLibrary(value:unknown):Library{
  const item=object(value);
  if(!Array.isArray(item.folders)||!Array.isArray(item.projects)||item.folders.length>500||item.projects.length>500)throw Error('프로젝트 목록 형식이나 개수를 확인하세요.');
  const folders=item.folders.map(raw=>{const folder=object(raw);return {id:id(folder.id),name:text(folder.name,200).trim()};});
  if(folders.some(f=>!f.name)||new Set(folders.map(f=>f.id)).size!==folders.length)throw Error('폴더 이름이 비어 있거나 ID가 중복됩니다.');
  const folderIds=new Set(folders.map(f=>f.id));
  const projects:Project[]=item.projects.map(raw=>{
    const project=object(raw);const folderId=project.folderId==null?null:id(project.folderId);
    if(folderId&&!folderIds.has(folderId))throw Error('프로젝트의 폴더가 존재하지 않습니다.');
    if(project.tableNames!=null&&(!Array.isArray(project.tableNames)||project.tableNames.length>5000))throw Error('테이블 목록이 올바르지 않습니다.');
    return {...readSaved(project),id:id(project.id),folderId,tableNames:(project.tableNames as unknown[]||[]).map(name=>text(name,1000)),updatedAt:text(project.updatedAt,100,'1970-01-01T00:00:00.000Z')};
  });
  if(new Set(projects.map(p=>p.id)).size!==projects.length)throw Error('프로젝트 ID가 중복됩니다.');
  const activeId=item.activeId==null?null:id(item.activeId);
  return {folders,projects,activeId:projects.some(p=>p.id===activeId)?activeId:null};
}
