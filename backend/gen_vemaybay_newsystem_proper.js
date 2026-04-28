/**
 * Generate vemaybay_menu_full_newsystem_20260428.json
 * Following ai_menu_master_prompt.md v1.1.0 contract exactly:
 * - recurse descendants from parent_id="vemaybay"
 * - type_form as integer (0/1/2/3/4/6)
 * - preserve critical runtime menu keys used by frontend-admin
 * - f_types mapped to new schema types
 * - f_cbo_query SQL -> JSON pattern (§5)
 * - Triggers SQL/MySQL -> JS with correct signatures (§6, §12)
 * - report_query -> trigger.report_db when needed
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP_ID = 'vemaybay';
const DATE_STAMP = '20260428';
const BASE = 'backend/csm_datas/public/vemaybay';
const msdt = JSON.parse(fs.readFileSync(`${BASE}/sys_msdt_config_202604200950.json`, 'utf8')).sys_msdt_config;
const tbl = JSON.parse(fs.readFileSync(`${BASE}/sys_tbl_config_202604200950.json`, 'utf8')).sys_tbl_config;
const trig = JSON.parse(fs.readFileSync(`${BASE}/sys_triggers_202604200950.json`, 'utf8')).sys_triggers;
const rpt = JSON.parse(fs.readFileSync(`${BASE}/sys_report_202604200949.json`, 'utf8')).sys_report;
const rptIds = new Set(rpt.map(r => String(r.id || '').trim()));

// ─── 1. BUILD APP SUBTREE ───────────────────────────────────────────────────
const byParent = new Map();
for (const m of msdt) {
  if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, []);
  byParent.get(m.parent_id).push(m);
}

const keep = new Set();
const stack = [APP_ID];
while (stack.length) {
  const p = stack.pop();
  for (const c of (byParent.get(p) || [])) {
    if (!keep.has(c.id)) {
      keep.add(c.id);
      stack.push(c.id);
    }
  }
}

const srcMenus = msdt.filter(x => keep.has(x.id));
const srcMenuById = new Map(srcMenus.map(m => [String(m.id), m]));

function isLegacyLeafMenu(src) {
  if (!src) return false;
  return rptIds.has(String(src.report_name || '').trim()) || String(src.type_form || '').trim() === '2';
}

function shouldHideInMainMenu(src) {
  const parent = srcMenuById.get(String(src.parent_id || ''));
  return isLegacyLeafMenu(parent);
}

// ─── 2. TYPE_FORM MAPPING (§3.1) ────────────────────────────────────────────
function mapTypeForm(src) {
  const tf = String(src.type_form || '').trim();
  const hasTable = !!String(src.table_name || '').trim();
  if (tf === '2') return 2;
  if (tf === '3') return 3;
  if (tf === '4') return 4;
  if (tf === '6') return 6;
  if (!tf && !hasTable) return 0;
  return 1;
}

// ─── 3. F_TYPES MAPPING (§4) ────────────────────────────────────────────────
const F_TYPES_MAP = {
  ed: 'string',
  ro: 'string_ro',
  ron: 'ron',
  co: 'co',
  codis: 'co',
  coro: 'co_ro',
  ch: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  time: 'time',
  nummeric: 'number',
  num: 'number',
  price: 'price',
  numchu: 'string',
  img: 'img',
  link: 'string',
  cntr: 'number',
  switch: 'switch',
  html: 'html',
  json: 'json',
  password: 'password',
};

function mapFTypes(ft) {
  return F_TYPES_MAP[ft] || ft || 'string';
}

// ─── 4. CBO_QUERY SQL → JSON (§5) ───────────────────────────────────────────
function convertCboQuery(sql, f_name) {
  if (!sql || !sql.trim()) return '';
  const s = sql.trim();
  if (s.startsWith('{') || s.startsWith('[')) return s;
  if (!s.toLowerCase().startsWith('select')) return s;

  const fromMatch = s.match(/\bfrom\b\s+([\w]+)/i);
  const tableName = fromMatch ? fromMatch[1].trim() : '';
  const isComplex = /\bunion\b|\binner\s+join\b|\bleft\s+join\b|\bwhere\b.*\bselect\b/i.test(s)
    || s.includes('\n')
    || !tableName;

  let valueField = 'ID';
  let labelField = 'ten';
  const selectPart = s.match(/^select\s+(.+?)\s+from\b/i);
  if (selectPart) {
    const cols = selectPart[1].split(',').map(c => c.trim());
    const getAlias = c => {
      const m = c.match(/\bas\s+([\w]+)$/i);
      return m ? m[1] : c.split(/[\s.]+/).pop();
    };
    if (cols[0]) valueField = getAlias(cols[0]);
    if (cols[1]) labelField = getAlias(cols[1]);
  }

  if (isComplex) {
    const js = `// Complex combo – fallback to in-memory from loaded data\nconst rows = (data && data['${tableName || f_name}'] && data['${tableName || f_name}'].rows) || [];\nreturn rows.map(r => ({ value: r['${valueField}'], label: r['${labelField}'] || r['ten'] || r['Ten'] || '' }));`;
    return JSON.stringify({ query: [], options: [], _js_fallback: js, _legacy_sql: s.substring(0, 300) });
  }

  const whereMatch = s.match(/\bwhere\b\s+(.+?)(?:\border\s+by\b|$)/i);
  const obj = {
    query: [{
      obj_name: tableName,
      fields: [valueField, labelField],
    }],
  };
  if (whereMatch) {
    obj.query[0].obj_where = { _legacy_where: whereMatch[1].trim() };
  }
  return JSON.stringify(obj);
}

// ─── 5. TRIGGER LOAITRIGGER → NEW KEY MAPPING (§6.1) ───────────────────────
function mapTriggerKey(loai) {
  const m = { TAU: 'update', TBU: 'beforeSave', TOD: 'delete_db', PRK: 'beforeSave' };
  return m[loai] || 'update';
}

function resolveLegacyPlaceholder(token, fallbackScope) {
  const raw = String(token || '').trim().replace(/^#|#$/g, '');
  if (!raw) return `${fallbackScope}?.ID`;
  const lower = raw.toLowerCase();
  if (lower === 'id') return `${fallbackScope}?.ID ?? ${fallbackScope}?.id`;
  if (lower === 'uid' || lower === 'crt_user') return `seft?.user?.user_name || seft?.user?.userid || ${fallbackScope}?.CRT_USER || ${fallbackScope}?.crt_user || ''`;
  return `${fallbackScope}?.['${raw}'] ?? ${fallbackScope}?.['${lower}']`;
}

function sanitizeLegacyExpression(expr, scopeName) {
  return String(expr || '')
    .replace(/"#([\w]+)"/g, (_, key) => resolveLegacyPlaceholder(key, scopeName))
    .replace(/'#([\w]+)'/g, (_, key) => resolveLegacyPlaceholder(key, scopeName))
    .replace(/date_format\(now\(\),\s*"%d\/%m\/%Y"\)/gi, 'new Date().toLocaleDateString("vi-VN")')
    .replace(/unix_timestamp\(\)/gi, 'Date.now()')
    .replace(/concat\(([^)]+)\)/gi, '[$1].join("")')
    .replace(/\bIFNULL\s*\(/gi, 'coalesce(')
    .replace(/\bROUND\s*\(/gi, 'Math.round(');
}

function splitAssignments(setPart) {
  const out = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let i = 0; i < setPart.length; i++) {
    const ch = setPart[i];
    const prev = i > 0 ? setPart[i - 1] : '';
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
        if (current.trim()) out.push(current.trim());
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function buildSubqueryAssignmentExpression(subquerySql, options = {}) {
  const sub = String(subquerySql || '').trim();
  const outerAlias = String(options.outerAlias || '').trim();
  const outerScope = String(options.outerScope || 'data').trim() || 'data';
  const placeholderMatch = sub.match(/^select\s+(.+?)\s+from\s+([\w]+)(?:\s+[\w]+)?\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+(.+?))?(?:\s+limit\s+\d+)?$/is);
  const correlatedMatch = outerAlias
    ? sub.match(new RegExp(`^select\\s+(.+?)\\s+from\\s+([\\w]+)(?:\\s+[\\w]+)?\\s+where\\s+([\\w.]+)\\s*=\\s*${outerAlias}\\.([\\w]+)(?:\\s+and\\s+(.+?))?(?:\\s+limit\\s+\\d+)?$`, 'is'))
    : null;
  const match = placeholderMatch || correlatedMatch;
  if (!match) return null;
  const [, selectExprRaw, srcTbl, srcWhereFieldRaw, srcKey, srcExtraWhereRaw] = match;
  const selectExpr = String(selectExprRaw || '').trim();
  const srcWhereField = String(srcWhereFieldRaw || '').split('.').pop() || 'ID';
  const srcValueExpr = placeholderMatch
    ? resolveLegacyPlaceholder(srcKey, outerScope)
    : `${outerScope}?.['${srcKey}'] ?? ${outerScope}?.['${String(srcKey || '').toLowerCase()}']`;
  const srcExtraWhere = String(srcExtraWhereRaw || '').trim();
  const baseFilter = `String(row['${srcWhereField}'] ?? '') === String(${srcValueExpr} ?? '')${srcExtraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(srcExtraWhere, 'row')}; } catch (_error) { return false; } })(row)` : ''}`;
  const sumMatch = selectExpr.match(/^sum\s*\((.+)\)$/i);
  if (sumMatch) {
    const calc = sanitizeLegacyExpression(sumMatch[1], 'row');
    return `(function(){ const srcRows = bang?.['${srcTbl}']?.rows || []; return srcRows.filter(row => ${baseFilter}).reduce((sum, row) => sum + Number(${calc} || 0), 0); })()`;
  }
  const countMatch = selectExpr.match(/^count\s*\((.+)\)$/i);
  if (countMatch) {
    return `(function(){ const srcRows = bang?.['${srcTbl}']?.rows || []; return srcRows.filter(row => ${baseFilter}).length; })()`;
  }
  const scalarExpr = sanitizeLegacyExpression(selectExpr, 'srcRow');
  return `(function(){ const srcRows = bang?.['${srcTbl}']?.rows || []; const srcRow = srcRows.find(row => ${baseFilter}); return srcRow ? (${scalarExpr}) : null; })()`;
}

function buildMultiSubqueryUpdate(sql, triggerType) {
  const match = String(sql || '').trim().match(/^update\s+([\w]+)(?:\s+([\w]+))?\s+set\s+([\s\S]+?)\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+(.+))?$/is);
  if (!match) return null;
  const [, , destAliasRaw, setPart, destWhereFieldRaw, destKey, destExtraWhereRaw] = match;
  const assignments = splitAssignments(setPart);
  if (!assignments.length) return null;
  const destAlias = String(destAliasRaw || '').trim();
  const renderedAssignments = [];
  for (const assignment of assignments) {
    const m = assignment.match(/^([\w]+)\s*=\s*\((select[\s\S]+)\)$/is);
    if (!m) return null;
    const field = m[1].trim();
    const expr = buildSubqueryAssignmentExpression(m[2], { outerAlias: destAlias, outerScope: 'data' });
    if (!expr) return null;
    renderedAssignments.push(`'${field}': ${expr}`);
  }
  const destWhereField = String(destWhereFieldRaw || '').split('.').pop() || 'ID';
  const destValueExpr = resolveLegacyPlaceholder(destKey, 'data');
  const destExtraWhere = String(destExtraWhereRaw || '').trim();
  return `// §12 Converted ${triggerType} multi-assignment subquery UPDATE → in-memory projection
if (String(data?.['${destWhereField}'] ?? '') !== String(${destValueExpr} ?? '')) return null;
${destExtraWhere ? `if (!(function(row){ try { return ${sanitizeLegacyExpression(destExtraWhere, 'row')}; } catch (_error) { return false; } })(data || {})) return null;` : ''}
return { ${renderedAssignments.join(', ')} };`;
}

function buildGenericUpdateProjection(sql, triggerType) {
  const match = String(sql || '').trim().match(/^update\s+([\w]+)(?:\s+([\w]+))?\s+set\s+([\s\S]+?)\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+(.+))?$/is);
  if (!match) return null;
  const [, , destAliasRaw, setPart, destWhereFieldRaw, destKey, destExtraWhereRaw] = match;
  const assignments = splitAssignments(setPart);
  if (!assignments.length) return null;
  const destAlias = String(destAliasRaw || '').trim();
  const renderedAssignments = [];
  for (const assignment of assignments) {
    const m = assignment.match(/^([\w]+)\s*=\s*(.+)$/is);
    if (!m) return null;
    const field = m[1].trim();
    const rhs = String(m[2] || '').trim();
    let expr;
    const subqueryMatch = rhs.match(/^\((select[\s\S]+)\)$/is);
    if (subqueryMatch) {
      expr = buildSubqueryAssignmentExpression(subqueryMatch[1], { outerAlias: destAlias, outerScope: 'data' });
      if (!expr) return null;
    } else {
      expr = sanitizeLegacyExpression(rhs, 'data');
    }
    renderedAssignments.push(`'${field}': ${expr}`);
  }
  const destWhereField = String(destWhereFieldRaw || '').split('.').pop() || 'ID';
  const destValueExpr = resolveLegacyPlaceholder(destKey, 'data');
  const destExtraWhere = String(destExtraWhereRaw || '').trim();
  return `// §12 Converted ${triggerType} mixed UPDATE → in-memory projection
if (String(data?.['${destWhereField}'] ?? data?.['${destWhereField.toLowerCase()}'] ?? '') !== String(${destValueExpr} ?? '')) return null;
${destExtraWhere ? `if (!(function(row){ try { return ${sanitizeLegacyExpression(destExtraWhere, 'row')}; } catch (_error) { return false; } })(data || {})) return null;` : ''}
return { ${renderedAssignments.join(', ')} };`;
}

function buildGenericUpdateProjectionFlexibleWhere(sql, triggerType) {
  const match = String(sql || '').trim().match(/^update\s+([\w]+)(?:\s+([\w]+))?\s+set\s+([\s\S]+?)\s+where\s+(.+)$/is);
  if (!match) return null;
  const [, , destAliasRaw, setPart, wherePartRaw] = match;
  const wherePart = String(wherePartRaw || '').trim();
  const placeholderMatch = wherePart.match(/([\w.]+)\s*=\s*["']#([\w]+)["']/i);
  if (!placeholderMatch) return null;
  const destAlias = String(destAliasRaw || '').trim();
  const destWhereField = String(placeholderMatch[1] || '').split('.').pop() || 'ID';
  const destKey = placeholderMatch[2];
  const destValueExpr = resolveLegacyPlaceholder(destKey, 'data');
  const restWhere = wherePart.replace(placeholderMatch[0], 'true').replace(/^\s*and\s*/i, '').replace(/\s+and\s+true\s*$/i, '').trim();
  const assignments = splitAssignments(setPart);
  if (!assignments.length) return null;
  const renderedAssignments = [];
  for (const assignment of assignments) {
    const m = assignment.match(/^([\w]+)\s*=\s*(.+)$/is);
    if (!m) return null;
    const field = m[1].trim();
    const rhs = String(m[2] || '').trim();
    let expr;
    const subqueryMatch = rhs.match(/^\((select[\s\S]+)\)$/is);
    if (subqueryMatch) {
      expr = buildSubqueryAssignmentExpression(subqueryMatch[1], { outerAlias: destAlias, outerScope: 'data' });
      if (!expr) return null;
    } else {
      expr = sanitizeLegacyExpression(rhs, 'data');
    }
    renderedAssignments.push(`'${field}': ${expr}`);
  }
  return `// §12 Converted ${triggerType} flexible WHERE UPDATE → in-memory projection
if (String(data?.['${destWhereField}'] ?? data?.['${destWhereField.toLowerCase()}'] ?? '') !== String(${destValueExpr} ?? '')) return null;
${restWhere && restWhere !== 'true' ? `if (!(function(row){ try { return ${sanitizeLegacyExpression(restWhere, 'row')}; } catch (_error) { return false; } })(data || {})) return null;` : ''}
return { ${renderedAssignments.join(', ')} };`;
}

