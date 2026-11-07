/** Typed, executable data workbench. All configuration is serializable and contains no secrets. */
const node=(name,description,defaults,fields,extra={})=>({name,description,group:'Data workbench',color:'blue',inputs:{in:'flow'},outputs:{out:'flow',tool:'tool'},defaults,fields,...extra});
const f=(key,label,type='text',options)=>({key,label,type,options});
export const workbenchBlocks={
 csv_read:node('Read CSV','Parse real CSV text, including quoted cells, into typed rows.',{field:'text',delimiter:',',header:true},[f('field','Incoming CSV field'),f('delimiter','Delimiter'),f('header','First row contains column names','checkbox')]),
 rows_filter:node('Filter rows','Keep rows that match a typed comparison without executing user code.',{field:'rows',column:'status',operator:'equals',value:'paid'},[f('field','Rows field'),f('column','Column'),f('operator','Comparison','text',['equals','not_equals','contains','gt','gte','lt','lte','exists']),f('value','Value')]),
 rows_map:node('Select & rename columns','Map input fields to a clear output schema; missing values stay null.',{field:'rows',mapping:'{"id":"id","amount":"amount"}'},[f('field','Rows field'),f('mapping','Output name → input path (JSON)','code')]),
 rows_aggregate:node('Group & aggregate','Group rows and calculate totals, counts, average, minimum and maximum.',{field:'rows',groupBy:'category',valueField:'amount'},[f('field','Rows field'),f('groupBy','Group columns, comma separated'),f('valueField','Numeric column')]),
 rows_join:node('Join datasets','Join two real row arrays by exact keys; duplicate matches are retained within output limits.',{left:'rows',right:'lookup',leftKey:'id',rightKey:'id',mode:'left'},[f('left','Left dataset field'),f('right','Right dataset field'),f('leftKey','Left key'),f('rightKey','Right key'),f('mode','Join type','text',['left','inner'])]),
 rows_validate:node('Validate data','Return valid rows and a separate issue list with row/column evidence.',{field:'rows',schema:'{"id":"required","amount":"number"}'},[f('field','Rows field'),f('schema','Column rules (required, number, email, date)','code')]),
 rows_export:node('Export report','Create a real downloadable CSV, JSON, Markdown or HTML report from the current data.',{field:'rows',title:'Business report',format:'csv'},[f('field','Rows/data field'),f('title','Report title'),f('format','File format','text',['csv','json','markdown','html'])],{group:'Output'}),
 source_http:node('HTTP / PHP / intranet source','Fetch a configured JSON/text endpoint. Intranet access is limited to an operator allowlist.',{url:'https://example.com/data.json',path:''},[f('url','HTTPS source URL'),f('path','Result rows path (optional)')],{group:'Sources',runtime:'source'}),
 source_media:node('YouTube / TikTok source brief','Collect public oEmbed metadata and an optional user-supplied transcript. Does not invent or scrape a transcript.',{url:'{{input.url}}',transcriptField:'transcript'},[f('url','Video URL / {{input.url}}'),f('transcriptField','Supplied transcript field')],{group:'Sources',runtime:'source'}),
};
for(const [engine,name] of Object.entries({mysql:'MySQL',sqlserver:'SQL Server',oracle:'Oracle',mongo:'MongoDB',firestore:'Firebase Firestore',odbc:'ODBC gateway'})){
 const mongo=engine==='mongo',firestore=engine==='firestore';
 workbenchBlocks['db_'+engine]=node(name+' · Read',engine==='odbc'?'Read through an explicitly configured ODBC gateway; its driver runs on your gateway host.':'Execute a bounded read using a private '+name+' connection.',{query:mongo?'{}':firestore?'{}':'SELECT 1 AS connected',parameters:'[]',collection:'records',limit:200},[f('query',mongo?'Find filter (JSON)':firestore?'Structured query (JSON)':'Read-only query','code'),f('parameters','Bound parameters (JSON array)','code'),...(mongo||firestore?[f('collection','Collection')]:[]),f('limit','Maximum rows (1–200)','number')],{group:'Databases',runtime:'database',connection:engine});
}
export function workbenchIssues(n){
 const s=workbenchBlocks[n.type];if(!s)return [];
 const issues=[];for(const field of s.fields){const value=n.config[field.key];if(field.type==='number'&&(!Number.isInteger(value)||value<1||value>200))issues.push(field.label+' must be 1–200.');if(field.options&&!field.options.includes(value))issues.push('Choose a valid '+field.label+'.');if(field.type==='code'){try{JSON.parse(value);}catch{issues.push(field.label+' must be valid JSON.');}}}
 return issues;
}
