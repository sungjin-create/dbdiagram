'use client';
import { useEffect, useRef } from 'react';

export const fontOptions = [
  {id:'malgun',name:'맑은 고딕',family:"'Malgun Gothic','Segoe UI',sans-serif"},
  {id:'system',name:'시스템 기본',family:"system-ui,'Malgun Gothic',sans-serif"},
  {id:'segoe',name:'Segoe UI',family:"'Segoe UI','Malgun Gothic',sans-serif"},
  {id:'consolas',name:'Consolas',family:"Consolas,'Malgun Gothic',monospace"},
  {id:'cascadia',name:'Cascadia Code',family:"'Cascadia Code',Consolas,'Malgun Gothic',monospace"},
  {id:'arial',name:'Arial',family:"Arial,'Malgun Gothic',sans-serif"},
];
export type FontPreference = {size:number;font:string};
export const defaultFonts = {editor:{size:15,font:'cascadia'},table:{size:14,font:'consolas'}};
export function fontFamily(id:string) {return fontOptions.find(font=>font.id===id)?.family || fontOptions[0].family;}
export function normalizeFont(value:Partial<FontPreference>|undefined,fallback:FontPreference):FontPreference {
  return {size:typeof value?.size==='number'&&Number.isFinite(value.size)?Math.max(10,Math.min(28,Math.round(value.size))):fallback.size,font:fontOptions.some(font=>font.id===value?.font)?value!.font!:fallback.font};
}
export default function FontSettings({label,value,onChange,defaultValue}:{label:string;value:FontPreference;onChange:(value:FontPreference)=>void;defaultValue:FontPreference}) {
  const details=useRef<HTMLDetailsElement>(null);
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!details.current?.contains(event.target as Node)&&details.current)details.current.open=false;};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&details.current){details.current.open=false;}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[]);
  const size=(next:number)=>onChange({...value,size:Math.max(10,Math.min(28,next))});
  return <details className="font-settings" ref={details}><summary title={`${label} 글자 크기·글꼴 설정`} aria-label={`${label} 글자 크기·글꼴 설정`}><span>Aa</span><span className="font-settings-label">{label==='테이블'?'테이블 글꼴':'글꼴'}</span></summary><div className="font-settings-popover"><strong>{label} 글자 설정</strong><label>글자 크기<div className="font-size-stepper"><button aria-label={`${label} 글자 축소`} disabled={value.size<=10} onClick={()=>size(value.size-1)}>−</button><output>{value.size}px</output><button aria-label={`${label} 글자 확대`} disabled={value.size>=28} onClick={()=>size(value.size+1)}>+</button></div></label><input aria-label={`${label} 글자 크기`} type="range" min={10} max={28} step={1} value={value.size} onChange={event=>size(Number(event.target.value))}/><label>글꼴<select aria-label={`${label} 글꼴`} value={value.font} onChange={event=>onChange({...value,font:event.target.value})}>{fontOptions.map(font=><option key={font.id} value={font.id}>{font.name}</option>)}</select></label><div className="font-preview" style={{fontSize:value.size,fontFamily:fontFamily(value.font)}}>BoardID · 테이블</div><button className="font-reset" onClick={()=>onChange({...defaultValue})}>기본값으로</button></div></details>;
}
