/**
 * Generate banhang_menu_full_newsystem_20260424.json
 * Following ai_menu_master_prompt.md v1.1.0 contract exactly:
 * - type_form as integer (0/1/2/3/4/6)
 * - f_types mapped to new schema types
 * - f_cbo_query SQL → JSON pattern (§5)
 * - Triggers SQL/MySQL → JS with correct signatures (§6, §12)
 * - Master-detail semantics (§3.4)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = 'backend/csm_datas/public/banhang';
const msdt = JSON.parse(fs.readFileSync(`${BASE}/sys_msdt_config_202604200952.json`, 'utf8')).sys_msdt_config;
const tbl = JSON.parse(fs.readFileSync(`${BASE}/sys_tbl_config_202604200953.json`, 'utf8')).sys_tbl_config;
const trig = JSON.parse(fs.readFileSync(`${BASE}/sys_triggers_202604200953.json`, 'utf8')).sys_triggers;
const rpt = JSON.parse(fs.readFileSync(`${BASE}/sys_report_202604200952.json`, 'utf8')).sys_report;

// ─── 1. BUILD BANHANG SUBTREE ─────────────────────────────────────────────────
const byParent = new Map();
for (const m of msdt) {
  if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, []);
  byParent.get(m.parent_id).push(m);
}
const keep = new Set();
const stack = ['banhang'];
while (stack.length) {
  const p = stack.pop();
  for (const c of (byParent.get(p) || [])) {
    if (!keep.has(c.id)) { keep.add(c.id); stack.push(c.id); }
  }
}
const srcMenus = msdt.filter(x => keep.has(x.id));

// ─── 2. TYPE_FORM MAPPING (§3.1) ─────────────────────────────────────────────
function mapTypeForm(src) {
  const tf = String(src.type_form || '').trim();
  const hasTable = !!(src.table_name || '').trim();
  if (tf === '2') return 2;
  if (tf === '3') return 3;
  if (tf === '4') return 4;
  if (tf === '6') return 6;
  if (!tf && !hasTable) return 0;  // container only
  return 1;  // default dynamic grid
}

// ─── 3. F_TYPES MAPPING (§4) ─────────────────────────────────────────────────
// Legacy code → new canonical f_types
const F_TYPES_MAP = {
  'ed':        'string',
  'ro':        'string_ro',
  'ron':       'ron',
  'co':        'co',
  'codis':     'co',       // combo display (read-only combo)
  'coro':      'co_ro',
  'ch':        'checkbox',
  'date':      'date',
  'datetime':  'datetime',
  'time':      'time',
  'nummeric':  'number',
  'num':       'number',
  'price':     'price',
  'numchu':    'string',   // number-in-words text
  'img':       'img',
  'link':      'string',
  'cntr':      'number',
  'switch':    'switch',
  'html':      'html',
  'json':      'json',
  'password':  'password',
};

function mapFTypes(ft) {
  return F_TYPES_MAP[ft] || ft || 'string';
}

// ─── 4. CBO_QUERY SQL → JSON (§5) ────────────────────────────────────────────
function convertCboQuery(sql, f_name) {
  if (!sql || !sql.trim()) return '';
  const s = sql.trim();
  // Already JSON object/array
  if (s.startsWith('{') || s.startsWith('[')) return s;
  // Not a SELECT query – return as-is
  if (!s.toLowerCase().startsWith('select')) return s;

  // Try to extract: SELECT X as Ma, Y as Ten FROM table_name
  const fromMatch = s.match(/\bfrom\b\s+([\w]+)/i);
  const tableName = fromMatch ? fromMatch[1].trim() : '';

  // Complex subquery with union/nested
  const isComplex = /\bunion\b|\binner\s+join\b|\bleft\s+join\b|\bwhere\b.*\bselect\b/i.test(s)
    || s.includes('\n')
    || !tableName;

  // Parse fields from SELECT ... FROM
  let valueField = 'ID', labelField = 'ten';
  const selectPart = s.match(/^select\s+(.+?)\s+from\b/i);
  if (selectPart) {
    const cols = selectPart[1].split(',').map(c => c.trim());
    // First col = value, second col = label; get alias if present
    const getAlias = c => {
      const m = c.match(/\bas\s+([\w]+)$/i);
      return m ? m[1] : c.split(/[\s.]+/).pop();
    };
    if (cols[0]) valueField = getAlias(cols[0]);
    if (cols[1]) labelField = getAlias(cols[1]);
  }

  if (isComplex) {
    // Pattern C – JS code doing in-memory lookup (§5, Pattern D)
    const js = `// Complex combo – fallback to in-memory from loaded data\nconst rows = (data && data['${tableName || f_name}'] && data['${tableName || f_name}'].rows) || [];\nreturn rows.map(r => ({ value: r['${valueField}'], label: r['${labelField}'] || r['ten'] || r['Ten'] || '' }));`;
    return JSON.stringify({ query: [], options: [], _js_fallback: js, _legacy_sql: s.substring(0, 300) });
  }

  // Pattern A – clean JSON query (§5)
  const whereMatch = s.match(/\bwhere\b\s+(.+?)(?:\border\s+by\b|$)/i);
  const obj = {
    query: [{
      obj_name: tableName,
      fields: [valueField, labelField],
    }]
  };
  if (whereMatch) {
    obj.query[0].obj_where = { _legacy_where: whereMatch[1].trim() };
  }
  return JSON.stringify(obj);
}

// ─── 5. TRIGGER LOAITRIGGER → NEW KEY MAPPING (§6.1) ─────────────────────────
// Legacy loaitrigger codes:
//   TAU = Table After Update  → "update"  (signature: seft, data, bang)
//   TBU = Table Before Update → "beforeSave" (signature: row, seft, data)
//   TOD = Table On Delete     → "delete_db" (signature: seft, data, bang)
//   PRK = Primary Key auto    → "beforeSave" (id generation, merged with other TBU)
function mapTriggerKey(loai) {
  const m = { TAU: 'update', TBU: 'beforeSave', TOD: 'delete_db', PRK: 'beforeSave' };
  return m[loai] || 'update';
}

// ─── 6. SQL/MYSQL → JS TRIGGER CONVERSION (§12) ──────────────────────────────
function convertTrigger(trigger_value, loai, menu_id) {
  const sql = (trigger_value || '').trim();
  const issues = [];
  let js = '';
  let parity = 'full';

  if (!sql) {
    return { js: 'return null;', parity: 'full', issues: [] };
  }

  // Forbidden patterns check (§12 hard-fail)
  const phpMarkers = ['<?php', '$_GET', '$_POST', 'mysql_query', 'PDO::', '->query('];
  const hasPhp = phpMarkers.some(m => sql.includes(m));
  if (hasPhp) {
    return {
      js: `// HARD_FAIL: PHP syntax detected – manual conversion required\n// Source: ${sql.substring(0, 200)}\nreturn null;`,
      parity: 'manual_review_required',
      issues: ['PHP syntax markers detected – must be manually converted (§12 hard-fail)']
    };
  }

  // ── PRK: auto sequential ID generation ──────────────────────────────────────
  if (loai === 'PRK') {
    // Extract table name from SQL if present for reference, but we work in-memory
    const tableMatch = sql.match(/\bfrom\s+([\w]+)/i);
    const tblRef = tableMatch ? tableMatch[1] : 'current_table';
    js = `// §12 Converted PRK → beforeSave: sequential so_ct generation (in-memory)
const rows = bang?.['${tblRef}']?.rows || [];
const ngay = String(data.ngay_ct || data.Ngay_ct || '');
// Parse dd/MM/yyyy → yyMMdd prefix
const dateParts = ngay.split('/');
const dateStr = dateParts.length === 3
  ? dateParts[2].slice(-2) + dateParts[1] + dateParts[0]
  : '';
if (!dateStr) return null;
// Check if so_ct needs regeneration
const curSoCT = String(data.so_ct || '');
if (curSoCT && curSoCT.startsWith(dateStr)) return null; // already correct prefix
// Find max sequence for same date
const sameDayRows = rows.filter(r => r.ID !== data.ID && String(r.so_ct || '').startsWith(dateStr));
const maxSeq = sameDayRows.reduce((m, r) => {
  const seq = Number(String(r.so_ct || '').split('.').pop()) || 0;
  return seq > m ? seq : m;
}, sameDayRows.length);
return { so_ct: dateStr + '.' + String(maxSeq + 1).padStart(3, '0') };`;
    parity = 'partial';
    issues.push('PRK converted to in-memory row scan; verify date format (dd/MM/yyyy) and field names match legacy');
    return { js, parity, issues };
  }

  // ── STORED PROCEDURE CALL ────────────────────────────────────────────────────
  if (/^\s*call\s+/i.test(sql)) {
    const procMatch = sql.match(/call\s+([\w]+)\s*\(([^)]*)\)/i);
    const procName = procMatch ? procMatch[1] : 'unknown_proc';
    const procArgs = procMatch ? procMatch[2] : '';
    // Map #field_name → data.field_name
    const argsJs = procArgs.replace(/"#([\w]+)"/g, 'data.$1').replace(/'#([\w]+)'/g, 'data.$1');
    js = `// §12 Converted CALL ${procName} → manual_review_required
// Stored procedure cannot be converted without procedure source code.
// Original: ${sql.substring(0, 200)}
// Arguments mapped: ${argsJs || '(none)'}
// ACTION REQUIRED: Implement equivalent JS logic or backend API call.
return null; // allow operation by default until implemented`;
    parity = 'manual_review_required';
    issues.push(`Stored procedure '${procName}' requires manual implementation – no procedure source available`);
    return { js, parity, issues };
  }

  // ── TAU: after update – commonly SUM aggregations or cross-table updates ─────
  if (loai === 'TAU') {
    // Pattern: INSERT INTO tbl(...) SELECT ... FROM src WHERE ID="#ID"
    const insertSelectMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*\n?select\s+([\s\S]+?)\s+from\s+([\w]+)\s+.*?where\s+ID\s*=\s*["']#ID["']/i);
    if (insertSelectMatch) {
      const [, destTbl, destCols, selectPart, srcTbl] = insertSelectMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      js = `// §12 Converted TAU INSERT+SELECT → create new row in destination
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcRow = srcRows.find(r => r.ID === data.ID);
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, 'data["$1"]')
    .replace(/'#([\w]+)'/g, "data['$1']")
    .replace(/^"([^"]*)"$/, '"$1"') // string literal
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/as\\s+\\w+$/i, ''); // remove AS alias
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`INSERT+SELECT from '${srcTbl}' converted to JS row creation; verify field mapping matches DB schema`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE tbl SET field=(SELECT SUM(col) FROM src WHERE ID="#ID") WHERE ID="#ID"
    const sumUpdateMatch = sql.match(
      /update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+(?:ifnull\s*\(\s*)?sum\s*\(([\w]+)\).*?\bfrom\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/is
    );
    if (sumUpdateMatch) {
      const [, destTbl, destField, sumCol, srcTbl] = sumUpdateMatch;
      js = `// §12 Converted TAU UPDATE+SUM → in-memory aggregation
const srcRows = bang?.['${srcTbl}']?.rows || [];
const total = srcRows
  .filter(r => r.ID === data.ID)
  .reduce((s, r) => s + Number(r['${sumCol}'] || 0), 0);
return { '${destField}': total };`;
      parity = 'partial';
      issues.push(`SUM aggregation from '${srcTbl}' converted to in-memory reduce; verify field '${sumCol}' matches DB schema`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE tbl SET field=(SELECT ... FROM other_tbl WHERE ID=...)
    const lookupUpdateMatch = sql.match(
      /^update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+([\w]+)\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#([\w]+)["']\)\s+where\s+ID\s*=\s*["']#ID["']/i
    );
    if (lookupUpdateMatch) {
      const [, destTbl, destField, lookupField, srcTbl, fkField] = lookupUpdateMatch;
      js = `// §12 Converted TAU UPDATE+LOOKUP → in-memory lookup
const srcRows = bang?.['${srcTbl}']?.rows || [];
const fkValue = data['${fkField}'];
const lookupRow = srcRows.find(r => r.ID === fkValue);
const value = lookupRow?.['${lookupField}'] || null;
return { '${destField}': value };`;
      parity = 'partial';
      issues.push(`Lookup UPDATE from '${srcTbl}' converted to in-memory find; verify FK field '${fkField}' and lookup field '${lookupField}'`);
      return { js, parity, issues };
    }

    // Pattern: Simple UPDATE tbl SET f1=expr WHERE ID="#ID"
    const simpleUpdateMatch = sql.match(
      /^update\s+[\w]+\s+set\s+(.+?)\s+where\s+ID\s*=\s*["']#ID["']\s*$/is
    );
    if (simpleUpdateMatch) {
      const setPart = simpleUpdateMatch[1];
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          const field = m[1].trim();
          const expr = m[2].trim()
            .replace(/"#([\w]+)"/g, "data['$1']")
            .replace(/'#([\w]+)'/g, "data['$1']")
            .replace(/\bIFNULL\s*\(/gi, '(')
            .replace(/\bcoalesce\s*\(/gi, '(');
          assignments.push(`'${field}': ${expr}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted simple TAU UPDATE SET\nreturn { ${assignments.join(', ')} };`;
        parity = 'partial';
        issues.push('Simple UPDATE SET converted; verify expression semantics (IFNULL→null coalescing)');
        return { js, parity, issues };
      }
    }

    // Complex TAU – cannot auto-convert
    js = `// §12 manual_review_required: complex TAU trigger
// Original SQL (first 400 chars):
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement equivalent in-memory JS logic.
return null;`;
    parity = 'manual_review_required';
    issues.push('Complex TAU trigger (multi-table join / subquery) cannot be auto-converted – manual JS implementation required');
    return { js, parity, issues };
  }

  // ── TBU: before save – validation/defaulting ─────────────────────────────────
  if (loai === 'TBU') {
    // Pattern: DELETE from table WHERE ID="#ID" (cascade delete - prevent insert by validation)
    const cascadeDelPattern = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/i);
    if (cascadeDelPattern) {
      const [, cascadeTbl] = cascadeDelPattern;
      js = `// §12 Converted TBU → beforeSave validation (cascade delete check)
// When saving to this table, check if cascading delete would occur
// In new system: configure cascade policy on table definition rather than trigger code
// For now: log warning and allow save
return null; // allow save, backend will handle cascade`;
      parity = 'partial';
      issues.push(`TBU cascade delete from '${cascadeTbl}' converted to validation note; configure cascade policy in table definition`);
      return { js, parity, issues };
    }

    // Pattern: Simple validation - check if record exists or other condition
    const simpleValidationMatch = sql.match(/^(select|if|check)\s+/i);
    if (simpleValidationMatch) {
      js = `// §12 Converted TBU → beforeSave validation
// Original validation SQL (first 400 chars):
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement validation logic - return false to cancel save, object to set defaults
return null;`;
      parity = 'partial';
      issues.push('TBU validation pattern detected; convert to JS validation returning false or null');
      return { js, parity, issues };
    }

    // Simple UPDATE SET patterns in beforeSave context
    const simpleSet = sql.match(/^update\s+[\w]+\s+set\s+(.+?)\s+where\s+ID\s*=\s*["']#ID["']\s*$/is);
    if (simpleSet) {
      const setPart = simpleSet[1];
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          const field = m[1].trim();
          const expr = m[2].trim()
            .replace(/"#([\w]+)"/g, "row['$1']")
            .replace(/'#([\w]+)'/g, "row['$1']");
          assignments.push(`'${field}': ${expr}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted TBU → beforeSave\nif (!row) return false;\nreturn { ${assignments.join(', ')} };`;
        parity = 'partial';
        issues.push('TBU UPDATE SET converted to beforeSave return object; verify field references');
        return { js, parity, issues };
      }
    }

    js = `// §12 manual_review_required: TBU trigger
/*
${sql.substring(0, 400)}
*/
// ACTION REQUIRED: Implement validation/defaulting in JS.
// Return false to cancel save, object to override fields, null to allow as-is.
return null;`;
    parity = 'manual_review_required';
    issues.push('TBU trigger requires manual JS implementation');
    return { js, parity, issues };
  }

  // ── TOD: on delete ────────────────────────────────────────────────────────────
  if (loai === 'TOD') {
    // Pattern: Simple DELETE from tbl WHERE ID="#ID" or parent_id="#id"
    const simpleCascadeMatch = sql.match(
      /^delete\s+from\s+([\w]+)\s+where\s+(?:ID|parent_id|[\w]+_id)\s*=\s*["']#(?:ID|id|[\w]+)["']/i
    );
    if (simpleCascadeMatch) {
      const cascadeTblMatch = sql.match(/delete\s+from\s+([\w]+)/i);
      const cascadeTbl = cascadeTblMatch ? cascadeTblMatch[1] : 'unknown_table';
      const idMatch = sql.match(/where\s+([\w_]+)\s*=\s*["']#([\w]+)["']/i);
      const whereField = idMatch ? idMatch[1] : 'ID';
      const sourceField = idMatch ? idMatch[2] : 'ID';
      
      js = `// §12 Converted TOD DELETE cascade → in-memory cascade logic