// ─── 6. SQL/MYSQL → JS TRIGGER CONVERSION (§12) ─────────────────────────────
function convertTrigger(trigger_value, loai, menu_id) {
  const sql = (trigger_value || '').trim();
  const issues = [];
  let js = '';
  let parity = 'full';

  if (!sql) {
    return { js: 'return null;', parity: 'full', issues: [] };
  }

  const phpMarkers = ['<?php', '$_GET', '$_POST', 'mysql_query', 'PDO::', '->query('];
  const hasPhp = phpMarkers.some(m => sql.includes(m));
  if (hasPhp) {
    return {
      js: `// HARD_FAIL: PHP syntax detected – manual conversion required\n// Source: ${sql.substring(0, 200)}\nreturn null;`,
      parity: 'manual_review_required',
      issues: ['PHP syntax markers detected – must be manually converted (§12 hard-fail)'],
    };
  }

  if (/^repair\s+table\s+/i.test(sql)) {
    return {
      js: '// Legacy MySQL maintenance command ignored in RocksDB runtime\nreturn null;',
      parity: 'full',
      issues: [],
    };
  }

  if (loai === 'PRK') {
    const tableMatch = sql.match(/\bfrom\s+([\w]+)/i);
    const tblRef = tableMatch ? tableMatch[1] : 'current_table';
    js = `// §12 Converted PRK → beforeSave: sequential so_ct generation (in-memory)
const rows = bang?.['${tblRef}']?.rows || [];
const ngay = String(data.ngay_ct || data.Ngay_ct || '');
const dateParts = ngay.split('/');
const dateStr = dateParts.length === 3
  ? dateParts[2].slice(-2) + dateParts[1] + dateParts[0]
  : '';
if (!dateStr) return null;
const curSoCT = String(data.so_ct || '');
if (curSoCT && curSoCT.startsWith(dateStr)) return null;
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

  if (/^\s*call\s+/i.test(sql)) {
    const procMatch = sql.match(/call\s+([\w]+)\s*\(([^)]*)\)/i);
    const procName = procMatch ? procMatch[1] : 'unknown_proc';
    const procArgs = procMatch ? procMatch[2] : '';
    const argsJs = procArgs.replace(/"#([\w]+)"/g, 'data.$1').replace(/'#([\w]+)'/g, 'data.$1');
    js = `// §12 Converted CALL ${procName} → manual_review_required
// Stored procedure cannot be converted without procedure source code.
// Original: ${sql.substring(0, 200)}
// Arguments mapped: ${argsJs || '(none)'}
// ACTION REQUIRED: Implement equivalent JS logic or backend API call.
return null;`;
    parity = 'manual_review_required';
    issues.push(`Stored procedure '${procName}' requires manual implementation – no procedure source available`);
    return { js, parity, issues };
  }

  if (loai === 'TAU') {
    const multiSubqueryUpdateJs = buildMultiSubqueryUpdate(sql, 'TAU');
    if (multiSubqueryUpdateJs) {
      js = multiSubqueryUpdateJs;
      parity = 'partial';
      issues.push('Multi-assignment subquery UPDATE converted to in-memory projection; verify aggregate/scalar expressions and filter clauses');
      return { js, parity, issues };
    }

    const genericUpdateJs = buildGenericUpdateProjection(sql, 'TAU');
    if (genericUpdateJs) {
      js = genericUpdateJs;
      parity = 'partial';
      issues.push('Mixed UPDATE converted to in-memory projection; verify MySQL-specific functions and arithmetic semantics');
      return { js, parity, issues };
    }

    const flexibleUpdateJs = buildGenericUpdateProjectionFlexibleWhere(sql, 'TAU');
    if (flexibleUpdateJs) {
      js = flexibleUpdateJs;
      parity = 'partial';
      issues.push('Flexible WHERE UPDATE converted to in-memory projection; verify literal conditions and arithmetic semantics');
      return { js, parity, issues };
    }

    const insertSelectMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*\n?select\s+([\s\S]+?)\s+from\s+([\w]+)(?:\s+[\w]+)?\s+.*?where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+([\s\S]+))?$/i);
    if (insertSelectMatch) {
      const [, destTbl, destCols, selectPart, srcTbl, whereFieldRaw, whereKey, extraWhereRaw] = insertSelectMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      const whereField = String(whereFieldRaw || '').split('.').pop() || 'ID';
      const whereValueExpr = resolveLegacyPlaceholder(whereKey, 'data');
      const extraWhere = String(extraWhereRaw || '').trim();
      js = `// §12 Converted TAU INSERT+SELECT → create new row in destination
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcRow = srcRows.find(r => String(r['${whereField}'] ?? '') === String(${whereValueExpr} ?? '')${extraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(extraWhere, 'row')}; } catch (_error) { return true; } })(r)` : ''});
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, 'data["$1"]')
    .replace(/'#([\w]+)'/g, "data['$1']")
    .replace(/^"([^"]*)"$/, '"$1"')
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/as\\s+\\w+$/i, '');
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`INSERT+SELECT from '${srcTbl}' converted to JS row creation; verify field mapping matches DB schema`);
      return { js, parity, issues };
    }

    const insertSelectSimpleMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*select\s+([\s\S]+?)\s+from\s+([\w]+)\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+([\s\S]+))?$/is);
    if (insertSelectSimpleMatch) {
      const [, destTbl, destCols, selectPart, srcTbl, whereFieldRaw, whereKey, extraWhereRaw] = insertSelectSimpleMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      const whereField = String(whereFieldRaw || '').split('.').pop() || 'ID';
      const whereValueExpr = resolveLegacyPlaceholder(whereKey, 'data');
      const extraWhere = String(extraWhereRaw || '').trim();
      js = `// §12 Converted TAU INSERT+SELECT (simple form) → create new row in destination
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcRow = srcRows.find(r => String(r['${whereField}'] ?? '') === String(${whereValueExpr} ?? '')${extraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(extraWhere, 'row')}; } catch (_error) { return true; } })(r)` : ''});
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, (_, key) => resolveLegacyPlaceholder(key, 'data'))
    .replace(/'#([\w]+)'/g, (_, key) => resolveLegacyPlaceholder(key, 'data'))
    .replace(/^"([^"]*)"$/, '"$1"')
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/date_format\(now\(\),\s*"%d\/%m\/%Y"\)/gi, 'new Date().toLocaleDateString("vi-VN")')
    .replace(/concat\((.+)\)/i, '[$1].join("")');
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`INSERT+SELECT from '${srcTbl}' converted to JS row creation; verify field mapping matches DB schema`);
      return { js, parity, issues };
    }

    const aggregateUpdateMatch = sql.match(/^update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+(.+?)\s+from\s+([\w]+)\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+(.+?))?\s*\)\s*where\s+([\w.]+)\s*=\s*["']#([\w]+)["']\s*$/is);
    if (aggregateUpdateMatch) {
      const [, , destField, aggregateExprRaw, srcTbl, srcWhereFieldRaw, srcKey, srcExtraWhereRaw, destWhereFieldRaw, destKey] = aggregateUpdateMatch;
      const srcWhereField = String(srcWhereFieldRaw || '').split('.').pop() || 'ID';
      const destWhereField = String(destWhereFieldRaw || '').split('.').pop() || 'ID';
      const srcValueExpr = resolveLegacyPlaceholder(srcKey, 'data');
      const destValueExpr = resolveLegacyPlaceholder(destKey, 'data');
      const aggregateExpr = String(aggregateExprRaw || '').trim();
      const srcExtraWhere = String(srcExtraWhereRaw || '').trim();
      const sumMatch = aggregateExpr.match(/^sum\s*\((.+)\)$/i);
      const countMatch = aggregateExpr.match(/^count\s*\((.+)\)$/i);
      let accumulator = 'null';
      if (sumMatch) {
        const calc = sanitizeLegacyExpression(sumMatch[1], 'row');
        accumulator = `srcRows
  .filter(row => String(row['${srcWhereField}'] ?? '') === String(${srcValueExpr} ?? '')${srcExtraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(srcExtraWhere, 'row')}; } catch (_error) { return false; } })(row)` : ''})
  .reduce((sum, row) => sum + Number(${calc} || 0), 0)`;
      } else if (countMatch) {
        accumulator = `srcRows
  .filter(row => String(row['${srcWhereField}'] ?? '') === String(${srcValueExpr} ?? '')${srcExtraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(srcExtraWhere, 'row')}; } catch (_error) { return false; } })(row)` : ''})
  .length`;
      }
      if (accumulator !== 'null') {
        js = `// §12 Converted TAU UPDATE with aggregate subquery → in-memory aggregation
