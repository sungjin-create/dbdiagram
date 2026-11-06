export type SourceIssue = { from:number; to:number; severity:'error'|'warning'|'info'; message:string };
type Point={line?:number;column?:number};
type RawIssue={message?:unknown;type?:string;location?:{start?:Point;end?:Point}};

export function sourceIssues(error:unknown,source:string):SourceIssue[] {
  const data=error as {diags?:RawIssue[];diagnostics?:RawIssue[];errors?:RawIssue[];message?:unknown}|null;
  const raw=data?.diags || data?.diagnostics || data?.errors;
  const issues=Array.isArray(raw)&&raw.length?raw:[{message:data?.message || 'DBML 문법을 확인해 주세요.'}];
  const lines=source.split('\n'),starts=[0];
  for(let i=0;i<lines.length-1;i++)starts.push(starts[i]+lines[i].length+1);
  const offset=(point?:Point)=>{
    const line=Math.max(0,Math.min(lines.length-1,(point?.line || 1)-1));
    return starts[line]+Math.max(0,Math.min(lines[line].replace(/\r$/,'').length,(point?.column || 1)-1));
  };
  return issues.map(issue=>{
    const from=offset(issue.location?.start);
    const to=issue.location?.end?Math.max(from,offset(issue.location.end)):Math.min(source.length,from+1);
    return {from,to,severity:issue.type==='warning'?'warning':issue.type==='info'?'info':'error',message:typeof issue.message==='string'?issue.message:'DBML 문법을 확인해 주세요.'};
  });
}