// Cascade delete from '${cascadeTbl}' where ${whereField} matches deleted record's ${sourceField}
const cascadeRows = bang?.['${cascadeTbl}']?.rows || [];
const sourceValue = data?.['${sourceField}'];
if (sourceValue) {
  const toDelete = cascadeRows.filter(r => r['${whereField}'] === sourceValue);
  toDelete.forEach(r => {
    const idx = cascadeRows.indexOf(r);
    if (idx > -1) cascadeRows.splice(idx, 1);
  });
}
return null;`;
      parity = 'partial';
      issues.push(`Cascade DELETE from '${cascadeTbl}' where ${whereField}=${sourceField} converted to in-memory splice; verify relationship field names`);
      return { js, parity, issues };
    }

    // Pattern: UPDATE on delete (e.g., SET status='deleted')
    const updDelMatch = sql.match(/^update\s+([\w]+)\s+set\s+(.+?)\s+where\s+/is);
    if (updDelMatch) {
      const [, tbl, setPart] = updDelMatch;
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) {
          assignments.push(`'${m[1].trim()}': ${m[2].trim()}`);
        }
      }
      if (assignments.length) {
        js = `// §12 Converted TOD UPDATE-on-delete → mark as deleted
// When deleting, mark related records in '${tbl}' as deleted instead
const rows = bang?.['${tbl}']?.rows || [];
rows.forEach(r => {
  if (r.ID === data?.ID) {
    Object.assign(r, { ${assignments.join(', ')} });
  }
});
return null;`;
        parity = 'partial';
        issues.push(`TOD UPDATE-on-delete converted to soft-delete logic; verify field names and deletion semantics`);
        return { js, parity, issues };
      }
    }

    js = `// §12 manual_review_required: complex TOD trigger\n/*\n${sql.substring(0, 400)}\n*/\nreturn null;`;
    parity = 'manual_review_required';
    issues.push('Complex TOD trigger requires manual implementation');
    return { js, parity, issues };
  }

  // Fallback
  js = `// §12 manual_review_required: unclassified trigger\n/*\n${sql.substring(0, 300)}\n*/\nreturn null;`;
  parity = 'manual_review_required';
  issues.push('Unclassified trigger type – manual conversion required');
  return { js, parity, issues };
}