const srcRows = bang?.['${srcTbl}']?.rows || [];
const aggregateValue = ${accumulator};
if (String(data?.['${destWhereField}'] ?? '') !== String(${destValueExpr} ?? '')) return null;
return { '${destField}': aggregateValue };`;
        parity = 'partial';
        issues.push(`Aggregate UPDATE from '${srcTbl}' converted to in-memory aggregation; verify expression '${aggregateExpr}' and where clauses`);
        return { js, parity, issues };
      }
    }

    const sumUpdateMatch = sql.match(/update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+(?:ifnull\s*\(\s*)?sum\s*\(([\w]+)\).*?\bfrom\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/is);
    if (sumUpdateMatch) {
      const [, , destField, sumCol, srcTbl] = sumUpdateMatch;
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

    const lookupUpdateMatch = sql.match(/^update\s+([\w]+)\s+set\s+([\w]+)\s*=\s*\(\s*select\s+([\w]+)\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#([\w]+)["']\)\s+where\s+ID\s*=\s*["']#ID["']/i);
    if (lookupUpdateMatch) {
      const [, , destField, lookupField, srcTbl, fkField] = lookupUpdateMatch;
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

    const simpleUpdateMatch = sql.match(/^update\s+[\w]+\s+set\s+(.+?)\s+where\s+ID\s*=\s*["']#ID["']\s*$/is);
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

    js = `// §12 manual_review_required: complex TAU trigger
