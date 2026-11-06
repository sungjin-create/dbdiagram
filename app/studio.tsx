'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, SelectionMode, useNodesState, useViewport, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { sql } from '@codemirror/legacy-modes/mode/sql';
import { Database, Download, Upload, LayoutGrid, Palette, Maximize, FileCode2, Plus, PanelLeftClose, PanelRightClose, PanelRightOpen, CircleHelp, FolderOpen, FolderPlus, Save, Pencil, Trash2, ChevronDown, ChevronRight, X } from 'lucide-react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { parseSchema, errorMessage, starter, pastelColor, type Schema, type Table } from '../lib/schema';

type TableNode = Node<{ table: Table; highlightedFields?: string[] }, 'table'>;
function TableCard({ data, selected }: NodeProps<TableNode>) {
  const t = data.table;
  return <div className={`table-card ${selected ? 'selected' : ''}`}><header style={{ background: t.color }} title={t.note}><Database size={14}/><strong>{t.name}</strong><span>{t.fields.length}</span></header>
    {t.fields.map(f => <div className={`field ${data.highlightedFields?.includes(f.name) ? 'field-connected' : ''}`} key={f.name} title={f.note || `${f.name} · ${f.type}`}>
      <Handle id={`${f.name}-in-left`} type="target" position={Position.Left}/><Handle id={`${f.name}-out-left`} type="source" position={Position.Left}/><span className={f.pk ? 'key pk' : 'key'}>{f.pk ? '◆' : '·'}</span><span className="field-name">{f.name}</span><span className="field-type">{f.type}</span>{f.note && <span className="note-dot">•</span>}<Handle id={`${f.name}-in-right`} type="target" position={Position.Right}/><Handle id={`${f.name}-out-right`} type="source" position={Position.Right}/>
    </div>)}{t.note && <div className="table-note" title={t.note}>ⓘ {t.note}</div>}</div>;
}
const nodeTypes = { table: TableCard };
type AlignmentGuides = { vertical: number[]; horizontal: number[] };
function AlignmentOverlay({ guides }: { guides: AlignmentGuides }) {
  const { x, y, zoom } = useViewport();
  return <svg className="alignment-guides" aria-hidden="true">
    {guides.vertical.map(value=><line key={`v-${value}`} x1={value*zoom+x} x2={value*zoom+x} y1="0" y2="100%"/>)}
    {guides.horizontal.map(value=><line key={`h-${value}`} x1="0" x2="100%" y1={value*zoom+y} y2={value*zoom+y}/>)}
  </svg>;
}
const extensions = [StreamLanguage.define(sql({}))];
const storageKey = 'schema-studio-v1';
type Saved = { title: string; dbml: string; positions: Record<string, { x: number; y: number }>; viewport?: { x: number; y: number; zoom: number }; edgeColors?: Record<string,string> };
type Project = Saved & { id: string; folderId: string | null; tableNames: string[]; updatedAt: string };
type Library = { folders: { id: string; name: string }[]; projects: Project[]; activeId: string | null };
const libraryKey = 'schema-studio-projects-v1';
const pastelPalette = [
  ['블루', '#dbe5ff'], ['스카이', '#d5edfa'], ['민트', '#d1eee4'], ['그린', '#dfeecf'],
  ['레몬', '#f7edc6'], ['피치', '#f9dfca'], ['로즈', '#f5d6df'], ['라벤더', '#e7dcf5'],
  ['퍼플', '#dddafa'], ['그레이', '#e3e7ed'],
];
function download(name: string, value: string, type: string) { const url = URL.createObjectURL(new Blob([value], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export default function Studio() { return <ReactFlowProvider><Editor/></ReactFlowProvider>; }
function Editor() {
  const [source, setSource] = useState(starter), [title, setTitle] = useState('Untitled diagram');
  const [schema, setSchema] = useState<Schema>({ tables: [], relations: [], groups: [] });
  const [nodes, setNodes, onNodesChange] = useNodesState<TableNode>([]);
  const [error, setError] = useState(''), [status, setStatus] = useState('불러오는 중'), [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(''), [edgeId, setEdgeId] = useState(''), [filter, setFilter] = useState(''), [editorVisible, setEditorVisible] = useState(true);
  const [edgeColors, setEdgeColors] = useState<Record<string,string>>({});
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [editorWidth, setEditorWidth] = useState(360);
  const [guides, setGuides] = useState<AlignmentGuides>({vertical:[],horizontal:[]});
  const [projectsVisible, setProjectsVisible] = useState(false);
  const [colorMenu, setColorMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colorMenu) return;
    const dismiss = (event: PointerEvent) => { if(!colorMenuRef.current?.contains(event.target as globalThis.Node))setColorMenu(null); };
    const escapeMenu = (event: KeyboardEvent) => { if(event.key==='Escape')setColorMenu(null); };
    const close = () => setColorMenu(null);
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', escapeMenu); window.addEventListener('resize',close);
    return () => { document.removeEventListener('pointerdown',dismiss); document.removeEventListener('keydown',escapeMenu); window.removeEventListener('resize',close); };
  }, [colorMenu]);
  const [library, setLibrary] = useState<Library>({ folders: [], projects: [], activeId: null });
  const libraryRef = useRef(library);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  const diagram = useRef<HTMLDivElement>(null);
  function persistLibrary(next: Library) {
    try { localStorage.setItem(libraryKey, JSON.stringify(next)); libraryRef.current = next; setLibrary(next); return true; }
    catch { setStatus('프로젝트 저장 실패 · 파일로 내보내세요'); return false; }
  }
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  function clampEditorWidth(width: number) { return Math.max(240, Math.min(width, Math.max(240, window.innerWidth - (explorerVisible ? 242 : 0) - 360))); }
  const positions = useRef<Saved['positions']>({}); const viewport = useRef<Saved['viewport']>(undefined);
  const flow = useRef<ReactFlowInstance<TableNode> | null>(null); const file = useRef<HTMLInputElement>(null);
  function selectTable(id: string) {
    setNodes(current=>current.map(node=>({...node,selected:node.id===id})));
    setSelected(id);setEdgeId('');
  }
  function saveMovedTables(moved: TableNode[]) {
    for(const node of flow.current?.getNodes() || [])positions.current[node.id]={...node.position};
    for(const node of moved)positions.current[node.id]={...node.position};
    setGuides({vertical:[],horizontal:[]});setLayoutVersion(v=>v+1);
  }
  function showAlignmentGuides(moving: TableNode) {
    const instance = flow.current;
    if (!instance) return;
    const tolerance = 5 / instance.getZoom();
    const dimensions = (node: TableNode) => ({ width: node.measured?.width ?? 340, height: node.measured?.height ?? 44 + node.data.table.fields.length*34 + (node.data.table.note?34:0) });
    const size = dimensions(moving);
    const xs = [moving.position.x, moving.position.x+size.width/2, moving.position.x+size.width];
    const ys = [moving.position.y, moving.position.y+size.height/2, moving.position.y+size.height];
    const vertical = new Set<number>(), horizontal = new Set<number>();
    for(const other of instance.getNodes()) {
      if(other.id===moving.id || other.hidden || other.dragging) continue;
      const bounds = dimensions(other);
      for(const value of [other.position.x,other.position.x+bounds.width/2,other.position.x+bounds.width]) {
        if(xs.some(x=>Math.abs(x-value)<=tolerance))vertical.add(value);
      }
      for(const value of [other.position.y,other.position.y+bounds.height/2,other.position.y+bounds.height]) {
        if(ys.some(y=>Math.abs(y-value)<=tolerance))horizontal.add(value);
      }
    }
    setGuides({vertical:[...vertical],horizontal:[...horizontal]});
  }
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => { try { const raw = localStorage.getItem(libraryKey); if(raw) { const stored = JSON.parse(raw) as Library; libraryRef.current = stored; setLibrary(stored); } } catch { setStatus('프로젝트 목록을 읽지 못했습니다'); } }, []);
  useEffect(() => {
    const el = diagram.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      if (!flow.current || (event.target as HTMLElement).closest('.react-flow__minimap,.react-flow__controls')) return;
      event.preventDefault(); event.stopPropagation();
      const current = flow.current.getViewport();
      let next = current;
      const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? el.clientHeight : 1;
      const dx = event.deltaX * unit, dy = event.deltaY * unit;
      if (event.ctrlKey) {
        const zoom = Math.max(.08, Math.min(2, current.zoom * Math.exp(-dy * .002)));
        const rect = el.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
        next = { x: x - (x - current.x) * zoom / current.zoom, y: y - (y - current.y) * zoom / current.zoom, zoom };
      } else {
        next = { ...current, x: current.x - (event.shiftKey ? (dy || dx) : dx), y: current.y - (event.shiftKey ? 0 : dy) };
      }
      viewport.current = next; void flow.current.setViewport(next); setLayoutVersion(v => v + 1);
    };
    el.addEventListener('wheel', wheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', wheel, { capture: true });
  }, []);
  useEffect(() => { try { const raw = localStorage.getItem(storageKey); if(raw) { const s = JSON.parse(raw) as Saved; setSource(s.dbml); setTitle(s.title); positions.current = s.positions || {}; viewport.current = s.viewport; setEdgeColors(s.edgeColors || {}); } } catch { setStatus('저장 데이터를 읽지 못했습니다'); } setReady(true); }, []);
  useEffect(() => { if(!ready) return; const timer = setTimeout(() => { try { const parsed = parseSchema(source); setSchema(parsed); setError(''); setNodes(old => parsed.tables.map((t, i) => ({ id: t.id, type: 'table', position: old.find(n => n.id === t.id)?.position || positions.current[t.id] || { x: (i % 4) * 400 + 50, y: Math.floor(i / 4) * 1140 + 50 }, data: { table: t } }))); } catch(e) { setError(errorMessage(e)); } }, 350); return () => clearTimeout(timer); }, [source, ready, setNodes]);
  const snapshot = useCallback((): Saved => ({ title, dbml: source, positions: positions.current, viewport: viewport.current, edgeColors }), [title, source, edgeColors]);
  function saveProject(asNew = false) {
    const current = libraryRef.current;
    const existing = !asNew && current.projects.find(p => p.id === current.activeId);
    const project: Project = { ...snapshot(), id: existing ? existing.id : crypto.randomUUID(), folderId: existing ? existing.folderId : null, tableNames: schema.tables.map(t => t.name), updatedAt: new Date().toISOString() };
    return persistLibrary({ ...current, activeId: project.id, projects: existing ? current.projects.map(p => p.id === project.id ? project : p) : [...current.projects, project] });
  }
  function restoreProject(project: Saved) {
    positions.current = structuredClone(project.positions || {}); viewport.current = project.viewport;
    setSource(project.dbml); setTitle(project.title); setEdgeColors(project.edgeColors || {}); setSelected(''); setEdgeId(''); setError('');
    try { const parsed = parseSchema(project.dbml); setSchema(parsed); setNodes(parsed.tables.map((t,i) => ({ id:t.id, type:'table', position:positions.current[t.id] || {x:(i%4)*400+50,y:Math.floor(i/4)*1140+50}, data:{table:t} }))); }
    catch(e) { setSchema({tables:[],relations:[],groups:[]});setNodes([]);setError(errorMessage(e)); }
    if(project.viewport) void flow.current?.setViewport(project.viewport);
    else requestAnimationFrame(()=>requestAnimationFrame(()=>{void flow.current?.fitView({padding:.15});}));
  }
  function openProject(id: string) {
    if(id === libraryRef.current.activeId) return;
    if(!saveProject()) return;
    const current = libraryRef.current, project = current.projects.find(p=>p.id===id);
    if(project && persistLibrary({...current,activeId:id})) restoreProject(project);
  }
  function newProject() {
    if(!saveProject()) return;
    if(persistLibrary({...libraryRef.current,activeId:null})) restoreProject({title:'Untitled diagram',dbml:starter,positions:{}});
  }
  function createFolder() { const name = prompt('새 프로젝트 폴더 이름'); if(name?.trim())persistLibrary({...libraryRef.current,folders:[...libraryRef.current.folders,{id:crypto.randomUUID(),name:name.trim()}]}); }
  function renameFolder(id: string) { const current=libraryRef.current; const name=prompt('폴더 이름 변경',current.folders.find(f=>f.id===id)?.name); if(name?.trim())persistLibrary({...current,folders:current.folders.map(f=>f.id===id?{...f,name:name.trim()}:f)}); }
  function deleteFolder(id: string) { if(confirm('폴더를 삭제할까요? 포함된 프로젝트는 기본 위치로 이동합니다.')){const current=libraryRef.current;persistLibrary({...current,folders:current.folders.filter(f=>f.id!==id),projects:current.projects.map(p=>p.folderId===id?{...p,folderId:null}:p)});} }
  function renameProject(id: string) { const current=libraryRef.current; const name=prompt('프로젝트 이름 변경',current.projects.find(p=>p.id===id)?.title);if(name?.trim()&&persistLibrary({...current,projects:current.projects.map(p=>p.id===id?{...p,title:name.trim()}:p)})){if(current.activeId===id)setTitle(name.trim());} }
  function deleteProject(id: string) { if(confirm('저장된 프로젝트를 삭제할까요?')) {const current=libraryRef.current;if(persistLibrary({...current,activeId:current.activeId===id?null:current.activeId,projects:current.projects.filter(p=>p.id!==id)}))setStatus('프로젝트 삭제됨 · 현재 화면은 임시 문서로 유지');} }
  useEffect(() => { if(!ready) return; setStatus('저장 중…'); const timer = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(snapshot())); const current=libraryRef.current; if(current.activeId){const next={...current,projects:current.projects.map(p=>p.id===current.activeId?{...p,...snapshot(),tableNames:schema.tables.map(t=>t.name),updatedAt:new Date().toISOString()}:p)};if(!persistLibrary(next))return;} setStatus(current.activeId?'프로젝트 자동 저장됨':'임시 문서 저장됨'); } catch { setStatus('저장 공간 부족 · 파일로 내보내세요'); } }, 700); return () => clearTimeout(timer); }, [snapshot, ready, layoutVersion, schema]);
  const selectedTableIds = new Set(nodes.filter(n=>n.selected).map(n=>n.id));
  const nodeById = new Map(nodes.map(n=>[n.id,n]));
  const highlightedFields = new Map<string, Set<string>>();
  const edges = schema.relations.map(r => {
    const highlighted = selectedTableIds.size ? selectedTableIds.has(r.from) || selectedTableIds.has(r.to) : edgeId === r.id;
    if (highlighted) {
      for (const [id, field] of [[r.from, r.fromField], [r.to, r.toField]]) {
        if (!highlightedFields.has(id)) highlightedFields.set(id, new Set());
        highlightedFields.get(id)!.add(field);
      }
    }
    const sourceNode = nodeById.get(r.from), targetNode = nodeById.get(r.to);
    let sourceSide = 'right', targetSide = 'left';
    if(sourceNode && targetNode) {
      const sourceLeft=sourceNode.position.x, targetLeft=targetNode.position.x;
      const sourceRight=sourceLeft+(sourceNode.measured?.width??340), targetRight=targetLeft+(targetNode.measured?.width??340);
      if(sourceRight<=targetLeft) {sourceSide='right';targetSide='left';}
      else if(targetRight<=sourceLeft) {sourceSide='left';targetSide='right';}
      else {
        // Stacked or overlapping columns connect around the outside, avoiding table contents.
        const side=Math.abs(sourceLeft-targetLeft)<Math.abs(sourceRight-targetRight)?'left':'right';
        sourceSide=side;targetSide=side;
      }
    }
    return { id: r.id, source: r.from, target: r.to, sourceHandle: `${r.fromField}-out-${sourceSide}`, targetHandle: `${r.toField}-in-${targetSide}`, type: 'smoothstep', pathOptions:{offset:r.from===r.to?45:25,borderRadius:8}, label: r.fromField === r.toField ? r.fromField : `${r.fromField} → ${r.toField}`,
      zIndex: highlighted ? 10 : 0,
      style: { stroke: highlighted ? '#3b5bff' : edgeColors[r.id] || r.color, strokeWidth: highlighted ? 2.5 : 1.5, opacity: (selectedTableIds.size || edgeId) && !highlighted ? .35 : 1 },
      labelStyle: { fontSize: 13, fill: highlighted ? '#3b5bff' : '#65738a' }, selected: edgeId === r.id };
  });
  const displayNodes = nodes.map(n => ({ ...n,
    data: { ...n.data, highlightedFields: [...(highlightedFields.get(n.id) || [])] },
    style: { opacity: filter && !n.data.table.name.toLowerCase().includes(filter.toLowerCase()) ? .22 : 1 },
  }));
  async function arrange() { try { const elk = new ELK(); const graph = await elk.layout({ id: 'root', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.spacing.nodeNode': '80', 'elk.layered.spacing.nodeNodeBetweenLayers': '140' }, children: nodes.map(n => ({ id: n.id, width: 340, height: 44 + n.data.table.fields.length * 34 + (n.data.table.note ? 35 : 0) })), edges: schema.relations.filter(r => r.from !== r.to).map(r => ({ id:r.id, sources:[r.from], targets:[r.to] })) }); setNodes(old => old.map(n => { const child = graph.children!.find(c => c.id === n.id)!; const position = { x:child.x || 0, y:child.y || 0 }; positions.current[n.id] = position; return {...n,position}; })); setLayoutVersion(v=>v+1); setTimeout(()=>flow.current?.fitView({padding:.15,duration:400}),100); } catch { setStatus('자동 배치 실패'); } }
  function alignSelectedTables(direction: 'left' | 'top') {
    const selectedNodes = (flow.current?.getNodes() || nodes).filter(n=>n.selected);
    if(selectedNodes.length<2) return;
    const axis = direction==='left'?'x':'y';
    const coordinate = Math.min(...selectedNodes.map(n=>n.position[axis]));
    const updated = new Map(selectedNodes.map(n=>[n.id,{...n.position,[axis]:coordinate}]));
    setNodes(current=>current.map(n=>updated.has(n.id)?{...n,position:updated.get(n.id)!}:n));
    for(const [id,position] of updated)positions.current[id]=position;
    setGuides({vertical:[],horizontal:[]});setLayoutVersion(v=>v+1);
  }
  function arrangeByColor() {
    const current = flow.current?.getNodes() || nodes;
    if (!current.length) return;
    const hue = (color: string) => {
      const rgb = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
      const [r,g,b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), delta = max-min;
      if(delta < .045) return null;
      const value = max===r ? (g-b)/delta : max===g ? (b-r)/delta+2 : (r-g)/delta+4;
      return (value*60+360)%360;
    };
    const distance = (a: number,b: number) => Math.min(Math.abs(a-b),360-Math.abs(a-b));
    const groups: { hues: number[]; neutral: boolean; items: TableNode[] }[] = [];
    const sorted = current.map(node=>({node,hue:hue(node.data.table.color)})).sort((a,b)=>(a.hue??361)-(b.hue??361)||a.node.data.table.name.localeCompare(b.node.data.table.name));
    for(const item of sorted) {
      const group = groups.find(g=>item.hue===null ? g.neutral : !g.neutral && g.hues.every(h=>distance(h,item.hue!)<=32));
      if(group) { group.items.push(item.node); if(item.hue!==null)group.hues.push(item.hue); }
      else groups.push({hues:item.hue===null?[]:[item.hue],neutral:item.hue===null,items:[item.node]});
    }
    const blocks = groups.map(group=>{
      const columns = Math.min(3,Math.ceil(Math.sqrt(group.items.length)));
      const placements: {id:string;x:number;y:number}[] = [];
      let y=0, width=0;
      for(let i=0;i<group.items.length;i+=columns) {
        const row=group.items.slice(i,i+columns);
        let x=0, height=0;
        for(const node of row) {
          placements.push({id:node.id,x,y});
          const w=node.measured?.width??340;
          const h=node.measured?.height??44+node.data.table.fields.length*34+(node.data.table.note?34:0);
          x+=w+60; height=Math.max(height,h);
        }
        width=Math.max(width,x-60); y+=height+70;
      }
      return {placements,width,height:y-70};
    });
    const targetWidth=Math.max(...blocks.map(b=>b.width),Math.sqrt(blocks.reduce((area,b)=>area+(b.width+160)*(b.height+160),0)*1.5));
    let x=50,y=50,rowHeight=0;
    const nextPositions: Saved['positions'] = {};
    for(const block of blocks) {
      if(x>50 && x+block.width>targetWidth) {x=50;y+=rowHeight+160;rowHeight=0;}
      for(const p of block.placements)nextPositions[p.id]={x:x+p.x,y:y+p.y};
      x+=block.width+160;rowHeight=Math.max(rowHeight,block.height);
    }
    positions.current={...positions.current,...nextPositions};
    setNodes(old=>old.map(n=>({...n,position:nextPositions[n.id]||n.position})));
    setGuides({vertical:[],horizontal:[]});setLayoutVersion(v=>v+1);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{void flow.current?.fitView({padding:.15,duration:400});}));
  }
  function colorTable(name: string, color: string) {
    const pattern = new RegExp(`(\\bTable\\s+(?:"${escape(name)}"|${escape(name)})(?=\\s|\\[)(?:\\s+as\\s+\\w+)?\\s*)(\\[[^\\]]*\\])?(\\s*\\{)`);
    setSource(s => s.replace(pattern, (_, head, settings, brace) => `${head}${settings ? /headercolor\s*:/i.test(settings) ? settings.replace(/headercolor\s*:\s*#[a-f\d]{3,8}/i, `headercolor: ${color}`) : settings.slice(0,-1)+`, headercolor: ${color}]` : `[headercolor: ${color}]`}${brace}`));
  }
  async function importFile(f?: File) {
    if(!f)return;
    try {
      const text=await f.text();
      const imported: Saved = f.name.endsWith('.json') ? JSON.parse(text) : {title:f.name.replace(/\.dbml$/i,''),dbml:text,positions:{}};
      if(typeof imported.dbml!=='string')throw Error('올바른 프로젝트 파일이 아닙니다.');
      parseSchema(imported.dbml);
      if(!saveProject())return;
      if(!persistLibrary({...libraryRef.current,activeId:null}))return;
      restoreProject({...imported,title:imported.title || f.name});
    } catch(e){setError(errorMessage(e));}
  }
  const table = schema.tables.find(t=>t.id === selected); const relation = schema.relations.find(r=>r.id === edgeId);
  const menuTable = schema.tables.find(t=>t.id === colorMenu?.id);
  function projectCards(folderId: string | null) {
    return library.projects.filter(p=>p.folderId===folderId).map(p=><div className={`saved-project ${library.activeId===p.id?'active':''}`} key={p.id}>
      <div className="saved-project-title"><button onClick={()=>openProject(p.id)} title="프로젝트 열기"><FileCode2 size={15}/><span>{p.title}</span></button><button title="프로젝트 이름 변경" aria-label={`${p.title} 이름 변경`} onClick={()=>renameProject(p.id)}><Pencil size={13}/></button><button title="프로젝트 삭제" aria-label={`${p.title} 삭제`} onClick={()=>deleteProject(p.id)}><Trash2 size={13}/></button></div>
      <select aria-label={`${p.title} 폴더 이동`} value={p.folderId || ''} onChange={e=>{const current=libraryRef.current;persistLibrary({...current,projects:current.projects.map(item=>item.id===p.id?{...item,folderId:e.target.value || null}:item)});}}><option value="">기본 위치</option>{library.folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select>
      <details><summary>테이블 {p.tableNames?.length || 0}개</summary>{(p.tableNames || []).map(name=><div className="saved-table" key={name}><Database size={12}/>{name}</div>)}</details>
    </div>);
  }
  return <main className="studio"><nav className="topbar"><div className="brand"><div className="brand-icon"><Database size={21}/></div>schema<span>studio</span><b>BETA</b></div><div className="project-title"><input aria-label="프로젝트 이름" value={title} onChange={e=>setTitle(e.target.value)}/><span><i/> {status}</span></div><a className="docs" href="https://dbml.dbdiagram.io/docs/" target="_blank" rel="noreferrer"><CircleHelp size={15}/> DBML 가이드</a></nav>
    
    <div className={`workspace compact-workspace ${editorVisible?'':'hide-editor'} ${explorerVisible?'':'hide-explorer'}`} style={{ '--editor-width': `${editorWidth}px` } as CSSProperties}><aside className="action-rail" aria-label="문서 관리"><button title="프로젝트 목록" aria-label="프로젝트 목록" aria-expanded={projectsVisible} onClick={()=>setProjectsVisible(v=>!v)}><FolderOpen size={18}/></button><button title="프로젝트 저장" aria-label="프로젝트 저장" onClick={()=>{if(saveProject()){setProjectsVisible(true);setStatus('프로젝트 저장됨');}}}><Save size={18}/></button><button title="새 문서" aria-label="새 문서" onClick={newProject}><Plus size={15}/>새 문서</button><button title="가져오기" aria-label="가져오기" onClick={()=>file.current?.click()}><Upload size={15}/>가져오기</button><button title="DBML 내보내기" aria-label="DBML 내보내기" onClick={()=>download(`${title}.dbml`,source,'text/plain;charset=utf-8')}><FileCode2 size={15}/>DBML</button><button title="프로젝트 내보내기" aria-label="프로젝트 내보내기" className="primary" onClick={()=>download(`${title}.json`,JSON.stringify(snapshot(),null,2),'application/json')}><Download size={15}/>프로젝트 내보내기</button><input hidden ref={file} type="file" accept=".dbml,.txt,.json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></aside>{projectsVisible && <aside className="project-sidebar"><div className="panel-heading">프로젝트<button aria-label="프로젝트 목록 접기" onClick={()=>setProjectsVisible(false)}><X size={16}/></button></div><div className="project-sidebar-actions"><button onClick={()=>{if(saveProject())setStatus('프로젝트 저장됨');}}><Save size={14}/>저장</button><button onClick={newProject}><Plus size={14}/>새 문서</button><button onClick={createFolder} title="폴더 만들기" aria-label="폴더 만들기"><FolderPlus size={16}/></button></div><div className="project-library"><h3>기본 위치</h3>{projectCards(null)}{library.folders.map(folder=><section className="project-folder" key={folder.id}><div className="folder-heading"><button onClick={()=>setCollapsedFolders(ids=>ids.includes(folder.id)?ids.filter(id=>id!==folder.id):[...ids,folder.id])}>{collapsedFolders.includes(folder.id)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<FolderOpen size={14}/><span>{folder.name}</span></button><button title="폴더 이름 변경" aria-label={`${folder.name} 이름 변경`} onClick={()=>renameFolder(folder.id)}><Pencil size={13}/></button><button title="폴더 삭제" aria-label={`${folder.name} 삭제`} onClick={()=>deleteFolder(folder.id)}><Trash2 size={13}/></button></div>{!collapsedFolders.includes(folder.id)&&projectCards(folder.id)}</section>)}{library.projects.length===0 && <p className="library-empty">저장 버튼으로 현재 관계도를<br/>프로젝트에 보관하세요.</p>}</div><div className="library-notice">이 브라우저에 저장 · 프로젝트를 열면 배치와 색상도 복원됩니다.</div></aside>}<aside className="code-panel"><div className="panel-heading"><span><FileCode2 size={16}/> DBML Editor</span><button aria-label="편집기 접기" onClick={()=>setEditorVisible(false)}><PanelLeftClose size={16}/></button></div><div className="editor-tab"><span/>schema.dbml <small>DBML</small></div><div className="code-wrap"><CodeMirror value={source} height="100%" extensions={extensions} onChange={setSource} basicSetup={{foldGutter:true,highlightActiveLine:true}}/></div>{error && <div className="error" role="alert"><strong>DBML 확인이 필요합니다</strong><pre>{error}</pre><small>마지막 정상 관계도를 표시하고 있습니다.</small></div>}<div className="editor-foot"><span>UTF-8</span><span>{source.split('\n').length} lines</span></div></aside>
    <div className="editor-resizer" role="separator" aria-label="DBML 편집기 너비 조절" aria-orientation="vertical" aria-valuemin={240} aria-valuenow={editorWidth} tabIndex={0} onPointerDown={e=>{resizeStart.current={x:e.clientX,width:editorWidth};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(resizeStart.current)setEditorWidth(clampEditorWidth(resizeStart.current.width+e.clientX-resizeStart.current.x));}} onPointerUp={()=>{resizeStart.current=null;}} onPointerCancel={()=>{resizeStart.current=null;}} onLostPointerCapture={()=>{resizeStart.current=null;}} onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();setEditorWidth(w=>clampEditorWidth(w+(e.key==="ArrowRight"?20:-20)));}}}/><section className="canvas-section"><div className="canvas-toolbar"><div className="view-label">DIAGRAM <span>{schema.tables.length} tables</span></div><div><button onClick={()=>setEditorVisible(v=>!v)} title="편집기 표시"><FileCode2 size={16}/></button><button onClick={arrange}><LayoutGrid size={15}/>자동 배치</button><button onClick={arrangeByColor} title="비슷한 헤더 색상끼리 모아 배치"><Palette size={15}/>색상별 정렬</button><button disabled={selectedTableIds.size<2} onClick={()=>alignSelectedTables('left')} title="선택한 테이블의 왼쪽 경계 맞추기">왼쪽 정렬</button><button disabled={selectedTableIds.size<2} onClick={()=>alignSelectedTables('top')} title="선택한 테이블의 위쪽 경계 맞추기">위쪽 정렬</button><button onClick={()=>flow.current?.fitView({padding:.15,duration:350})}><Maximize size={15}/>전체 보기</button><button aria-expanded={explorerVisible} aria-controls="explorer-panel" onClick={()=>{setExplorerVisible(v=>!v);setFilter('');}} title={explorerVisible?'Explorer 접기':'Explorer 펼치기'}>{explorerVisible?<PanelRightClose size={16}/>:<PanelRightOpen size={16}/>}Explorer</button></div></div>
      <div className="diagram" ref={diagram}><ReactFlow<TableNode> selectionOnDrag selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode={['Control','Meta']} panOnDrag={[1,2]} onSelectionChange={({nodes:selectedNodes})=>{setSelected(selectedNodes.length===1?selectedNodes[0].id:'');if(selectedNodes.length)setEdgeId('');}} onSelectionDragStart={()=>{setColorMenu(null);setGuides({vertical:[],horizontal:[]});}} onSelectionDragStop={(_,moved)=>saveMovedTables(moved)} zoomOnScroll={false} zoomOnPinch={false} panOnScroll={false} preventScrolling={false} nodes={displayNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeContextMenu={(event,n)=>{event.preventDefault();if(!n.selected)selectTable(n.id);else setSelected(n.id);setEdgeId('');setColorMenu({id:n.id,x:Math.max(8,Math.min(event.clientX,window.innerWidth-252)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-270))});}} onNodeClick={()=>{setEdgeId('');}} onEdgeClick={(_,e)=>{setEdgeId(e.id);setSelected('');}} onPaneClick={()=>{setSelected('');setEdgeId('');}} onNodeDragStart={()=>{setColorMenu(null);setGuides({vertical:[],horizontal:[]});}} onNodeDrag={(_,n)=>showAlignmentGuides(n)} onNodeDragStop={(_,n,moved)=>saveMovedTables(moved.length?moved:[n])} onMoveEnd={(_,v)=>{viewport.current=v;setLayoutVersion(n=>n+1);}} onInit={instance=>{flow.current=instance;if(viewport.current)instance.setViewport(viewport.current);}} fitView minZoom={.08} maxZoom={2} nodesConnectable={false} deleteKeyCode={null}><Background gap={22} size={1} color="#d6dce7"/><Controls showInteractive={false}/><MiniMap nodeColor={n=>(n.data as {table:Table}).table.color} maskColor="rgba(244,246,250,.7)" pannable zoomable/></ReactFlow>
      <AlignmentOverlay guides={guides}/><div className="canvas-hint">빈 공간 드래그로 다중 선택 · 선택한 테이블을 끌어 함께 이동 <span>·</span> 휠로 세로 이동 · Shift+휠 가로 이동 · Ctrl+휠 확대·축소 <span>·</span> 테이블 / 관계선 선택으로 색상 변경</div></div></section>
    <aside id="explorer-panel" className="inspector"><div className="panel-heading">Explorer <button aria-label="Explorer 접기" onClick={()=>{setExplorerVisible(false);setFilter('');}}><PanelRightClose size={16}/></button></div><input className="search" placeholder="테이블 검색…" aria-label="테이블 검색" value={filter} onChange={e=>setFilter(e.target.value)}/><div className="table-list">{schema.tables.filter(t=>t.name.toLowerCase().includes(filter.toLowerCase())).map(t=><button className={selected===t.id?'active':''} key={t.id} onClick={()=>{selectTable(t.id);flow.current?.fitView({nodes:[{id:t.id}],maxZoom:1,padding:.5,duration:350});}}><span style={{background:t.color}}/>{t.name}<small>{t.fields.length}</small></button>)}</div>
      <div className="properties"><h3>{table ? '테이블 설정' : relation ? '관계선 설정' : '선택한 항목'}</h3>{table ? <><strong>{table.name}</strong><label>헤더 색상<input aria-label="테이블 헤더 색상" type="color" value={table.color} onChange={e=>colorTable(table.name,e.target.value)}/></label>{table.note && <p>{table.note}</p>}</> : relation ? <><strong>{relation.from.split('.').slice(1).join('.')} → {relation.to.split('.').slice(1).join('.')}</strong><p>{relation.fromField} → {relation.toField}</p><label>선 색상<input aria-label="관계선 색상" type="color" value={edgeColors[relation.id] || relation.color} onChange={e=>setEdgeColors(v=>({...v,[relation.id]:e.target.value}))}/></label><small>관계선 색상은 프로젝트 파일에 저장됩니다.</small></> : <p>테이블이나 관계선을 선택해<br/>색상과 메모를 확인하세요.</p>}</div>
      {schema.groups.length>0 && <div className="groups"><h3>TABLE GROUPS</h3>{schema.groups.map(g=><div key={g.name}><span>{g.name}</span><input aria-label={`${g.name} 그룹 테이블 색상`} title="그룹 테이블의 헤더 색상 변경" type="color" defaultValue={g.color} onChange={e=>g.tables.forEach(name=>colorTable(name,e.target.value))}/></div>)}</div>}
      <button className="sample" onClick={async()=>{if(confirm('첨부했던 율촌 Board DBML을 불러올까요? 현재 문서는 내보내기로 보관할 수 있습니다.')){const r=await fetch('/yulchon-board.dbml');if(r.ok)await importFile(new File([await r.text()],'yulchon-board.dbml'));}}}>첨부한 율촌 예제 불러오기 ↗</button>
    </aside></div>{colorMenu && menuTable && <div className="table-color-menu" ref={colorMenuRef} role="dialog" aria-label="테이블 색상 선택" style={{left:colorMenu.x,top:colorMenu.y}} onContextMenu={event=>event.preventDefault()}><div className="color-menu-heading"><strong>{menuTable.name}</strong><button aria-label="색상 메뉴 닫기" onClick={()=>setColorMenu(null)}><X size={15}/></button></div><p>테이블 색상</p><div className="pastel-palette">{pastelPalette.map(([name,color])=><button key={color} title={name} aria-label={`${name} 색상`} aria-pressed={menuTable.color.toLowerCase()===color} style={{background:color}} onClick={()=>{colorTable(menuTable.name,color);setColorMenu(null);}}/>)}</div><label className="custom-pastel">직접 선택<input aria-label="사용자 지정 테이블 색상" type="color" value={menuTable.color} onChange={event=>colorTable(menuTable.name,pastelColor(event.target.value))}/></label></div>}<footer className="statusbar"><span><span className={error?'bad-dot':'good-dot'}/>{error?'문법 오류': 'DBML 연결됨'}</span><span>{schema.tables.length} tables <b>·</b> {schema.relations.length} relationships</span><span>내 브라우저에 자동 저장 · DBML + 배치는 프로젝트 파일로 보관</span></footer></main>;
}