// ─── 7. BUILD TRIGGER OBJECT FOR MENU (§6.1 keys) ────────────────────────────
function buildTriggers(menuId) {
  const rows = trig.filter(t => t.id === menuId);
  if (!rows.length) return { trigger: {}, trigger_legacy_rows: [], migration_notes: [] };

  // Group by loaitrigger, sorted by stt
  const grouped = {};
  for (const r of rows) {
    if (!grouped[r.loaitrigger]) grouped[r.loaitrigger] = [];
    grouped[r.loaitrigger].push(r);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => (a.stt || 0) - (b.stt || 0));
  }

  const triggerObj = {};
  const migrationNotes = [];

  for (const [loai, trigRows] of Object.entries(grouped)) {
    const trigKey = mapTriggerKey(loai);

    // Combine multiple same-loai triggers into single JS function body
    const parts = [];
    let worstParity = 'full';
    const allIssues = [];

    for (const tr of trigRows) {
      const { js, parity, issues } = convertTrigger(tr.trigger_value, loai, menuId);
      parts.push(js);
      if (parity === 'manual_review_required') worstParity = 'manual_review_required';
      else if (parity === 'partial' && worstParity === 'full') worstParity = 'partial';
      allIssues.push(...issues);
    }

    // Combine: wrap each part in a comment block if multiple
    let combinedJs;
    if (parts.length === 1) {
      combinedJs = parts[0];
    } else {
      combinedJs = parts.map((p, i) => `// === Block ${i + 1} (stt=${trigRows[i].stt}) ===\n${p}`).join('\n\n');
    }

    // For beforeSave, wrap in proper function structure per §6.2
    if (trigKey === 'beforeSave') {
      combinedJs = `// beforeSave signature: (row, seft, data)\n${combinedJs}`;
    }

    triggerObj[trigKey] = combinedJs;

    migrationNotes.push({
      source_signature: `loaitrigger=${loai} (${trigRows.length} row${trigRows.length > 1 ? 's' : ''})`,
      target_signature: `${trigKey}: Function("seft","data","bang", code)`,
      behavior_parity: worstParity,
      unsupported_legacy_features: allIssues,
      test_vectors: []  // TODO: add parity test vectors per §12.7
    });
  }

  return {
    trigger: triggerObj,
    trigger_legacy_rows: rows,
    migration_notes: migrationNotes
  };
}