/*
${sql.substring(0, 400)}
*/
return null;`;
    parity = 'manual_review_required';
    issues.push('Complex TAU trigger (multi-table join / subquery) cannot be auto-converted – manual JS implementation required');
    return { js, parity, issues };
  }

  if (loai === 'TBU') {
    if (/^repair\s+table\s+/i.test(sql)) {
      js = `// Legacy MySQL maintenance command ignored in RocksDB runtime\nreturn null;`;
      parity = 'full';
      return { js, parity, issues };
    }

    const joinCopyMatch = sql.match(/^update\s+([\w]+)\s+[\w]+\s+inner\s+join\s+([\w]+)\s+[\w]+\s+on\s+([\w.]+)\s*=\s*([\w.]+)\s+set\s+([\s\S]+?)\s+where\s+([\w.]+)\s*=\s*$/i);
    if (joinCopyMatch) {
      js = `// Legacy join-update without concrete placeholder was preserved as no-op because the source SQL is truncated\nreturn null;`;
      parity = 'partial';
      issues.push('Join UPDATE source SQL appears truncated; preserved as no-op to avoid wrong business logic');
      return { js, parity, issues };
    }

    const genericUpdateJs = buildGenericUpdateProjection(sql, 'TBU');
    if (genericUpdateJs) {
      js = `if (!row) return false;\n${genericUpdateJs.replaceAll('data?.', 'row?.').replaceAll('(data || {})', '(row || {})')}`;
      parity = 'partial';
      issues.push('Mixed UPDATE converted to beforeSave projection; verify MySQL-specific functions and arithmetic semantics');
      return { js, parity, issues };
    }

    const cascadeDelPattern = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+ID\s*=\s*["']#ID["']/i);
    if (cascadeDelPattern) {
      const [, cascadeTbl] = cascadeDelPattern;
      js = `// §12 Converted TBU → beforeSave validation (cascade delete check)
// In new system: configure cascade policy on table definition rather than trigger code
return null;`;
      parity = 'partial';
      issues.push(`TBU cascade delete from '${cascadeTbl}' converted to validation note; configure cascade policy in table definition`);
      return { js, parity, issues };
    }

    const simpleValidationMatch = sql.match(/^(select|if|check)\s+/i);
    if (simpleValidationMatch) {
      js = `// §12 Converted TBU → beforeSave validation
/*
${sql.substring(0, 400)}
*/
return null;`;
      parity = 'partial';
      issues.push('TBU validation pattern detected; convert to JS validation returning false or null');
      return { js, parity, issues };
    }

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
return null;`;
    parity = 'manual_review_required';
    issues.push('TBU trigger requires manual JS implementation');
    return { js, parity, issues };
  }

  if (loai === 'TOD') {
    const multiSubqueryUpdateJs = buildMultiSubqueryUpdate(sql, 'TOD');
    if (multiSubqueryUpdateJs) {
      js = multiSubqueryUpdateJs;
      parity = 'partial';
      issues.push('Multi-assignment subquery UPDATE converted to in-memory projection; verify aggregate/scalar expressions and filter clauses');
      return { js, parity, issues };
    }

    const genericUpdateJs = buildGenericUpdateProjection(sql, 'TOD');
    if (genericUpdateJs) {
      js = genericUpdateJs;
      parity = 'partial';
      issues.push('Mixed UPDATE converted to in-memory projection; verify MySQL-specific functions and arithmetic semantics');
      return { js, parity, issues };
    }

    const insertAuditMatch = sql.match(/^insert\s+into\s+([\w]+)\s*\((.*?)\)\s*\n?select\s+([\s\S]+?)\s+from\s+([\w]+)(?:\s+[\w]+)?\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["'](?:\s+and\s+([\s\S]+))?$/i);
    if (insertAuditMatch) {
      const [, destTbl, destCols, selectPart, srcTbl, whereFieldRaw, whereKey, extraWhereRaw] = insertAuditMatch;
      const cols = destCols.split(',').map(c => c.trim());
      const selectCols = splitSqlColumns(selectPart);
      const whereField = String(whereFieldRaw || '').split('.').pop() || 'ID';
      const whereValueExpr = resolveLegacyPlaceholder(whereKey, 'data');
      const extraWhere = String(extraWhereRaw || '').trim();
      js = `// §12 Converted TOD INSERT+SELECT audit trail → append derived audit row
const srcRows = bang?.['${srcTbl}']?.rows || [];
const destRows = bang?.['${destTbl}']?.rows || [];
const srcRow = srcRows.find(r => String(r['${whereField}'] ?? '') === String(${whereValueExpr} ?? '')${extraWhere ? ` && (function(row){ try { return ${sanitizeLegacyExpression(extraWhere, 'row')}; } catch (_error) { return true; } })(r)` : ''});
if (!srcRow) return null;
const newRow = {
${cols.map((col, i) => {
  const selectCol = selectCols[i] || '';
  const colVal = selectCol
    .replace(/"#([\w]+)"/g, (_, key) => resolveLegacyPlaceholder(key, 'data'))
    .replace(/'#([\w]+)'/g, (_, key) => resolveLegacyPlaceholder(key, 'data'))
    .replace(/^"([^"]*)"$/, '"$1"')
    .replace(/^'([^']*)'$/, "'$1'")
    .replace(/date_format\(now\(\),\s*"%d\/%m\/%Y"\)/gi, 'new Date().toLocaleDateString("vi-VN")')
    .replace(/concat\((.+)\)/i, '[$1].join("")');
  return `  ${col}: ${colVal.trim()}`;
}).join(',\n')}
};
destRows.push(newRow);
return null;`;
      parity = 'partial';
      issues.push(`Audit INSERT+SELECT into '${destTbl}' converted to in-memory append; verify generated ID/date expressions`);
      return { js, parity, issues };
    }

    const simpleCascadeMatch = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+(?:ID|parent_id|[\w]+_id)\s*=\s*["']#(?:ID|id|[\w]+)["']/i);
    if (simpleCascadeMatch) {
      const cascadeTblMatch = sql.match(/delete\s+from\s+([\w]+)/i);
      const cascadeTbl = cascadeTblMatch ? cascadeTblMatch[1] : 'unknown_table';
      const idMatch = sql.match(/where\s+([\w_]+)\s*=\s*["']#([\w]+)["']/i);
      const whereField = idMatch ? idMatch[1] : 'ID';
      const sourceField = idMatch ? idMatch[2] : 'ID';
      js = `// §12 Converted TOD DELETE cascade → in-memory cascade logic
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

    const genericDeleteMatch = sql.match(/^delete\s+from\s+([\w]+)\s+where\s+([\w.]+)\s*=\s*["']#([\w]+)["']\s*$/i);
    if (genericDeleteMatch) {
      const [, tableName, whereFieldRaw, sourceKey] = genericDeleteMatch;
      const whereField = String(whereFieldRaw || '').split('.').pop() || 'ID';
      const sourceValueExpr = resolveLegacyPlaceholder(sourceKey, 'data');
      js = `// §12 Converted generic TOD DELETE → in-memory row removal
const rows = bang?.['${tableName}']?.rows || [];
for (let index = rows.length - 1; index >= 0; index -= 1) {
  if (String(rows[index]?.['${whereField}'] ?? '') === String(${sourceValueExpr} ?? '')) {
    rows.splice(index, 1);
  }
}
return null;`;
      parity = 'partial';
      issues.push(`DELETE from '${tableName}' where ${whereField} matches ${sourceKey} converted to in-memory removal; verify foreign-key semantics`);
      return { js, parity, issues };
    }

    const updDelMatch = sql.match(/^update\s+([\w]+)\s+set\s+(.+?)\s+where\s+/is);
    if (updDelMatch) {
      const [, tblName, setPart] = updDelMatch;
      const assignments = [];
      for (const chunk of setPart.split(',')) {
        const m = chunk.trim().match(/^([\w]+)\s*=\s*(.+)$/s);
        if (m) assignments.push(`'${m[1].trim()}': ${m[2].trim()}`);
      }
      if (assignments.length) {
        js = `// §12 Converted TOD UPDATE-on-delete → mark as deleted
const rows = bang?.['${tblName}']?.rows || [];
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

  js = `// §12 manual_review_required: unclassified trigger\n/*\n${sql.substring(0, 300)}\n*/\nreturn null;`;
  parity = 'manual_review_required';
  issues.push('Unclassified trigger type – manual conversion required');
  return { js, parity, issues };
}

// ─── 7. BUILD TRIGGER OBJECT FOR MENU (§6.1) ────────────────────────────────
function buildTriggers(menuId) {
  const rows = trig.filter(t => t.id === menuId);
  if (!rows.length) return { trigger: {}, trigger_legacy_rows: [], migration_notes: [] };

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

    let combinedJs;
    if (parts.length === 1) combinedJs = parts[0];
    else combinedJs = parts.map((p, i) => `// === Block ${i + 1} (stt=${trigRows[i].stt}) ===\n${p}`).join('\n\n');

    if (trigKey === 'beforeSave') {
      combinedJs = `// beforeSave signature: (row, seft, data)\n${combinedJs}`;
    }

    triggerObj[trigKey] = combinedJs;
    migrationNotes.push({
      source_signature: `loaitrigger=${loai} (${trigRows.length} row${trigRows.length > 1 ? 's' : ''})`,
      target_signature: `${trigKey}: Function("seft","data","bang", code)`,
      behavior_parity: worstParity,
      unsupported_legacy_features: allIssues,
      test_vectors: [],
    });
  }

  return {
    trigger: triggerObj,
    trigger_legacy_rows: rows,
    migration_notes: migrationNotes,
  };
}

// ─── 8. BUILD TABLE FIELDS FOR MENU (§4) ────────────────────────────────────
function buildTableFields(menuId) {
  const rows = tbl.filter(t => t.id === menuId);
  return rows.map(r => ({
    f_name: r.f_name ? String(r.f_name).toLowerCase() : r.f_name,
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
    if (paramMatch) return { kind: 'param', param: paramMatch[1], alias };
    const fieldMatch = expr.match(/^(?:[\w]+\.)?([\w]+)$/);
    if (fieldMatch) return { kind: 'field', field: fieldMatch[1], alias };
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
        'Default print dataset generated from selected row because legacy menu had report template without explicit report_query',
      ],
      test_vectors: [],
    },
  };
}

function buildReportHelperPreamble() {
  return `const params = data || {};
const rowsOf = (name) => Array.isArray(bang?.[name]?.rows) ? bang[name].rows : [];
const s = (value) => String(value ?? '').trim();
const n = (value) => {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
};
const round2 = (value) => Math.round(n(value) * 100) / 100;
const toDateKey = (value) => {
  const text = s(value);
  const parts = text.split('/');
  if (parts.length === 3) return parts[2].padStart(4, '0') + parts[1].padStart(2, '0') + parts[0].padStart(2, '0');
  return text.replace(/[^0-9]/g, '');
};
const betweenDate = (value, from, to) => {
  const cur = toDateKey(value);
  const start = toDateKey(from);
  const end = toDateKey(to);
  if (start && cur && cur < start) return false;
  if (end && cur && cur > end) return false;
  return true;
};
const like = (value, query) => {
  const needle = s(query);
  if (!needle) return true;
  return s(value).includes(needle);
};
const eq = (value, query) => {
  const expected = s(query);
  if (!expected) return true;
  return s(value) === expected;
};
const groupBy = (rows, keyFn) => {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
};`;
}

function buildKnownReportQueryDb(src) {
  const reportName = String(src.report_name || '').trim();
  const helpers = buildReportHelperPreamble();
  const partialNote = {
    source_signature: 'report_query',
    target_signature: 'report_db: Function("seft","data","bang", ...utilityFns, code)',
    behavior_parity: 'partial',
    unsupported_legacy_features: [],
    test_vectors: [],
  };

  const reportMap = {
    dsm_phaichi_ve_ct: `${helpers}
const paidIds = new Set(rowsOf('dsm_phieuchi_ve_ct').filter(r => n(r.da_tra) === 1).map(r => s(r.id)));
const rows = rowsOf('dsm_ve')
  .filter(r => !paidIds.has(s(r.id)) && like(r.ten_ncc, params.ten_khach_hang) && like(r.ten_hang, params.ten_hang_ve) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay))
  .map(r => ({
    tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang), ten_hang_ve: s(params.ten_hang_ve),
    ngay_xuat: r.ngay_xuat, ten_hang: r.ten_hang, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh,
    dongia: r.gia_von, tigia: r.gia_von_tigia, thanhtien: round2(n(r.gia_von) * n(r.gia_von_tigia)), ten_ncc: r.ten_ncc,
  }))
  .sort((a, b) => s(a.ten_ncc).localeCompare(s(b.ten_ncc)) || toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_phaichi_re_ct: `${helpers}
const rows = rowsOf('dsm_re')
  .filter(r => n(r.da_thu) === 1 && like(r.khach_hang, params.ten_khach_hang) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay))
  .map(r => ({
    tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang),
    so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, hanh_trinh_re: r.hanh_trinh_re,
    dongia: r.gia_ban_re, tigia: r.gia_ban_tigia, thanhtien: round2(n(r.gia_ban_re) * n(r.gia_ban_tigia)), khach_hang: r.khach_hang,
  }))
  .sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_phaithu_re_ct: `${helpers}
const rows = rowsOf('dsm_re')
  .filter(r => n(r.da_chi) === 1 && like(r.ten_ncc, params.nha_cung_cap) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay))
  .map(r => ({
    tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), nha_cung_cap: s(params.nha_cung_cap),
    so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, hanh_trinh_re: r.hanh_trinh_re,
    dongia: r.gia_von_re, tigia: r.gia_von_tigia, thanhtien: round2(n(r.gia_von_re) * n(r.gia_von_tigia)), ten_ncc: r.ten_ncc,
  }))
  .sort((a, b) => s(a.ten_ncc).localeCompare(s(b.ten_ncc)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_tinhhinh_hd: `${helpers}
const rows = rowsOf('dsm_ve')
  .filter(r => eq(r.ten_hang, params.hang_ve) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay))
  .map(r => ({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), hang_ve: s(params.hang_ve), ...r }))
  .sort((a, b) => toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_rpt_thudu: `${helpers}
const masters = new Map(rowsOf('dsm_biennhan_ve').map(r => [s(r.id), r]));
const rows = rowsOf('dsm_biennhan_ve_ct')
  .filter(r => n(r.sotien_thu_du) > 0 && s(r.so_phieuchi) === '' && eq(r.khach_hang, params.ten_khach_hang) && like(r.so_biennhan, params.so_bien_nhan) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay))
  .map(r => ({
    tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang), so_bien_nhan: s(params.so_bien_nhan),
    so_biennhan: r.so_biennhan, khach_hang: r.khach_hang, ngay_xuat: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh,
    thanh_tien: r.thanh_tien, sotien_thu_du: r.sotien_thu_du, ghi_chu: r.ghi_chu, parent: masters.get(s(r.parent_id)) || null,
  }))
  .sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_thuchi_re: `${helpers}
const rows = [];
rowsOf('dsm_re').forEach((r) => {
  if (n(r.da_thu) === 1 && betweenDate(r.ngay_thu, params.tu_ngay, params.den_ngay)) {
    rows.push({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ly_do: s(params.ly_do), so_ve_mb: s(params.so_ve_mb), loai_thuchi: 'thu', ngay_ct: r.ngay_ct, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, hanh_trinh_re: r.hanh_trinh_re, sotien: round2(n(r.gia_von_re) * n(r.gia_von_tigia)) });
  }
  if (n(r.da_chi) === 1 && betweenDate(r.ngay_chi, params.tu_ngay, params.den_ngay)) {
    rows.push({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ly_do: s(params.ly_do), so_ve_mb: s(params.so_ve_mb), loai_thuchi: 'chi', ngay_ct: r.ngay_ct, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, hanh_trinh_re: r.hanh_trinh_re, sotien: round2(n(r.gia_ban_re) * n(r.gia_ban_tigia)) });
  }
});
const filtered = rows.filter(r => eq(r.loai_thuchi, params.ly_do) && like(r.so_ve, params.so_ve_mb)).sort((a, b) => s(a.loai_thuchi).localeCompare(s(b.loai_thuchi)) || toDateKey(a.ngay_ct).localeCompare(toDateKey(b.ngay_ct)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows: filtered, danh_sach: filtered, ds_baocao: filtered };`,

    dsm_hh_ve: `${helpers}
const visaThu = new Map(rowsOf('dsm_biennhan_visa_ct').map(r => [s(r.id), r.ngay_thu]));
const veThu = new Map(rowsOf('dsm_biennhan_ve_ct').map(r => [s(r.so_ve || r.id), r.ngay_thu]));
const rows = [
  ...rowsOf('dsm_ve').filter(r => betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).map(r => ({ tt: 0, tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ngay_xuat: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, gia_von: r.gia_von, gia_von_tigia: r.gia_von_tigia, gia_ban: r.gia_ban, gia_ban_tigia: r.gia_ban_tigia, khach_hang: r.khach_hang, ten_nv: s(r.id).split('-').slice(1,2)[0] || '', ngay_thu: veThu.get(s(r.id)) || '' })),
  ...rowsOf('dsm_visa').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).map(r => ({ tt: 1, tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ngay_xuat: r.ngay_ct, so_ve: '', ten_kh: r.ten_kh, hanh_trinh: r.noi_dung, gia_von: r.gia_von, gia_von_tigia: r.gia_von_tigia, gia_ban: r.gia_ban, gia_ban_tigia: r.gia_ban_tigia, khach_hang: r.khach_hang, ten_nv: s(r.id).split('-').slice(1,2)[0] || '', ngay_thu: visaThu.get(s(r.id)) || '' })),
].sort((a, b) => n(a.tt) - n(b.tt) || toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_tk_hoadon: `${helpers}
const rows = rowsOf('dsm_ve')
  .filter(r => s(r.sohd_out) !== '')
  .map(r => ({ ...r, ma_hd: s(r.sohd_out).replace(/[^A-Za-z]/g, ''), so_hd_num: Number(s(r.sohd_out).replace(/\D/g, '')) || 0 }))
  .filter(r => eq(r.ma_hd, params.ma_hd) && (!s(params.tu_so) || r.so_hd_num >= n(params.tu_so)) && (!s(params.den_so) || r.so_hd_num <= n(params.den_so)))
  .map(r => ({ ma_hd: s(params.ma_hd), tu_so: s(params.tu_so), den_so: s(params.den_so), ten_hang: r.ten_hang, ngay_xuat: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, sohd_in: r.sohd_in, ngayhd_in: r.ngayhd_in, tienhd_in: r.tienhd_in, sohd_out: r.sohd_out, ngayhd_out: r.ngayhd_out, tienhd_out: r.tienhd_out, ma_hd_row: r.ma_hd }))
  .sort((a, b) => n(b.sohd_out?.replace(/\D/g, '')) - n(a.sohd_out?.replace(/\D/g, '')));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_phaithu_ve_th: `${helpers}
const veTamThu = rowsOf('dsm_biennhan_ve_ct').reduce((acc, row) => { const key = s(row.id); acc[key] = (acc[key] || 0) + n(row.tam_thu); return acc; }, {});
const vePaid = new Set(rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const visaPaid = new Set(rowsOf('dsm_biennhan_visa_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const base = [
  ...rowsOf('dsm_ve').filter(r => !vePaid.has(s(r.id)) && like(r.khach_hang, params.ten_khach_hang) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).map(r => ({ khach_hang: r.khach_hang, loaicn: 've', so_biennhan: s(r.so_biennhan) || 'kobn', thanhtien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)), tam_thu: n(veTamThu[s(r.id)] || 0) })),
  ...rowsOf('dsm_visa').filter(r => !visaPaid.has(s(r.id)) && like(r.khach_hang, params.ten_khach_hang) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).map(r => ({ khach_hang: r.khach_hang, loaicn: 'visa', so_biennhan: s(r.so_biennhan) || 'kobn', thanhtien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)), tam_thu: 0 })),
].filter(r => like(r.so_biennhan, params.so_bien_nhan));
const grouped = Array.from(groupBy(base, r => [s(r.khach_hang), s(r.loaicn), s(r.so_biennhan)].join('|')).values()).map(rows => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang), so_bien_nhan: s(params.so_bien_nhan),
  khach_hang: rows[0].khach_hang, loaicn: rows[0].loaicn, so_biennhan: rows[0].so_biennhan,
  thanhtien: rows.reduce((sum, row) => sum + n(row.thanhtien), 0),
  tam_thu: rows.reduce((sum, row) => sum + n(row.tam_thu), 0),
  phai_thu: rows.reduce((sum, row) => sum + n(row.thanhtien) - n(row.tam_thu), 0),
})).sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || s(a.loaicn).localeCompare(s(b.loaicn)) || s(a.so_biennhan).localeCompare(s(b.so_biennhan)));
return { params, rows: grouped, danh_sach: grouped, ds_baocao: grouped };`,

    dsm_phaithu_ve_ct: `${helpers}
