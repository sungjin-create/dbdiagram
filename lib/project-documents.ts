import type { Library, Saved } from './project-types';

export function saveDocument(library:Library,document:Saved,tableNames:string[],options:{newDocument?:boolean;id?:string;now?:string}={}):Library{
  const existing=!options.newDocument&&library.projects.find(project=>project.id===library.activeId);
  const project={...structuredClone(document),id:existing?existing.id:options.id||crypto.randomUUID(),folderId:existing?existing.folderId:null,tableNames:[...tableNames],updatedAt:options.now||new Date().toISOString()};
  return {...library,activeId:project.id,projects:existing?library.projects.map(item=>item.id===project.id?project:item):[...library.projects,project]};
}
export function activateDocument(library:Library,id:string):Library{
  if(!library.projects.some(project=>project.id===id))return library;
  return {...library,activeId:id};
}