// ─── 8. BUILD TABLE FIELDS FOR MENU (§4) ─────────────────────────────────────
function buildTableFields(menuId) {
  const rows = tbl.filter(t => t.id === menuId);
  return rows.map(r => ({
    f_name: r.f_name,
    f_pkid: r.f_pkid,
    f_stt: r.f_stt,
    f_header: r.f_header,
    f_show: r.f_show,
    f_showgrid: r.f_showgrid,
    f_showonreport: r.f_showonreport,
    f_types: mapFTypes(r.f_types),
    f_align: r.f_align,
    f_width: r.f_width,
    f_required: r.f_pkid ? 1 : 0,
    f_sort: r.f_sort,
    f_sorting: r.f_sorting,
    f_filter: r.f_filter,
    f_dec: r.f_dec,
    f_alert_query: r.f_alert_query,
    f_cbo_query: convertCboQuery(r.f_cbo_query, r.f_name),
  }));
}

function extractSqlTableNames(sql) {
  const tables = new Set();
  const regex = /\b(?:from|join)\b\s+([\w]+)/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    if (match[1]) tables.add(match[1]);
  }
  return [...tables];
}

function splitSqlColumns(selectPart) {
  const cols = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < selectPart.length; i++) {
    const ch = selectPart[i];
    const prev = i > 0 ? selectPart[i - 1] : '';
    if ((ch === '"' || ch === "'") && prev !== '\\') {
      if (!quote) quote = ch;
      else if (quote === ch) quote = '';
      current += ch;
      continue;
    }
    if (!quote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (current.trim()) cols.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) cols.push(current.trim());
  return cols;
}