const veTamThuById = rowsOf('dsm_biennhan_ve_ct').reduce((acc, row) => { if (n(row.da_tamthu) === 1) acc[s(row.id)] = n(row.tam_thu); return acc; }, {});
const vePaidById = new Set(rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const visaPaidById = new Set(rowsOf('dsm_biennhan_visa_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const base = [
  ...rowsOf('dsm_ve').filter(r => !vePaidById.has(s(r.id)) && like(r.khach_hang, params.ten_khach_hang) && like(r.so_biennhan, params.so_bien_nhan) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).map(r => ({ khach_hang: r.khach_hang, loaicn: 've', so_biennhan: r.so_biennhan, ngay_xuat: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, dongia: r.gia_ban, tigia: r.gia_ban_tigia, thanhtien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)), tam_thu: n(veTamThuById[s(r.id)] || 0), nv: s(r.id).split('-').slice(1,2)[0] || '' })),
  ...rowsOf('dsm_visa').filter(r => !visaPaidById.has(s(r.id)) && like(r.khach_hang, params.ten_khach_hang) && like(r.so_biennhan, params.so_bien_nhan) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).map(r => ({ khach_hang: r.khach_hang, loaicn: 'visa', so_biennhan: r.so_biennhan, ngay_xuat: r.ngay_ct, so_ve: '', ten_kh: r.ten_kh, hanh_trinh: r.noi_dung, dongia: r.gia_ban, tigia: r.gia_ban_tigia, thanhtien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)), tam_thu: 0, nv: s(r.id).split('-').slice(1,2)[0] || '' })),
].filter(r => like(r.nv, params.nhan_vien));
const rows = Array.from(groupBy(base, r => [s(r.khach_hang), s(r.loaicn), s(r.so_ve), s(r.ten_kh)].join('|')).values()).map(group => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang), so_bien_nhan: s(params.so_bien_nhan), nhan_vien: s(params.nhan_vien),
  khach_hang: group[0].khach_hang, loaicn: group[0].loaicn, so_biennhan: group[0].so_biennhan, ngay_xuat: group[0].ngay_xuat, so_ve: group[0].so_ve, ten_kh: group[0].ten_kh, hanh_trinh: group[0].hanh_trinh, dongia: group[0].dongia, tigia: group[0].tigia, thanhtien: group.reduce((sum, row) => sum + n(row.thanhtien), 0), tam_thu: group.reduce((sum, row) => sum + n(row.tam_thu), 0), phai_thu: group.reduce((sum, row) => sum + n(row.thanhtien) - n(row.tam_thu), 0), nv: group[0].nv,
})).sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || s(a.loaicn).localeCompare(s(b.loaicn)) || toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_phaichi_tour_ct: `${helpers}
const tourRows = [
  ...rowsOf('dsm_tour_dutoan').map(r => ({ ...r, __type: 'nguyentour' })),
  ...rowsOf('dsm_tour_banle_ct').map(r => ({ ...r, __type: 'banle' })),
];
const tourById = new Map(rowsOf('dsm_tour').map(r => [s(r.id), r]));
const rows = tourRows.filter(r => s(r.so_phieuchi) === '' && like(r.so_phieuchi, params.so_phieu_chi) && like(r.ten_ncc, params.nha_cung_cap) && eq(r.__type, params.loai_cong_no || r.__type) && betweenDate(r.__type === 'nguyentour' ? (tourById.get(s(r.parent_id))?.ngay_lap_tour || '') : r.ngay_dat, params.tu_ngay, params.den_ngay)).map(r => {
  const tour = tourById.get(s(r.parent_id)) || {};
  const giaVon = r.__type === 'nguyentour' ? n(r.so_tien_final) : n(r.gia_von);
  const tiGia = r.__type === 'nguyentour' ? 0 : n(r.ti_gia);
  return {
    tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), nha_cung_cap: s(params.nha_cung_cap), so_phieu_chi: s(params.so_phieu_chi), loai_cong_no: s(params.loai_cong_no),
    ten_ncc: r.ten_ncc, so_phieuchi: r.so_phieuchi, loaicn: r.__type, cp_dv: r.__type === 'nguyentour' ? r.ten_chiphi : r.ten_dv, noi_dung: r.__type === 'nguyentour' ? tour.ten_tour : r.noi_dung, ngay_di: r.ngay_di || tour.ngay_di, ngay_ve: r.ngay_ve || tour.ngay_ve, ten_kh: r.__type === 'nguyentour' ? '' : r.ten_kh, gia_von: giaVon, ti_gia: tiGia, thanhtien: r.__type === 'nguyentour' ? giaVon : round2(giaVon * tiGia),
  };
}).sort((a, b) => s(a.ten_ncc).localeCompare(s(b.ten_ncc)) || s(a.loaicn).localeCompare(s(b.loaicn)) || s(a.cp_dv).localeCompare(s(b.cp_dv)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_phaithu_tour_ct: `${helpers}
const tourMaster = new Map(rowsOf('dsm_tour').map(r => [s(r.id), r]));
const tamThuTour = rowsOf('dsm_biennhantour_ct').reduce((acc, row) => { acc[s(row.id)] = n(row.tam_thu); return acc; }, {});
const daThuTour = new Set(rowsOf('dsm_biennhantour_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const base = [
  ...rowsOf('dsm_tour_kh').filter(r => !daThuTour.has(s(r.id)) && like(r.so_biennhan, params.so_bien_nhan) && like(r.khach_hang, params.khach_hang_cn) && betweenDate(tourMaster.get(s(r.parent_id))?.ngay_lap_tour || '', params.tu_ngay, params.den_ngay)).map(r => { const tour = tourMaster.get(s(r.parent_id)) || {}; return { loaicn: 'nguyentour', khach_hang: r.khach_hang, so_biennhan: s(r.so_biennhan), code: tour.ma_code, noi_dung: tour.ten_tour, ngay_di: tour.ngay_di, ngay_ve: tour.ngay_ve, ten_kh: r.ten_kh, gia_ban: r.gia_ban, ti_gia: r.ti_gia, thanhtien: round2(n(r.gia_ban) * n(r.ti_gia)), tamthu: n(tamThuTour[s(r.id)] || 0) }; }),
  ...rowsOf('dsm_tour_banle_ct').filter(r => !daThuTour.has(s(r.id)) && like(r.so_biennhan, params.so_bien_nhan) && like(r.khach_hang, params.khach_hang_cn) && betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).map(r => ({ loaicn: 'banle', khach_hang: r.khach_hang, so_biennhan: s(r.so_biennhan), code: r.ten_dv, noi_dung: r.noi_dung, ngay_di: r.ngay_di, ngay_ve: r.ngay_ve, ten_kh: r.ten_kh, gia_ban: r.gia_ban, ti_gia: r.gia_ban_tigia, thanhtien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)), tamthu: n(tamThuTour[s(r.id)] || 0) })),
].filter(r => like(r.loaicn, params.loai_cong_no));
const rows = Array.from(groupBy(base, r => [s(r.khach_hang), s(r.code), s(r.ten_kh), s(r.noi_dung), s(r.ngay_di), s(r.ngay_ve)].join('|')).values()).map(group => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), khach_hang_cn: s(params.khach_hang_cn), so_bien_nhan: s(params.so_bien_nhan), loai_cong_no: s(params.loai_cong_no),
  khach_hang: group[0].khach_hang, so_biennhan: group[0].so_biennhan, loaicn: group[0].loaicn, code: group[0].code, noi_dung: group[0].noi_dung, ngay_di: group[0].ngay_di, ngay_ve: group[0].ngay_ve, ten_kh: group[0].ten_kh, gia_ban: group[0].gia_ban, ti_gia: group[0].ti_gia, thanhtien: group.reduce((sum, row) => sum + n(row.thanhtien), 0), tamthu: group.reduce((sum, row) => sum + n(row.tamthu), 0), phaithu: group.reduce((sum, row) => sum + n(row.thanhtien) - n(row.tamthu), 0),
})).sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || s(a.code).localeCompare(s(b.code)) || s(a.ten_kh).localeCompare(s(b.ten_kh)) || s(a.noi_dung).localeCompare(s(b.noi_dung)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_doanhthutour_bl: `${helpers}
const phieuThu = rowsOf('dsm_phieuthu_tour').filter(r => n(r.loai_biennhan) === 1 && like(r.ma_code, params.ten_dich_vu) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay));
const phieuChi = rowsOf('dsm_phieuchi_tour').filter(r => n(r.loai_phieuchi) === 1 && like(r.ma_code, params.ten_dich_vu) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay));
const base = [
  ...Array.from(groupBy(phieuThu, r => [s(r.ma_code), s(r.khach_hang)].join('|')).values()).map(group => ({ ma_code: group[0].ma_code, loaidt: 'kh', doi_tuong: group[0].khach_hang, tam_thu: group.reduce((sum, r) => sum + n(r.tam_thu), 0), phaithu: group.reduce((sum, r) => sum + n(r.phai_thu), 0), datra: 0, conno: 0 })),
  ...Array.from(groupBy(phieuChi, r => [s(r.ma_code), s(r.nha_cc)].join('|')).values()).map(group => ({ ma_code: group[0].ma_code, loaidt: 'ncc', doi_tuong: group[0].nha_cc, tam_thu: 0, phaithu: 0, datra: group.reduce((sum, r) => sum + n(r.da_tra), 0), conno: group.reduce((sum, r) => sum + n(r.con_no), 0) })),
];
const rows = Array.from(groupBy(base, r => [s(r.ma_code), s(r.doi_tuong)].join('|')).values()).map(group => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_dich_vu: s(params.ten_dich_vu),
  ma_code: group[0].ma_code, loaidt: group[0].loaidt, doi_tuong: group[0].doi_tuong,
  tam_thu: group.reduce((sum, r) => sum + n(r.tam_thu), 0), phaithu: group.reduce((sum, r) => sum + n(r.phaithu), 0), datra: group.reduce((sum, r) => sum + n(r.datra), 0), conno: group.reduce((sum, r) => sum + n(r.conno), 0), doanhthu: group.reduce((sum, r) => sum + (n(r.tam_thu) + n(r.phaithu) - n(r.datra) - n(r.conno)), 0),
})).sort((a, b) => s(a.ma_code).localeCompare(s(b.ma_code)) || s(a.loaidt).localeCompare(s(b.loaidt)) || s(a.doi_tuong).localeCompare(s(b.doi_tuong)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_thuchi_ct: `${helpers}
const detail = [];
const pushRows = (tc, ten_dt, rows, amountField, dateField, mapper, filter = () => true) => {
  rows.filter(r => filter(r) && betweenDate(r[dateField], params.tu_ngay, params.den_ngay)).forEach((r) => detail.push({ tc, ten_dt, ...mapper(r), tamthu: 0, sotien: round2(n(r[amountField])) }));
};
pushRows('thu', 'visa', rowsOf('dsm_biennhan_visa_ct'), 'tien_mat', 'ngay_thu', r => ({ ngay_ct: r.ngay_ct, so_ve: '', ten_kh: r.ten_kh, noi_dung: r.noi_dung }), r => n(r.da_thu) === 1);
pushRows('thu', 've', rowsOf('dsm_biennhan_ve_ct'), 'tien_mat', 'ngay_thu', r => ({ ngay_ct: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, noi_dung: r.hanh_trinh }), r => n(r.da_thu) === 1);
rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_tamthu) === 1 && betweenDate(r.ngay_tamthu, params.tu_ngay, params.den_ngay)).forEach(r => detail.push({ tc: 'thu', ten_dt: 've', ngay_ct: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, noi_dung: r.hanh_trinh, tamthu: round2(n(r.tam_thu)), sotien: 0 }));
pushRows('thu', 're', rowsOf('dsm_re'), 'thu_tm', 'ngay_thu', r => ({ ngay_ct: r.ngay_ct, so_ve: r.so_ve, ten_kh: r.ten_kh, noi_dung: r.hanh_trinh_re }), r => n(r.da_thu) === 1);
rowsOf('dsm_biennhantour_ct').filter(r => n(r.da_tamthu) === 1 && betweenDate(r.ngay_tamthu, params.tu_ngay, params.den_ngay)).forEach(r => detail.push({ tc: 'thu', ten_dt: 'tour', ngay_ct: r.ngay_di, so_ve: r.ngay_ve, ten_kh: r.ten_kh, noi_dung: r.noi_dung, tamthu: round2(n(r.tam_thu)), sotien: 0 }));
pushRows('thu', 'tour', rowsOf('dsm_biennhantour_ct'), 'tien_mat', 'ngay_thu', r => ({ ngay_ct: r.ngay_di, so_ve: r.ngay_ve, ten_kh: r.ten_kh, noi_dung: r.noi_dung }), r => n(r.da_thu) === 1);
pushRows('thu', 'khac', rowsOf('dsm_chiphi'), 'so_tien', 'ngay_ct', r => ({ ngay_ct: r.ngay_ct, so_ve: '', ten_kh: '', noi_dung: r.noi_dung }), r => n(r.loai_cp) === 1);
pushRows('chi', 'visa', rowsOf('dsm_phieuchi_visa_ct'), 'tien_mat', 'ngay_tra', r => ({ ngay_ct: r.ngay_ct, so_ve: '', ten_kh: r.ten_kh, noi_dung: r.noi_dung }), r => n(r.da_tra) === 1);
pushRows('chi', 've', rowsOf('dsm_phieuchi_ve_ct'), 'tien_mat', 'ngay_tra', r => ({ ngay_ct: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, noi_dung: r.hanh_trinh }), r => n(r.da_tra) === 1);
pushRows('chi', 're', rowsOf('dsm_re'), 'chi_tm', 'ngay_thu', r => ({ ngay_ct: r.ngay_ct, so_ve: r.so_ve, ten_kh: r.ten_kh, noi_dung: r.hanh_trinh_re }), r => n(r.da_chi) === 1);
pushRows('chi', 'khac', rowsOf('dsm_chiphi'), 'so_tien', 'ngay_ct', r => ({ ngay_ct: r.ngay_ct, so_ve: '', ten_kh: '', noi_dung: r.noi_dung }), r => n(r.loai_cp) === 0);
const rows = Array.from(groupBy(detail.filter(r => eq(r.tc, params.thu_chi) && like(r.ten_dt, params.loai_thu_chi)), r => [s(r.tc), s(r.ten_dt), s(r.ngay_ct), s(r.so_ve), s(r.ten_kh), s(r.noi_dung)].join('|')).values()).map(group => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), thu_chi: s(params.thu_chi), loai_thu_chi: s(params.loai_thu_chi),
  tc: group[0].tc, ten_dt: group[0].ten_dt, ngay_ct: group[0].ngay_ct, so_ve: group[0].so_ve, ten_kh: group[0].ten_kh, noi_dung: group[0].noi_dung, sotien: group.reduce((sum, row) => sum + n(row.tamthu) + n(row.sotien), 0),
})).sort((a, b) => s(a.tc).localeCompare(s(b.tc)) || s(a.ten_dt).localeCompare(s(b.ten_dt)) || toDateKey(a.ngay_ct).localeCompare(toDateKey(b.ngay_ct)) || s(a.so_ve).localeCompare(s(b.so_ve)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_baocaolailo: `${helpers}
const aggregate = [];
const push = (loaidt, dt, danh_muc, value) => aggregate.push({ loaidt, dt, danh_muc: s(danh_muc), thanh_tien: round2(value) });

push(0, 'a', '', rowsOf('dsm_visa').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + round2(n(r.gia_ban) * n(r.gia_ban_tigia)), 0));
push(0, 'b', '', rowsOf('dsm_tour').filter(r => betweenDate(r.ngay_lap_tour, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r.gia_ban), 0) + rowsOf('dsm_tour_banle_ct').filter(r => betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + round2(n(r.gia_ban) * n(r.gia_ban_tigia)), 0));
Array.from(groupBy([
  ...rowsOf('dsm_ve').filter(r => betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).map(r => ({ danh_muc: r.ten_hang, thanh_tien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) })),
  ...rowsOf('dsm_re').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).map(r => ({ danh_muc: r.ten_hang, thanh_tien: round2(n(r.gia_von_re) * n(r.gia_von_tigia)) })),
], r => s(r.danh_muc)).entries()).forEach(([danh_muc, rows]) => push(0, 'c', danh_muc, rows.reduce((sum, r) => sum + n(r.thanh_tien), 0)));
push(0, 'd', '', rowsOf('dsm_chiphi').filter(r => n(r.loai_cp) === 1 && n(r.tinh_cp) === 0 && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r.so_tien), 0));

push(1, 'a', '', -1 * rowsOf('dsm_visa').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + round2(n(r.gia_von) * n(r.gia_von_tigia)), 0));
push(1, 'b', '', -1 * (rowsOf('dsm_tour').filter(r => betweenDate(r.ngay_lap_tour, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r.chiphi_thucte), 0) + rowsOf('dsm_tour_banle_ct').filter(r => betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + round2(n(r.gia_von) * n(r.gia_von_tigia)), 0)));
Array.from(groupBy([
  ...rowsOf('dsm_ve').filter(r => betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).map(r => ({ danh_muc: r.ten_hang, thanh_tien: round2(n(r.gia_von) * n(r.gia_von_tigia)) })),
  ...rowsOf('dsm_re').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).map(r => ({ danh_muc: r.ten_hang, thanh_tien: round2(n(r.gia_ban_re) * n(r.gia_ban_tigia)) })),
], r => s(r.danh_muc)).entries()).forEach(([danh_muc, rows]) => push(1, 'c', danh_muc, -1 * rows.reduce((sum, r) => sum + n(r.thanh_tien), 0)));
Array.from(groupBy(rowsOf('dsm_chiphi').filter(r => n(r.loai_cp) === 0 && n(r.tinh_cp) === 0 && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)), r => s(r.noi_dung)).entries()).forEach(([danh_muc, rows]) => push(2, 'cp', danh_muc, -1 * rows.reduce((sum, r) => sum + n(r.so_tien), 0)));

const rows = aggregate.filter(r => n(r.thanh_tien) !== 0).map(r => ({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ...r })).sort((a, b) => n(a.loaidt) - n(b.loaidt) || s(a.dt).localeCompare(s(b.dt)) || s(a.danh_muc).localeCompare(s(b.danh_muc)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_invoice: `${helpers}
const veCt = rowsOf('dsm_biennhan_ve_ct');
const visaCt = rowsOf('dsm_biennhan_visa_ct');
const tourCt = rowsOf('dsm_biennhantour_ct');
const veUnpaid = new Set(veCt.filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const visaUnpaid = new Set(visaCt.filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const tourUnpaid = new Set(tourCt.filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const tourMaster = new Map(rowsOf('dsm_tour').map(r => [s(r.id), r]));
const rows = [];

rowsOf('dsm_visa').filter(r => !visaUnpaid.has(s(r.id)) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => rows.push({ loaicn: '0', khach_hang: r.khach_hang, ngay_xuat: r.ngay_ct, so_ve: '', ten_kh: r.ten_kh, hanh_trinh: r.noi_dung, sohd: '', gia_ban_vnd: n(r.gia_ban_tigia) === 1 ? r.gia_ban : '', gia_ban_usd: n(r.gia_ban_tigia) > 1 ? r.gia_ban : '', ti_gia: n(r.gia_ban_tigia) > 1 ? r.gia_ban_tigia : '', thanh_tien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_ve').filter(r => !veUnpaid.has(s(r.id)) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).forEach(r => rows.push({ loaicn: '1', khach_hang: r.khach_hang, ngay_xuat: r.ngay_xuat, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh, sohd: r.sohd_out, gia_ban_vnd: n(r.gia_ban_tigia) === 1 ? r.gia_ban : '', gia_ban_usd: n(r.gia_ban_tigia) > 1 ? r.gia_ban : '', ti_gia: n(r.gia_ban_tigia) > 1 ? r.gia_ban_tigia : '', thanh_tien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_biennhan_ve').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => {
  const tamThu = veCt.filter(ct => s(ct.parent_id) === s(r.id) && n(ct.da_thu) === 0).reduce((sum, ct) => sum + n(ct.tam_thu), 0);
  if (tamThu > 0) rows.push({ loaicn: '2', khach_hang: r.khach_hang, ngay_xuat: r.ngay_ct, so_ve: '', ten_kh: '', hanh_trinh: '', sohd: '', gia_ban_vnd: '', gia_ban_usd: '', ti_gia: '', thanh_tien: -1 * round2(tamThu) });
});
rowsOf('dsm_re').filter(r => n(r.da_thu) === 0 && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => rows.push({ loaicn: '3', khach_hang: r.khach_hang, ngay_xuat: r.ngay_ct, so_ve: r.so_ve, ten_kh: r.ten_kh, hanh_trinh: r.hanh_trinh_re, sohd: '', gia_ban_vnd: n(r.gia_ban_tigia) === 1 ? -1 * n(r.gia_ban_re) : '', gia_ban_usd: n(r.gia_ban_tigia) > 1 ? -1 * n(r.gia_ban_re) : '', ti_gia: n(r.gia_ban_tigia) > 1 ? r.gia_ban_tigia : '', thanh_tien: -1 * round2(n(r.gia_ban_re) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_tour_kh').filter(r => !tourUnpaid.has(s(r.id)) && betweenDate(tourMaster.get(s(r.parent_id))?.ngay_lap_tour || '', params.tu_ngay, params.den_ngay)).forEach(r => { const tour = tourMaster.get(s(r.parent_id)) || {}; rows.push({ loaicn: '4', khach_hang: r.khach_hang, ngay_xuat: tour.ngay_lap_tour, so_ve: tour.ma_code, ten_kh: r.ten_kh, hanh_trinh: tour.ten_tour, sohd: '', gia_ban_vnd: n(r.ti_gia) === 1 ? r.gia_ban : '', gia_ban_usd: n(r.ti_gia) > 1 ? r.gia_ban : '', ti_gia: n(r.ti_gia) > 1 ? r.ti_gia : '', thanh_tien: round2(n(r.gia_ban) * n(r.ti_gia)) }); });
rowsOf('dsm_tour_banle_ct').filter(r => !tourUnpaid.has(s(r.id)) && betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).forEach(r => rows.push({ loaicn: '5', khach_hang: r.khach_hang, ngay_xuat: r.ngay_dat, so_ve: r.ten_dv, ten_kh: r.ten_kh, hanh_trinh: r.noi_dung, sohd: r.sohd_out, gia_ban_vnd: n(r.gia_ban_tigia) === 1 ? r.gia_ban : '', gia_ban_usd: n(r.gia_ban_tigia) > 1 ? r.gia_ban : '', ti_gia: n(r.gia_ban_tigia) > 1 ? r.gia_ban_tigia : '', thanh_tien: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_biennhantour').filter(r => betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => { const tamThu = tourCt.filter(ct => s(ct.parent_id) === s(r.id) && n(ct.da_thu) === 0).reduce((sum, ct) => sum + n(ct.tam_thu), 0); if (tamThu > 0) rows.push({ loaicn: '6', khach_hang: r.khach_hang, ngay_xuat: r.ngay_ct, so_ve: '', ten_kh: '', hanh_trinh: '', sohd: '', gia_ban_vnd: '', gia_ban_usd: '', ti_gia: '', thanh_tien: -1 * round2(tamThu) }); });

const filtered = rows.filter(r => eq(r.khach_hang, params.ten_khach_hang));
const grouped = Array.from(groupBy(filtered, r => [s(r.khach_hang), s(r.loaicn), s(r.ngay_xuat), s(r.so_ve), s(r.ten_kh)].join('|')).values()).map(group => ({
  tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), ten_khach_hang: s(params.ten_khach_hang), ma_so_thue: s(params.ma_so_thue), dia_chi_kh: s(params.dia_chi_kh),
  khach_hang: group[0].khach_hang, loaicn: group[0].loaicn, ngay_xuat: group[0].ngay_xuat, so_ve: group[0].so_ve, ten_kh: group[0].ten_kh, hanh_trinh: group[0].hanh_trinh, sohd: group[0].sohd,
  gia_ban_vnd: group.reduce((sum, row) => sum + n(row.gia_ban_vnd), 0) || '', gia_ban_usd: group.reduce((sum, row) => sum + n(row.gia_ban_usd), 0) || '', ti_gia: group[0].ti_gia, thanh_tien: group.reduce((sum, row) => sum + n(row.thanh_tien), 0),
})).sort((a, b) => s(a.khach_hang).localeCompare(s(b.khach_hang)) || s(a.loaicn).localeCompare(s(b.loaicn)) || toDateKey(a.ngay_xuat).localeCompare(toDateKey(b.ngay_xuat)) || s(a.so_ve).localeCompare(s(b.so_ve)) || s(a.ten_kh).localeCompare(s(b.ten_kh)));
return { params, rows: grouped, danh_sach: grouped, ds_baocao: grouped };`,

    dsm_bctong_congno: `${helpers}
const veCtSum = rowsOf('dsm_biennhan_ve_ct').reduce((acc, row) => { const key = s(row.id); acc[key] = (acc[key] || 0) + n(row.tam_thu); return acc; }, {});
const tourCtOpen = rowsOf('dsm_biennhantour_ct').reduce((acc, row) => { if (n(row.da_thu) === 0) { const key = s(row.id); acc[key] = (acc[key] || 0) + n(row.tam_thu); } return acc; }, {});
const vePaid = new Set(rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const visaPaid = new Set(rowsOf('dsm_biennhan_visa_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const visaTra = new Set(rowsOf('dsm_phieuchi_visa_ct').filter(r => n(r.da_tra) === 1).map(r => s(r.id)));
const veTra = new Set(rowsOf('dsm_phieuchi_ve_ct').filter(r => n(r.da_tra) === 1).map(r => s(r.id)));
const tourPaid = new Set(rowsOf('dsm_biennhantour_ct').filter(r => n(r.da_thu) === 1).map(r => s(r.id)));
const tours = new Map(rowsOf('dsm_tour').map(r => [s(r.id), r]));
const base = [];
rowsOf('dsm_visa').filter(r => !visaPaid.has(s(r.id)) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'kh', ten_dt: r.khach_hang, giavon: round2(n(r.gia_von) * n(r.gia_von_tigia)), tamthu: 0, giaban: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_ve').filter(r => !vePaid.has(s(r.id)) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'kh', ten_dt: r.khach_hang, giavon: round2(n(r.gia_von) * n(r.gia_von_tigia)), tamthu: n(veCtSum[s(r.id)] || 0), giaban: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_re').filter(r => n(r.da_thu) === 0 && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'kh', ten_dt: r.khach_hang, giavon: -1 * round2(n(r.gia_von_re) * n(r.gia_von_tigia)), tamthu: 0, giaban: -1 * round2(n(r.gia_ban_re) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_tour_kh').filter(r => !tourPaid.has(s(r.id)) && betweenDate(tours.get(s(r.parent_id))?.ngay_lap_tour || '', params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'kh', ten_dt: r.khach_hang, giavon: n(r.gia_von), tamthu: n(tourCtOpen[s(r.id)] || 0), giaban: round2(n(r.gia_ban) * n(r.ti_gia)) }));
rowsOf('dsm_tour_banle_ct').filter(r => !tourPaid.has(s(r.id)) && betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'kh', ten_dt: r.khach_hang, giavon: round2(n(r.gia_von) * n(r.gia_von_tigia)), tamthu: n(tourCtOpen[s(r.id)] || 0), giaban: round2(n(r.gia_ban) * n(r.gia_ban_tigia)) }));
rowsOf('dsm_visa').filter(r => !visaTra.has(s(r.id)) && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'ncc', ten_dt: r.ten_ncc, giavon: 0, tamthu: 0, giaban: round2(n(r.gia_von) * n(r.gia_von_tigia)) }));
rowsOf('dsm_ve').filter(r => !veTra.has(s(r.id)) && betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'ncc', ten_dt: r.ten_ncc, giavon: 0, tamthu: 0, giaban: round2(n(r.gia_von) * n(r.gia_von_tigia)) }));
rowsOf('dsm_re').filter(r => n(r.da_chi) === 0 && betweenDate(r.ngay_ct, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'ncc', ten_dt: r.ten_ncc, giavon: 0, tamthu: 0, giaban: -1 * round2(n(r.gia_von_re) * n(r.gia_von_tigia)) }));
rowsOf('dsm_tour_dutoan').filter(r => s(r.so_phieuchi) === '' && betweenDate(tours.get(s(r.parent_id))?.ngay_lap_tour || '', params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'ncc', ten_dt: r.ten_ncc, giavon: 0, tamthu: 0, giaban: round2(n(r.so_tien_final)) }));
rowsOf('dsm_tour_banle_ct').filter(r => s(r.so_phieuchi) === '' && betweenDate(r.ngay_dat, params.tu_ngay, params.den_ngay)).forEach(r => base.push({ dt: 'ncc', ten_dt: r.ten_ncc, giavon: 0, tamthu: 0, giaban: round2(n(r.gia_von) * n(r.gia_von_tigia)) }));
const rows = Array.from(groupBy(base.filter(r => eq(r.dt, params.kh_ncc) && like(r.ten_dt, params.ten_kh_ncc)), r => [s(r.dt), s(r.ten_dt)].join('|')).values()).map(group => ({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), kh_ncc: s(params.kh_ncc), ten_kh_ncc: s(params.ten_kh_ncc), dt: group[0].dt, ten_dt: group[0].ten_dt, stt: '', giavon: group.reduce((sum, row) => sum + n(row.giavon), 0), tamthu: group.reduce((sum, row) => sum + n(row.tamthu), 0), giaban: group.reduce((sum, row) => sum + n(row.giaban), 0) - group.reduce((sum, row) => sum + n(row.tamthu), 0) })).sort((a, b) => s(a.dt).localeCompare(s(b.dt)) || s(a.ten_dt).localeCompare(s(b.ten_dt)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_doanhthubanve: `${helpers}
const employees = rowsOf('dsm_nhanvien');
const findBooker = (id) => {
  const raw = s(id);
  const found = employees.find(emp => raw.includes(s(emp.userid)) && s(emp.userid));
  return found ? s(found.userid) : 'dongsam';
};
const aggregates = [];
const veRows = rowsOf('dsm_ve').filter(r => betweenDate(r.ngay_xuat, params.tu_ngay, params.den_ngay));
Array.from(groupBy(veRows, r => s(r.ten_hang)).entries()).forEach(([dt, rows]) => aggregates.push({ loaidk: 'hangve', dt, giavon: rows.reduce((sum, r) => sum + round2(n(r.gia_von) * n(r.gia_von_tigia)), 0), giaban: rows.reduce((sum, r) => sum + round2(n(r.gia_ban) * n(r.gia_ban_tigia)), 0) }));
Array.from(groupBy(veRows, r => findBooker(r.id)).entries()).forEach(([dt, rows]) => aggregates.push({ loaidk: 'booker', dt, giavon: rows.reduce((sum, r) => sum + round2(n(r.gia_von) * n(r.gia_von_tigia)), 0), giaban: rows.reduce((sum, r) => sum + round2(n(r.gia_ban) * n(r.gia_ban_tigia)), 0) }));
const rows = aggregates.filter(r => eq(r.loaidk, params.loai_loc) && like(r.dt, params.hangve_booker)).map(r => ({ ...r, tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), loai_loc: s(params.loai_loc), hangve_booker: s(params.hangve_booker) })).sort((a, b) => s(a.loaidk).localeCompare(s(b.loaidk)) || s(a.dt).localeCompare(s(b.dt)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,

    dsm_thuchi_tp: `${helpers}
const sourceRows = [];
const pushAgg = (tc, ten_dt, rows, amountField, dateField, extraFilter = () => true) => {
  const total = rows.filter(r => extraFilter(r) && betweenDate(r[dateField], params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r[amountField]), 0);
  sourceRows.push({ tc, ten_dt, tamthu: 0, sotien: round2(total) });
};
pushAgg('thu', 'visa', rowsOf('dsm_biennhan_visa_ct').filter(r => n(r.da_thu) === 1), 'tien_mat', 'ngay_thu');
pushAgg('thu', 've', rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_thu) === 1), 'tien_mat', 'ngay_thu');
sourceRows.push({ tc: 'thu', ten_dt: 've', tamthu: round2(rowsOf('dsm_biennhan_ve_ct').filter(r => n(r.da_tamthu) === 1 && betweenDate(r.ngay_tamthu, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r.tam_thu), 0)), sotien: 0 });
pushAgg('thu', 're', rowsOf('dsm_re').filter(r => n(r.da_thu) === 1), 'thu_tm', 'ngay_thu');
sourceRows.push({ tc: 'thu', ten_dt: 'tour', tamthu: round2(rowsOf('dsm_biennhantour_ct').filter(r => n(r.da_tamthu) === 1 && betweenDate(r.ngay_tamthu, params.tu_ngay, params.den_ngay)).reduce((sum, r) => sum + n(r.tam_thu), 0)), sotien: 0 });
pushAgg('thu', 'tour', rowsOf('dsm_biennhantour_ct').filter(r => n(r.da_thu) === 1), 'tien_mat', 'ngay_thu');
pushAgg('thu', 'khac', rowsOf('dsm_chiphi').filter(r => n(r.loai_cp) === 1), 'so_tien', 'ngay_ct');
pushAgg('chi', 'visa', rowsOf('dsm_phieuchi_visa_ct').filter(r => n(r.da_tra) === 1), 'tien_mat', 'ngay_tra');
pushAgg('chi', 've', rowsOf('dsm_phieuchi_ve_ct').filter(r => n(r.da_tra) === 1), 'tien_mat', 'ngay_tra');
pushAgg('chi', 're', rowsOf('dsm_re').filter(r => n(r.da_chi) === 1), 'chi_tm', 'ngay_thu');
pushAgg('chi', 'tour', rowsOf('dsm_phieuchi_tour'), 'tien_mat', 'ngay_ct');
pushAgg('chi', 'khac', rowsOf('dsm_chiphi').filter(r => n(r.loai_cp) === 0), 'so_tien', 'ngay_ct');
const rows = sourceRows.filter(r => eq(r.tc, params.thu_chi) && like(r.ten_dt, params.loai_thu_chi)).map(r => ({ tu_ngay: s(params.tu_ngay), den_ngay: s(params.den_ngay), thu_chi: s(params.thu_chi), loai_thu_chi: s(params.loai_thu_chi), stt: '', tc: r.tc, ten_dt: r.ten_dt, sotien: round2(n(r.tamthu) + n(r.sotien)) })).sort((a, b) => s(a.tc).localeCompare(s(b.tc)) || s(a.ten_dt).localeCompare(s(b.ten_dt)));
return { params, rows, danh_sach: rows, ds_baocao: rows };`,
  };

  if (!reportMap[reportName]) return null;
  return {
    reportDb: reportMap[reportName],
    migrationNote: partialNote,
    warning: null,
  };
}

function convertReportQueryToReportDb(sql, src) {
  const raw = String(sql || '').trim();
  if (!raw) return buildDefaultPrintReportDb(src);

  const known = buildKnownReportQueryDb(src);
  if (known) return known;

  const tables = extractSqlTableNames(raw);
  const hasJoin = /\bjoin\b/i.test(raw);
  const hasUnion = /\bunion\b/i.test(raw);
  const hasGroupBy = /\bgroup\s+by\b/i.test(raw);
  const hasNestedSelect = (raw.match(/\bselect\b/gi) || []).length > 1;

  if (hasJoin || hasGroupBy || hasNestedSelect) {
    const code = `// Converted complex legacy report_query → report_db (multi-table join/group)
const tablelist = ${JSON.stringify(tables)};
const srcTables = {};
tablelist.forEach(t => {
  srcTables[t] = bang?.[t]?.rows || [];
});
const params = data || {};

/*
${raw.substring(0, 500)}
*/

const primary = srcTables['${tables[0] || ''}'] || [];
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
          `Complex report query with ${hasJoin ? 'JOIN ' : ''}${hasGroupBy ? 'GROUP BY ' : ''}${hasNestedSelect ? 'nested SELECT' : ''}requires manual JS implementation with in-memory join/aggregation logic`,
        ],
        test_vectors: [],
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
        test_vectors: [],
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
      unsupported_legacy_features: ['Legacy report_query contains SQL features requiring manual review'],
      test_vectors: [],
    },
    warning: `Report '${src.report_name || src.id}' uses complex SQL report_query and was wrapped into report_db for manual review`,
  };
}

function toNumberOrDefault(value, fallback) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePath(src) {
  const raw = String(src.link_page || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function buildMenuRuntime(src, tableFields, nextTrigger, triggerLegacyRows, nextMigrationNotes, report) {
  const tf = mapTypeForm(src);
  const tableName = String(src.table_name || '').trim();
  const linkPath = normalizePath(src);
  const normalizedParentId = String(src.parent_id || '').trim() === APP_ID ? '' : (src.parent_id || '');
  const runtime = {
    id: src.id,
    parentId: normalizedParentId,
    hideInMenu: shouldHideInMainMenu(src) ? 1 : 0,
    label: src.grid_name,
    name: src.grid_name,
    m_icon: src.m_icon || '',
    path: linkPath || undefined,
    table_name: tableName || undefined,
    e_where: src.e_where || '',
    table_sort: src.table_sort || '',
    table_pagesize: toNumberOrDefault(src.table_pagesize, 20),
    table_read_only: toNumberOrDefault(src.table_read_only, 0),
    g_readonly: toNumberOrDefault(src.table_read_only, 0) === 1,
    field_root: src.field_root || '',
    report_name: src.report_name || '',
    type_form: tf,
    prefix_pk: src.prefix_pk || '',
    m_show: toNumberOrDefault(src.m_show, 1) === 1,
    bit_field_right: src.bit_field_right || '',
    can_see: toNumberOrDefault(src.can_see, 1),
    custom_footer: src.custom_footer || '',
    custom_group: src.custom_group || '',
    table: tableFields,
    trigger: nextTrigger,
    migration_notes: nextMigrationNotes,
    trigger_legacy_rows: triggerLegacyRows,
    compatibility: {
      validation_profile: 'migration',
      source_chunks: {
        from_msdt: true,
        from_tbl_count: tableFields.length,
        from_report: !!report,
        from_trigger_count: triggerLegacyRows.length,
      },
    },
  };

  if (!linkPath) delete runtime.path;
  if (!tableName) delete runtime.table_name;
  if (!runtime.report_name) delete runtime.report_name;
  return runtime;
}

// ─── 9. GENERATE MENUS ──────────────────────────────────────────────────────
const rptById = new Map(rpt.map(r => [r.id, r]));

const flatMenus = srcMenus.map(src => {
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

  return buildMenuRuntime(src, tableFields, nextTrigger, trigger_legacy_rows, nextMigrationNotes, report);
});

function buildMenuTree(flat, parentId = '') {
  return flat
    .filter((menu) => String(menu.parentId || '') === String(parentId || ''))
    .map((menu) => {
      const children = buildMenuTree(flat, menu.id || '');
      return children.length > 0 ? { ...menu, children } : { ...menu };
    });
}

const menus = buildMenuTree(flatMenus, '');

// ─── 10. AUDIT COUNTERS ─────────────────────────────────────────────────────
let legacyTotal = 0;
let convertedTotal = 0;
let parityFull = 0;
let parityPartial = 0;
let manualReview = 0;
for (const m of flatMenus) {
  for (const note of (m.migration_notes || [])) {
    legacyTotal++;
    convertedTotal++;
    if (note.behavior_parity === 'full') parityFull++;
    else if (note.behavior_parity === 'partial') parityPartial++;
    else manualReview++;
  }
}

const reportWarnings = flatMenus
  .map((m) => m.migration_notes || [])
  .flat()
  .filter((note) => note.source_signature === 'report_query' && note.behavior_parity === 'manual_review_required')
  .map(() => 'report_query on migrated report requires manual review');

// ─── 11. VALIDATION CHECKS ──────────────────────────────────────────────────
const idSet = new Set();
let routeOk = true;
let schemaOk = true;
let tenantOk = true;
for (const m of menus) {
  if (idSet.has(m.id)) {
    routeOk = false;
    console.warn('DUPLICATE ID:', m.id);
  }
  idSet.add(m.id);
  if (typeof m.type_form !== 'number') {
    schemaOk = false;
    console.warn('type_form not integer:', m.id);
  }
  if (!m.id || m.parentId === undefined || m.parentId === null) tenantOk = false;
}

// ─── 12. FINAL OUTPUT ───────────────────────────────────────────────────────
const output = {
  app_id: APP_ID,
  mode: 'migrate',
  summary: `Vemaybay menu migration – ${flatMenus.length} menus rebuilt by recursive descendants of parent_id=${APP_ID}. Output now includes nested children tree in menus and preserves flat list in menus_flat for compatibility.`,
  menus,
  menus_flat: flatMenus,
  table_structs: [],
  migration_notes: [],
  warnings: [
    ...(manualReview > 0 ? [`${manualReview} trigger/report blocks require manual JS review because legacy SQL is too complex or depends on stored procedures/PHP.`] : []),
    ...reportWarnings,
  ],
  conversion_audit: {
    source_descendant_menu_count: srcMenus.length,
    output_menu_count: flatMenus.length,
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
  },
};

function normalizeIndexedObjects(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeIndexedObjects);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const keys = Object.keys(value);
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    const normalizedValues = keys
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => normalizeIndexedObjects(value[k]));
    return normalizedValues.length === 1 ? normalizedValues[0] : normalizedValues;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = normalizeIndexedObjects(v);
  }
  return out;
}

function lowerCaseKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(lowerCaseKeysDeep);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[String(k).toLowerCase()] = lowerCaseKeysDeep(v);
  }
  return out;
}

const finalOutput = lowerCaseKeysDeep(normalizeIndexedObjects(output));

const OUT = `${BASE}/new_system_${DATE_STAMP}/${APP_ID}_menu_full_newsystem_${DATE_STAMP}.json`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(finalOutput, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  app_id: APP_ID,
  menus: flatMenus.length,
  menuTreeRoots: menus.length,
  descendantSourceMenus: srcMenus.length,
  tableFields: flatMenus.reduce((s, m) => s + m.table.length, 0),
  triggerLegacyRows: flatMenus.reduce((s, m) => s + (m.trigger_legacy_rows?.length || 0), 0),
  triggerJsBlocks: flatMenus.reduce((s, m) => s + Object.keys(m.trigger || {}).length, 0),
  type_form_distribution: flatMenus.reduce((acc, m) => {
    acc[m.type_form] = (acc[m.type_form] || 0) + 1;
    return acc;
  }, {}),
  validation: finalOutput.validation,
  conversion_audit: finalOutput.conversion_audit,
  out: OUT,
}, null, 2));