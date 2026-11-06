import { Parser } from '@dbml/core';

// Keep comments and quoted text out of header matching without changing offsets.
function maskText(source:string){
  return source.replace(/'''[\s\S]*?'''|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g,value=>value.replace(/[^\r\n]/g,' '));
}
export function setTableColors(source:string,tableIds:string[],color:string):string{
  if(!/^#[\da-f]{6}$/i.test(color))throw Error('올바른 색상을 선택해 주세요.');
  const model=new Parser().parse(source,'dbmlv2');
  const ids=new Set(tableIds),edits:{from:number;to:number;text:string}[]=[];
  for(const schema of model.schemas)for(const table of schema.tables){
    if(!ids.has(`${schema.name}.${table.name}`))continue;
    const from=table.token.start.offset,block=source.slice(from,table.token.end.offset),masked=maskText(block);
    const brace=masked.indexOf('{');if(brace<0)continue;
    const header=masked.slice(0,brace),setting=/\bheadercolor\s*:\s*#[\da-f]{3,8}\b/i.exec(header);
    if(setting){const offset=setting[0].lastIndexOf('#');edits.push({from:from+setting.index+offset,to:from+setting.index+setting[0].length,text:color});}
    else {
      const end=header.lastIndexOf(']');
      if(end>=0){const begin=header.indexOf('[');edits.push({from:from+end,to:from+end,text:`${header.slice(begin+1,end).trim()?', ':''}headercolor: ${color}`});}
      else edits.push({from:from+brace,to:from+brace,text:`[headercolor: ${color}] `});
    }
  }
  return edits.sort((a,b)=>b.from-a.from).reduce((text,edit)=>text.slice(0,edit.from)+edit.text+text.slice(edit.to),source);
}