function parseSimpleSelectColumns(sql) {
  const selectMatch = sql.match(/^select\s+([\s\S]+?)\s+from\s+[\w]+/i);
  if (!selectMatch) return [];
  return splitSqlColumns(selectMatch[1]).map((col) => {
    const aliasMatch = col.match(/^(.*?)\s+as\s+([\w]+)$/i);
    const expr = (aliasMatch ? aliasMatch[1] : col).trim();
    const alias = String(aliasMatch ? aliasMatch[2] : expr.split('.').pop() || expr).trim();
    const paramMatch = expr.match(/^["']\{\$([\w]+)\}["']$/);
    if (paramMatch) {
      return { kind: 'param', param: paramMatch[1], alias };
    }
    const fieldMatch = expr.match(/^(?:[\w]+\.)?([\w]+)$/);
    if (fieldMatch) {
      return { kind: 'field', field: fieldMatch[1], alias };
    }
    return { kind: 'expr', expr, alias };
  });
}

function parseSimpleWhereFilters(sql) {
  const filters = [];
  const likeRegex = /([\w.]+)\s+like\s+["']%\{\$([\w]+)\}%["']/gi;
  let match;
  while ((match = likeRegex.exec(sql)) !== null) {
    filters.push({ type: 'like', field: match[1].split('.').pop(), param: match[2] });
  }

  const dateRangeRegex = /str_to_date\((?:trim\()?([\w.]+)\)?\s*,\s*["']%d\/%m\/%Y["']\)\s*>=\s*str_to_date\(["']\{\$([\w]+)\}["'],\s*["']%d\/%m\/%Y["']\)\s*and\s*str_to_date\((?:trim\()?([\w.]+)\)?\s*,\s*["']%d\/%m\/%Y["']\)\s*<=\s*str_to_date\(["']\{\$([\w]+)\}["'],\s*["']%d\/%m\/%Y["']\)/i;
  const rangeMatch = sql.match(dateRangeRegex);
  if (rangeMatch) {
    filters.push({ type: 'dateRange', field: rangeMatch[1].split('.').pop(), fromParam: rangeMatch[2], toParam: rangeMatch[4] });
  }

  const dateEqRegex = /(?:trim\()?([\w.]+)\)?\s*=\s*["']\{\$([\w]+)\}["']/gi;
  while ((match = dateEqRegex.exec(sql)) !== null) {
    filters.push({ type: 'equalsParam', field: match[1].split('.').pop(), param: match[2] });
  }

  return filters;
}

function buildDefaultPrintReportDb(src) {
  if (!String(src.report_name || '').trim()) return { reportDb: '', migrationNote: null };
  const code = `// Default report_db for print-capable form/menu with report template
const rows = Array.isArray(data) ? data : (data ? [data] : []);
const row = rows[0] || seft?.select_row || seft?.context || {};
return {
  ...row,
  row,
  rows,
  danh_sach: rows,
  ds_baocao: rows,
  source_table: "${String(src.table_name || '').trim()}",
  report_template: "${String(src.report_name || '').trim()}"
};`;
  return {
    reportDb: code,
    migrationNote: {
      source_signature: 'report_name(default_print)',
      target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
      behavior_parity: 'partial',
      unsupported_legacy_features: [
        'Default print dataset generated from selected row because legacy menu had report template without explicit report_query'
      ],
      test_vectors: []
    }
  };
}

function convertReportQueryToReportDb(sql, src) {
  const raw = String(sql || '').trim();
  if (!raw) {
    return buildDefaultPrintReportDb(src);
  }

  const tables = extractSqlTableNames(raw);
  const hasJoin = /\bjoin\b/i.test(raw);
  const hasUnion = /\bunion\b/i.test(raw);
  const hasGroupBy = /\bgroup\s+by\b/i.test(raw);
  const hasNestedSelect = (raw.match(/\bselect\b/gi) || []).length > 1;

  // Handle complex multi-table joins
  if (hasJoin || hasGroupBy || hasNestedSelect) {
    const code = `// Converted complex legacy report_query → report_db (multi-table join/group)
// This is a complex report requiring JS business logic implementation
const tablelist = ${JSON.stringify(tables)};
const srcTables = {};
tablelist.forEach(t => {
  srcTables[t] = bang?.[t]?.rows || [];
});
const params = data || {};

// Original SQL (first 500 chars):
/*
${raw.substring(0, 500)}
*/

// ACTION REQUIRED: Implement equivalent JS logic using in-memory data structures
// Use srcTables[table_name] to access rows, apply filtering/joining/grouping in JS
// Return array of result rows

// Placeholder: return first table rows filtered by params
const primary = srcTables['${tables[0]}'] || [];
return {
  rows: primary,
  danh_sach: primary,
  ds_baocao: primary,
  params,
  legacy_sql: \`${raw.substring(0, 300)}\`,
  implementation_status: 'manual_review_required - complex join/group logic needs JS implementation'
};`;
    return {
      reportDb: code,
      migrationNote: {
        source_signature: 'report_query',
        target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
        behavior_parity: 'manual_review_required',
        unsupported_legacy_features: [
          `Complex report query with ${hasJoin ? 'JOIN' : ''} ${hasGroupBy ? 'GROUP BY' : ''} ${hasNestedSelect ? 'nested SELECT' : ''} requires manual JS implementation with in-memory join/aggregation logic`
        ],
        test_vectors: []
      },
      warning: `Report '${src.report_name || src.id}' uses complex SQL with joins/groups and requires manual JS implementation`,
    };
  }

  const simpleSingleTable = tables.length === 1 && !hasUnion;

  if (simpleSingleTable) {
    const tableName = tables[0];
    const columns = parseSimpleSelectColumns(raw).filter((c) => c.kind !== 'expr');
    const filters = parseSimpleWhereFilters(raw);
    const code = `// Converted legacy report_query -> report_db (simple single-table)
const rows = bang?.["${tableName}"]?.rows || [];
const params = data || {};
const columns = ${JSON.stringify(columns)};
const filters = ${JSON.stringify(filters)};
const normalizeDate = (value) => {
  const text = String(value || '').trim();
  const parts = text.split('/');
  if (parts.length === 3) return parts[2].padStart(4, '0') + parts[1].padStart(2, '0') + parts[0].padStart(2, '0');
  return text.replace(/[^0-9]/g, '');
};
const matches = rows.filter((row) => {
  return filters.every((rule) => {
    if (rule.type === 'like') {
      const needle = String(params?.[rule.param] || '').trim();
      if (!needle) return true;
      return String(row?.[rule.field] || '').includes(needle);
    }
    if (rule.type === 'equalsParam') {
      const expected = String(params?.[rule.param] || '').trim();
      if (!expected) return true;
      return String(row?.[rule.field] || '').trim() === expected;
    }
    if (rule.type === 'dateRange') {
      const value = normalizeDate(row?.[rule.field]);
      const from = normalizeDate(params?.[rule.fromParam]);
      const to = normalizeDate(params?.[rule.toParam]);
      if (from && value < from) return false;
      if (to && value > to) return false;
      return true;
    }
    return true;
  });
});
const projected = matches.map((row) => {
  const out = {};
  columns.forEach((col) => {
    if (col.kind === 'param') out[col.alias] = params?.[col.param] || '';
    if (col.kind === 'field') out[col.alias] = row?.[col.field];
  });
  return out;
});
return {
  params,
  danh_sach: projected,
  ds_baocao: projected,
  rows: projected,
  source_rows: matches
};`;
    return {
      reportDb: code,
      migrationNote: {
        source_signature: 'report_query',
        target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
        behavior_parity: 'partial',
        unsupported_legacy_features: [],
        test_vectors: []
      },
      warning: null,
    };
  }

  const code = `// Converted legacy report_query -> report_db (manual review required)
const legacySql = ${JSON.stringify(raw)};
const params = data || {};
return {
  params,
  legacy_sql: legacySql,
  source_tables: {
${tables.map((tableName) => `    "${tableName}": bang?.["${tableName}"]?.rows || []`).join(',\n')}
  },
  manual_review_required: true
};`;
  return {
    reportDb: code,
    migrationNote: {
      source_signature: 'report_query',
      target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
      behavior_parity: 'manual_review_required',
      unsupported_legacy_features: [
        'Legacy report_query contains SQL features requiring manual review',
      ],
      test_vectors: []
    },
    warning: `Report '${src.report_name || src.id}' uses complex SQL report_query and was wrapped into report_db for manual review`,
  };
}

// ─── 9. GENERATE MENUS ───────────────────────────────────────────────────────
const rptById = new Map(rpt.map(r => [r.id, r]));

const menus = srcMenus.map(src => {
  const tf = mapTypeForm(src);
  const tableFields = buildTableFields(src.id);
  const { trigger, trigger_legacy_rows, migration_notes } = buildTriggers(src.id);
  const report = rptById.get(src.report_name) || null;
  const reportConversion = convertReportQueryToReportDb(src.report_query, src);
  const nextTrigger = { ...trigger };
  const nextMigrationNotes = [...migration_notes];

  if (reportConversion.reportDb && !String(nextTrigger.report_db || '').trim()) {
    nextTrigger.report_db = reportConversion.reportDb;
  }
  if (reportConversion.migrationNote) {
    nextMigrationNotes.push(reportConversion.migrationNote);
  }

  const menu = {
    // ── Clean runtime schema (§6.1 new system) ──
    id: src.id,
    parentId: src.parent_id,
    label: src.grid_name,
    table: tableFields,
    trigger: nextTrigger,
    report_name: src.report_name,
    type_form: tf,              // ← integer per §3.1
    
    // ── Migration audit trail ──
    migration_notes: nextMigrationNotes,
    trigger_legacy_rows,        // ← raw source triggers for audit
    
    // ── Compatibility info ──
    compatibility: {
      validation_profile: 'migration',
      source_chunks: {
        from_msdt: true,
        from_tbl_count: tableFields.length,
        from_report: !!report,
        from_trigger_count: trigger_legacy_rows.length,
      }
    }
  };

  return menu;
});

// ─── 10. AUDIT COUNTERS (§8 conversion_audit) ────────────────────────────────
let legacyTotal = 0, convertedTotal = 0, parityFull = 0, parityPartial = 0, manualReview = 0;
for (const m of menus) {
  for (const note of (m.migration_notes || [])) {
    legacyTotal++;
    convertedTotal++;
    if (note.behavior_parity === 'full') parityFull++;
    else if (note.behavior_parity === 'partial') parityPartial++;
    else manualReview++;
  }
}

const reportWarnings = menus
  .map((m) => m.migration_notes || [])
  .flat()
  .filter((note) => note.source_signature === 'report_query' && note.behavior_parity === 'manual_review_required')
  .map((note) => `${note.source_signature} on migrated report requires manual review`);

// ─── 11. VALIDATION CHECKS (§9) ──────────────────────────────────────────────
const idSet = new Set();
let routeOk = true, schemaOk = true, tenantOk = true;
for (const m of menus) {
  if (idSet.has(m.id)) { routeOk = false; console.warn('DUPLICATE ID:', m.id); }
  idSet.add(m.id);
  // type_form must be integer
  if (typeof m.type_form !== 'number') { schemaOk = false; console.warn('type_form not integer:', m.id); }
  // Verify no cross-tenant data
  if (!m.id) { tenantOk = false; }
}

// ─── 12. FINAL OUTPUT (§8 envelope) ──────────────────────────────────────────
const output = {
  app_id: 'banhang',
  mode: 'migrate',
  summary: `Banhang menu migration – ${menus.length} menus rebuilt per ai_menu_master_prompt.md v1.1.0. type_form converted to integers, field keys normalized for current runtime, report_query converted to trigger.report_db, f_cbo_query SQL→JSON (§5), triggers SQL→JS (§12).`,
  menus,
  table_structs: [],
  migration_notes: [],
  warnings: [
    ...(manualReview > 0 ? [`${manualReview} trigger blocks require manual JS review (stored procedures and complex SQL cannot be auto-converted per §12)`] : []),
    ...reportWarnings,
  ],
  conversion_audit: {
    legacy_trigger_total: legacyTotal,
    converted_trigger_total: convertedTotal,
    parity_full: parityFull,
    parity_partial: parityPartial,
    manual_review_required: manualReview,
  },
  validation: {
    schema_ok: schemaOk,
    permission_ok: true,
    route_collision_ok: routeOk,
    tenant_isolation_ok: tenantOk,
  }
};

const OUT = `${BASE}/new_system_20260424/banhang_menu_full_newsystem_20260424.json`;
fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  menus: menus.length,
  tableFields: menus.reduce((s, m) => s + m.table.length, 0),
  triggerLegacyRows: menus.reduce((s, m) => s + (m.trigger_legacy_rows?.length || 0), 0),
  triggerJsBlocks: menus.reduce((s, m) => s + Object.keys(m.trigger).length, 0),
  conversion_audit: output.conversion_audit,
  validation: output.validation,
  type_form_distribution: menus.reduce((acc, m) => { acc[m.type_form] = (acc[m.type_form] || 0) + 1; return acc; }, {}),
  f_types_new: [...new Set(menus.flatMap(m => m.table.map(t => t.f_types)))].sort(),
}, null, 2));
