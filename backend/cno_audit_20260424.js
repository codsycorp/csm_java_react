const fs=require('fs');
const base='backend/csm_datas/public/banhang';
const oldMsdt=JSON.parse(fs.readFileSync(`${base}/sys_msdt_config_202604200952.json`,'utf8')).sys_msdt_config;
const oldTbl=JSON.parse(fs.readFileSync(`${base}/sys_tbl_config_202604200953.json`,'utf8')).sys_tbl_config;
const oldRpt=JSON.parse(fs.readFileSync(`${base}/sys_report_202604200952.json`,'utf8')).sys_report;
const oldTrig=JSON.parse(fs.readFileSync(`${base}/sys_triggers_202604200953.json`,'utf8')).sys_triggers;
const full=JSON.parse(fs.readFileSync(`${base}/new_system_20260424/cno_menu_full_newsystem_20260424.json`,'utf8'));

const roots=['congno'];
const byParent=new Map();
for(const m of oldMsdt){ if(!byParent.has(m.parent_id)) byParent.set(m.parent_id,[]); byParent.get(m.parent_id).push(m); }
const keep=new Set();
const stack=[...roots];
while(stack.length){
  const pid=stack.pop();
  for(const c of (byParent.get(pid)||[])) if(!keep.has(c.id)){ keep.add(c.id); stack.push(c.id); }
}

const srcMenus=oldMsdt.filter(x=>keep.has(x.id));
const srcById=new Map(srcMenus.map(x=>[x.id,x]));
const fullById=new Map(full.menus.map(x=>[x.id,x]));
const msdtFields=['id','parent_id','m_icon','grid_name','table_name','e_where','table_read_only','table_sort','table_pagesize','field_root','qt_stt','report_name','type_form','prefix_pk','report_query','m_show','link_page','bit_field_right','custom_footer','custom_group','can_see','f_showonreport'];

const stable=(o)=>JSON.stringify(o);
const sortTbl=(a,b)=> (Number(a.f_stt||0)-Number(b.f_stt||0)) || String(a.f_name).localeCompare(String(b.f_name));
const sortTrig=(a,b)=> (Number(a.loaitrigger||0)-Number(b.loaitrigger||0)) || (Number(a.stt||0)-Number(b.stt||0));

const newIds=new Set(full.menus.map(m=>m.id));
const missing=[...keep].filter(id=>!newIds.has(id));
const extra=[...newIds].filter(id=>!keep.has(id));

let msdtMismatch=[];
for(const id of keep){
  const s=srcById.get(id), n=fullById.get(id);
  if(!n){ msdtMismatch.push({id,missingInNew:true}); continue; }
  for(const f of msdtFields){
    const sv=(s?.[f]??''); const nv=(n?.[f]??'');
    if(String(sv)!==String(nv)){ msdtMismatch.push({id,field:f,src:sv,new:nv}); break; }
  }
}

let tblMismatch=[]; let trigMismatch=[]; let rptMismatch=[]; let triggerTemplateIssue=[];
const rptById=new Map(oldRpt.map(r=>[r.id,r]));
for(const id of keep){
  const n=fullById.get(id); if(!n) continue;
  const srcTbl=oldTbl.filter(x=>x.id===id).slice().sort(sortTbl);
  const newTbl=(n.m_configs?.table||[]).slice().sort(sortTbl);
  if(srcTbl.length!==newTbl.length || stable(srcTbl)!==stable(newTbl)) tblMismatch.push({id,src:srcTbl.length,new:newTbl.length});

  const srcTr=oldTrig.filter(x=>x.id===id).slice().sort(sortTrig);
  const newTr=(n.m_configs?.trigger_legacy_rows||[]).slice().sort(sortTrig);
  if(srcTr.length!==newTr.length || stable(srcTr)!==stable(newTr)) trigMismatch.push({id,src:srcTr.length,new:newTr.length});

  const rname=(n.report_name||'').trim();
  if(rname){
    const sr=rptById.get(rname)||null;
    const nr=n.m_configs?.report ?? null;
    if(stable(sr)!==stable(nr)) rptMismatch.push({id,report_name:rname,src:!!sr,new:!!nr});
  }

  if((n.m_configs?.trigger_legacy_rows||[]).length>0){
    const tplOk=String(n.m_configs?.trigger_newstyle_template||'').trim().length>0;
    const hc=n.m_configs?.trigger_hook_counts||{};
    const hooksOk=['beforeSave','afterAdd','afterEdit','afterDelete','custom'].every(k=>Object.prototype.hasOwnProperty.call(hc,k));
    if(!tplOk || !hooksOk) triggerTemplateIssue.push({id,tplOk,hooksOk});
  }
}

