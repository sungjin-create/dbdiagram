import { StreamLanguage } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { parseSchema } from './schema';
import { sourceIssues } from './diagnostics';

const dbml=StreamLanguage.define({
  startState:()=>({blockComment:false,multiline:false}),
  token(stream,state){
    if(state.blockComment){if(stream.skipTo('*/')){stream.match('*/');state.blockComment=false;}else stream.skipToEnd();return 'comment';}
    if(state.multiline){if(stream.skipTo("'''")){stream.match("'''");state.multiline=false;}else stream.skipToEnd();return 'string';}
    if(stream.eatSpace())return null;
    if(stream.match('//')){stream.skipToEnd();return 'comment';}
    if(stream.match('/*')){state.blockComment=true;return 'comment';}
    if(stream.match("'''")){state.multiline=true;return 'string';}
    if(stream.match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/))return 'string';
    if(stream.match(/#[a-f\d]{3,8}\b/i))return 'color';
    if(stream.match(/\b(?:Project|Table|TableGroup|Enum|Ref|Note|TablePartial|indexes|checks|records)\b/))return 'keyword';
    if(stream.match(/\b(?:pk|primary\s+key|unique|increment|not\s+null|null|note|headercolor|color|default|database_type)\b/i))return 'attributeName';
    if(stream.match(/\b(?:int|integer|bigint|tinyint|varchar|nvarchar|char|text|ntext|datetime|timestamp|boolean|bit|uuid|decimal)\b/i))return 'typeName';
    if(stream.match(/\b\d+(?:\.\d+)?\b/))return 'number';
    stream.next();return null;
  },
});
export const editorExtensions=[dbml,lintGutter(),linter(view=>{
  const source=view.state.doc.toString();
  try{parseSchema(source);return [];}catch(error){return sourceIssues(error,source);}
},{delay:350})];
