import { Parser } from '@dbml/core';

export type Field = { name: string; type: string; pk: boolean; note: string };
export type Table = { id: string; name: string; color: string; note: string; fields: Field[] };
export type Relation = { id: string; from: string; to: string; fromField: string; toField: string; color: string; label: string };
export type Group = { name: string; color: string; tables: string[] };
export type Schema = { tables: Table[]; relations: Relation[]; groups: Group[] };

export function pastelColor(color: string): string {
  const hex = color.replace('#', '');
  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(hex)) return '#dbe5ff';
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const rgb = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  if (Math.min(...rgb) >= 180) return `#${full}`;
  return '#' + rgb.map(v => Math.round(v * .25 + 255 * .75).toString(16).padStart(2, '0')).join('');
}

// Database's normalized JSON is the public serialization format of @dbml/core.
export function parseSchema(source: string): Schema {
  const db = new Parser().parse(source, 'dbmlv2').export() as any;
  const schemas = db.schemas ?? [];
  const tables: Table[] = schemas.flatMap((s: any) => s.tables.map((t: any) => ({
    id: `${s.name}.${t.name}`, name: t.name, color: pastelColor(t.headerColor || '#dbe5ff'), note: t.note || '',
    fields: t.fields.map((f: any) => ({ name: f.name, type: f.type.type_name, pk: !!f.pk, note: f.note || '' })),
  })));
  const relations: Relation[] = schemas.flatMap((s: any) => (s.refs || []).map((r: any, i: number) => ({
    id: `${s.name}-ref-${i}`, from: `${r.endpoints[0].schemaName || s.name}.${r.endpoints[0].tableName}`,
    to: `${r.endpoints[1].schemaName || s.name}.${r.endpoints[1].tableName}`,
    fromField: r.endpoints[0].fieldNames[0], toField: r.endpoints[1].fieldNames[0],
    color: r.color || '#8b97ae', label: `${r.endpoints[0].relation} : ${r.endpoints[1].relation}`,
  })));
  const groups = schemas.flatMap((s: any) => (s.tableGroups || []).map((g: any) => ({ name: g.name, color: g.color || '#4767da', tables: g.tables.map((t: any) => typeof t === 'string' ? t : t.tableName || t.name) })));
  return { tables, relations, groups };
}

export function errorMessage(error: unknown): string {
  const e = error as any;
  return e.diags?.map((d: any) => `${d.location?.start?.line ? `줄 ${d.location.start.line}: ` : ''}${d.message}`).join('\n') || e.message || 'DBML 문법을 확인해 주세요.';
}

export const starter = `Project my_project {\n  database_type: 'PostgreSQL'\n}\n\nTable users [headercolor: #4767da] {\n  id integer [pk, increment]\n  name varchar(100)\n  email varchar(255) [unique]\n  created_at timestamp\n}\n\nTable posts [headercolor: #0d9488] {\n  id integer [pk, increment]\n  user_id integer\n  title varchar(255)\n  body text\n  created_at timestamp\n}\n\nTable comments [headercolor: #d49435] {\n  id integer [pk, increment]\n  post_id integer\n  user_id integer\n  body text\n}\n\nRef: posts.user_id > users.id\nRef: comments.post_id > posts.id\nRef: comments.user_id > users.id\n\nTableGroup content {\n  posts\n  comments\n}\n`;