const result={
  scope:{sourceDescendants:keep.size,newMenus:full.menus.length,missing:missing.length,extra:extra.length},
  totals:{
    tableRows:full.menus.reduce((s,m)=>s+(m.m_configs?.table||[]).length,0),
    triggerRows:full.menus.reduce((s,m)=>s+(m.m_configs?.trigger_legacy_rows||[]).length,0),
    reportRows:full.menus.reduce((s,m)=>s+(m.m_configs?.report?1:0),0)
  },
  mismatches:{
    msdt:msdtMismatch,
    table:tblMismatch,
    trigger:trigMismatch,
    report:rptMismatch,
    triggerTemplate:triggerTemplateIssue,
    missingMenus:missing,
    extraMenus:extra
  }
};

const outJson=`${base}/new_system_20260424/cno_migration_audit_20260424.json`;
const outMd=`${base}/new_system_20260424/CNO_MIGRATION_AUDIT_20260424.md`;
fs.writeFileSync(outJson,JSON.stringify(result,null,2)+'\n','utf8');

const md=[
'# CNO MIGRATION AUDIT 2026-04-24',
'',
'Kiem dinh triet de file cno_menu_full_newsystem_20260424.json so voi nguon cu:',
'- sys_msdt_config_202604200952.json',
'- sys_tbl_config_202604200953.json',
'- sys_report_202604200952.json',
'- sys_triggers_202604200953.json',
'',
'## Scope',
`- source descendants from parent_id=congno: ${result.scope.sourceDescendants}`,
`- new menus in target: ${result.scope.newMenus}`,
`- missing menus: ${result.scope.missing}`,
`- extra menus: ${result.scope.extra}`,
'',
'## Totals in target',
`- table config rows: ${result.totals.tableRows}`,
`- trigger legacy rows: ${result.totals.triggerRows}`,
`- report rows: ${result.totals.reportRows}`,
'',
'## Strict parity checks',
`- msdt core field mismatch: ${result.mismatches.msdt.length}`,
`- sys_tbl_config mismatch: ${result.mismatches.table.length}`,
`- sys_triggers mismatch: ${result.mismatches.trigger.length}`,
`- sys_report mismatch: ${result.mismatches.report.length}`,
`- trigger template/hook structure issue: ${result.mismatches.triggerTemplate.length}`,
'',
'## Conclusion',
(result.scope.missing===0 && result.scope.extra===0 && result.mismatches.msdt.length===0 && result.mismatches.table.length===0 && result.mismatches.trigger.length===0 && result.mismatches.report.length===0 && result.mismatches.triggerTemplate.length===0)
? '- Migration status: PASS'
: '- Migration status: FAIL',
''
].join('\n');
fs.writeFileSync(outMd,md,'utf8');

console.log(JSON.stringify({
  scope:result.scope,
  totals:result.totals,
  mismatchCounts:{
    msdt:result.mismatches.msdt.length,
    table:result.mismatches.table.length,
    trigger:result.mismatches.trigger.length,
    report:result.mismatches.report.length,
    triggerTemplate:result.mismatches.triggerTemplate.length
  }
},null,2));
