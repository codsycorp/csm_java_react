const fs=require('fs');
const base='backend/csm_datas/public/banhang';
const oldMsdt=JSON.parse(fs.readFileSync(`${base}/sys_msdt_config_202604200952.json`,'utf8')).sys_msdt_config;
const oldTbl=JSON.parse(fs.readFileSync(`${base}/sys_tbl_config_202604200953.json`,'utf8')).sys_tbl_config;
const oldRpt=JSON.parse(fs.readFileSync(`${base}/sys_report_202604200952.json`,'utf8')).sys_report;
const oldTrig=JSON.parse(fs.readFileSync(`${base}/sys_triggers_202604200953.json`,'utf8')).sys_triggers;
const trigMap=JSON.parse(fs.readFileSync(`${base}/new_system_20260424/sys_triggers_newstyle_mapping_20260424.json`,'utf8'));
const mapItems=(trigMap.items||[]);
const mapById=new Map(mapItems.map(it=>[it.id,it]));

const byParent=new Map();
for(const m of oldMsdt){ if(!byParent.has(m.parent_id)) byParent.set(m.parent_id,[]); byParent.get(m.parent_id).push(m); }
const keep=new Set();
const stack=['congno'];
while(stack.length){
  const pid=stack.pop();
  for(const c of (byParent.get(pid)||[])) if(!keep.has(c.id)){ keep.add(c.id); stack.push(c.id); }
}

const sourceMenus=oldMsdt.filter(m=>keep.has(m.id));

function hookCounts(triggers){
  const counts={beforeSave:0,afterAdd:0,afterEdit:0,afterDelete:0,custom:0};
  for(const t of triggers){
    const type=String(t.loaitrigger||'').toUpperCase();
    if(type==='PRK' || type==='TBU') counts.beforeSave++;
    else if(type==='TAU'){ counts.afterAdd++; counts.afterEdit++; }
    else if(type==='TOD') counts.afterDelete++;
    else counts.custom++;
  }
  return counts;
}

function fallbackTemplate(triggers){
  const mk=(type)=>triggers.filter(t=>String(t.loaitrigger||'').toUpperCase()===type);
  const prkTbu=[...mk('PRK'),...mk('TBU')];
  const tau=mk('TAU');
  const tod=mk('TOD');
  const lines=[];
  lines.push('({');
  lines.push('  beforeSave: async (row, seft, data) => {');
  lines.push('    // Legacy SQL mapped from PRK/TBU; execute on backend service.');
  for(let i=0;i<prkTbu.length;i++) lines.push(`    // ${i+1}. [${prkTbu[i].loaitrigger}/${prkTbu[i].stt}] ${String(prkTbu[i].trigger_value||'').replace(/\\n/g,' ')}`);
  lines.push('    return row;');
  lines.push('  },');
  lines.push('  afterAdd: async (payload, context) => {');
  for(let i=0;i<tau.length;i++) lines.push(`    // ${i+1}. [TAU/${tau[i].stt}] ${String(tau[i].trigger_value||'').replace(/\\n/g,' ')}`);
  lines.push('  },');
  lines.push('  afterEdit: async (payload, context) => {');
  lines.push('    // Reuse TAU logic for edit when old behavior applies to both add/update.');
  for(let i=0;i<tau.length;i++) lines.push(`    // ${i+1}. [TAU/${tau[i].stt}] ${String(tau[i].trigger_value||'').replace(/\\n/g,' ')}`);
  lines.push('  },');
  lines.push('  afterDelete: async (payload, context) => {');
  for(let i=0;i<tod.length;i++) lines.push(`    // ${i+1}. [TOD/${tod[i].stt}] ${String(tod[i].trigger_value||'').replace(/\\n/g,' ')}`);
  lines.push('  },');
  lines.push('})');
  return lines.join('\\n');
}

const menus=sourceMenus.map(m=>{
  const table=oldTbl.filter(t=>t.id===m.id);
  const triggers=oldTrig.filter(t=>t.id===m.id);
  const report=(m.report_name||'').trim()? (oldRpt.find(r=>r.id===m.report_name)||null) : null;
  const mapped=mapById.get(m.id);
  const template = mapped?.m_configs_trigger_template || (triggers.length?fallbackTemplate(triggers):'');
  let dataSourceMode='trigger_load_db';
  if((m.table_name||'').trim() && (m.report_name||'').trim()) dataSourceMode='hybrid';
  else if((m.table_name||'').trim()) dataSourceMode='table_name';

  return {
    ...m,
    name: m.grid_name,
    data_source_mode: dataSourceMode,
    m_configs: {
      table,
      report,
      trigger_legacy_rows: triggers,
      trigger_newstyle_template: template,
      trigger_hook_counts: hookCounts(triggers)
    },
    compatibility: {
      validation_profile: 'legacy',
      source_chunks: {
        from_msdt: true,
        from_tbl_count: table.length,
        from_report: !!report,
        from_trigger_count: triggers.length
      }
    }
  };
});

const doc={
  app_id:'banhang',
  mode:'migrate',
  validation_profile:'legacy',
  summary:'CNO rebuilt strictly by descendants of parent_id=congno and synchronized with legacy table/report/trigger configs.',
  menus
};

const out=`${base}/new_system_20260424/cno_menu_full_newsystem_20260424.json`;
fs.writeFileSync(out,JSON.stringify(doc,null,2)+'\n','utf8');

console.log(JSON.stringify({
  menus:menus.length,
  tables:menus.reduce((s,m)=>s+m.m_configs.table.length,0),
  triggers:menus.reduce((s,m)=>s+m.m_configs.trigger_legacy_rows.length,0),
  reports:menus.reduce((s,m)=>s+(m.m_configs.report?1:0),0)
},null,2));
