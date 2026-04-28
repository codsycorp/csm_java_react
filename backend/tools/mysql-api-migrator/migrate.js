#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dns = require("dns");
const mysql = require("mysql2/promise");

function getArg(name) {
  const idx = process.argv.findIndex((a) => a === name || a.startsWith(name + "="));
  if (idx === -1) return null;
  const direct = process.argv[idx];
  if (direct.includes("=")) return direct.split("=").slice(1).join("=");
  return process.argv[idx + 1] || null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) throw new Error("Missing api.base_url in config");
  return String(baseUrl).replace(/\/+$/, "");
}

function joinUrl(base, endpointPath) {
  const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  return `${base}${cleanPath}`;
}

function normalizeRowValue(value) {
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return value;
}

function readConfigArray(obj, ...keys) {
  for (const key of keys) {
    if (Array.isArray(obj && obj[key])) {
      return obj[key];
    }
  }
  return [];
}

function pickTargetObjectName(tableCfg) {
  return tableCfg.target_obj_name || tableCfg.target_table || tableCfg.source_table;
}

function hasConfiguredFieldSelection(tableCfg) {
  return readConfigArray(tableCfg, "include_columns", "include_fields").length > 0;
}

function collectMenuItems(menuDoc) {
  if (Array.isArray(menuDoc && menuDoc.menus_flat)) {
    return menuDoc.menus_flat;
  }

  const out = [];
  const visit = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      out.push(item);
      visit(item.children);
    }
  };
  visit(menuDoc && menuDoc.menus);
  return out;
}

function buildMenuFieldMap(menuDoc) {
  const fieldMap = new Map();
  for (const item of collectMenuItems(menuDoc)) {
    const tableName = isNonEmptyString(item && item.table_name) ? item.table_name.trim() : "";
    if (!tableName) continue;

    const tableFields = Array.isArray(item.table) ? item.table : [];
    if (tableFields.length === 0 && !isNonEmptyString(item.field_root)) continue;

    if (!fieldMap.has(tableName)) {
      fieldMap.set(tableName, new Set());
    }
    const bucket = fieldMap.get(tableName);

    for (const field of tableFields) {
      const fieldName = isNonEmptyString(field && field.f_name) ? field.f_name.trim() : "";
      if (fieldName) bucket.add(fieldName);
    }

    if (isNonEmptyString(item.field_root)) {
      bucket.add(item.field_root.trim());
    }
  }

  return new Map(
    Array.from(fieldMap.entries()).map(([tableName, fields]) => [tableName, Array.from(fields)])
  );
}

function findLatestNewSystemMenuFile(globalCfg) {
  const configuredPath = isNonEmptyString(globalCfg.menu_config_path) ? globalCfg.menu_config_path.trim() : "";
  if (configuredPath) {
    const resolved = path.resolve(process.cwd(), configuredPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Configured menu_config_path not found: ${resolved}`);
    }
    return resolved;
  }

  const appId = isNonEmptyString(globalCfg.app_id) ? globalCfg.app_id.trim() : "";
  const dataDir = isNonEmptyString(globalCfg.data_dir) ? globalCfg.data_dir.trim() : "";
  if (!appId || !dataDir) return "";

  const publicRoot = path.resolve(process.cwd(), dataDir, "public", appId);
  if (!fs.existsSync(publicRoot)) return "";

  const candidates = [];
  for (const entry of fs.readdirSync(publicRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("new_system_")) continue;
    const dirPath = path.join(publicRoot, entry.name);
    for (const child of fs.readdirSync(dirPath, { withFileTypes: true })) {
      if (!child.isFile()) continue;
      if (!child.name.startsWith(`${appId}_menu_full_newsystem_`)) continue;
      if (!child.name.endsWith(".json")) continue;
      candidates.push(path.join(dirPath, child.name));
    }
  }

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => a.localeCompare(b));
  return candidates[candidates.length - 1];
}

function applyMenuInferredIncludeFields(globalCfg, tableList) {
  const menuFile = findLatestNewSystemMenuFile(globalCfg);
  if (!menuFile) {
    return { menuFile: "", appliedTables: 0, fieldMapSize: 0 };
  }

  const menuDoc = JSON.parse(fs.readFileSync(menuFile, "utf8"));
  const fieldMap = buildMenuFieldMap(menuDoc);
  let appliedTables = 0;

  for (const tableCfg of tableList) {
    if (hasConfiguredFieldSelection(tableCfg)) continue;
    const objName = pickTargetObjectName(tableCfg);
    const inferredFields = fieldMap.get(objName);
    if (!Array.isArray(inferredFields) || inferredFields.length === 0) continue;
    tableCfg.include_fields = inferredFields;
    appliedTables += 1;
  }

  return { menuFile, appliedTables, fieldMapSize: fieldMap.size };
}

function normalizePkFieldList(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    const value = String(item == null ? "" : item).trim();
    if (!value) continue;
    out.push(value);
  }
  return Array.from(new Set(out));
}

function hasAnyPrimaryKeyValue(record, pkFields) {
  if (!record || typeof record !== "object") return false;
  if (!Array.isArray(pkFields) || pkFields.length === 0) return true;
  for (const pk of pkFields) {
    const value = record[pk];
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return true;
  }
  return false;
}

function canSkipPkValidationForCreate(command, record, pkFields) {
  if (String(command).toLowerCase() !== "create") return false;
  if (!Array.isArray(pkFields) || pkFields.length !== 1) return false;
  if (String(pkFields[0]).trim() !== "id") return false;
  const idValue = record ? record.id : undefined;
  return idValue == null || String(idValue).trim().length === 0;
}

function sanitizePathSegment(segment, label) {
  const raw = String(segment == null ? "" : segment).trim();
  if (!raw) {
    throw new Error(`${label} cannot be empty`);
  }
  const s = raw.toLowerCase();
  if (s.includes("/") || s.includes("\\") || s.includes("\0") || s === "." || s === ".." || s.includes("..")) {
    throw new Error(`${label} contains invalid path traversal characters: ${segment}`);
  }
  return s;
}

function encodeURIComponentJavaStrict(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function javaUrlEncode(value) {
  return encodeURIComponentJavaStrict(String(value == null ? "" : value)).replace(/%20/g, "+");
}

function generateStorageKey(tableName, record, primaryKeys) {
  if (String(tableName).toLowerCase() === "index") {
    const idValue = record && record.id != null ? String(record.id) : "";
    if (!idValue.trim()) {
      throw new Error("Missing required id for index table record");
    }
    return javaUrlEncode(idValue);
  }

  const keyFields = normalizePkFieldList(primaryKeys);
  const fields = keyFields.length > 0 ? keyFields : ["id"];
  return fields.map((k) => javaUrlEncode(record && record[k] != null ? String(record[k]) : "")).join(":");
}

function buildLegacyKeyCandidates(appId, tableName, canonicalKey) {
  if (!canonicalKey) return [];
  const candidates = [
    canonicalKey,
    `${tableName}_${canonicalKey}`,
    `${appId}_${tableName}_${canonicalKey}`
  ];
  return Array.from(new Set(candidates));
}

function loadRocksDbFactory() {
  try {
    return require("rocksdb");
  } catch (err) {
    throw new Error(
      "Direct RocksDB mode requires 'rocksdb' package. Run: cd backend/tools/mysql-api-migrator && npm install rocksdb"
    );
  }
}

function createDirectRocksContext(globalCfg) {
  const dataDirRaw =
    globalCfg.data_dir ||
    globalCfg.rocksdb_data_dir ||
    process.env.APP_DATA_DIR ||
    process.env.CSM_DATA_DIR ||
    "";

  const dataDir = String(dataDirRaw).trim();
  if (!dataDir) {
    throw new Error("Missing global.data_dir for direct RocksDB mode");
  }

  return {
    dataDir,
    rocksdbFactory: loadRocksDbFactory(),
    dbMap: new Map()
  };
}

function dbKeyFor(appId, tableName) {
  return `${appId}_${tableName}`;
}

function dbPathFor(dataDir, appId, tableName) {
  return path.join(
    dataDir,
    "database",
    sanitizePathSegment(appId, "app_id"),
    sanitizePathSegment(tableName, "table_name")
  );
}

function rocksdbOpen(db) {
  return new Promise((resolve, reject) => {
    db.open({ createIfMissing: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function rocksdbClose(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function rocksdbGet(db, key) {
  return new Promise((resolve, reject) => {
    db.get(Buffer.from(String(key), "utf8"), { asBuffer: true }, (err, value) => {
      if (!err) {
        resolve(value);
        return;
      }
      const msg = String(err && err.message ? err.message : err);
      if (/notfound/i.test(msg)) {
        resolve(null);
        return;
      }
      reject(err);
    });
  });
}

function rocksdbPut(db, key, valueBuffer) {
  return new Promise((resolve, reject) => {
    db.put(Buffer.from(String(key), "utf8"), valueBuffer, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function rocksdbBatch(db, ops) {
  return new Promise((resolve, reject) => {
    db.batch(ops, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function getOrOpenDirectDb(context, appId, tableName) {
  const safeAppId = sanitizePathSegment(appId, "app_id");
  const safeTableName = sanitizePathSegment(tableName, "table_name");
  const key = dbKeyFor(safeAppId, safeTableName);
  const existing = context.dbMap.get(key);
  if (existing) return existing;

  const dbPath = dbPathFor(context.dataDir, safeAppId, safeTableName);
  fs.mkdirSync(dbPath, { recursive: true });
  const db = context.rocksdbFactory(dbPath);
  await rocksdbOpen(db);

  const opened = {
    appId: safeAppId,
    tableName: safeTableName,
    dbPath,
    db,
    idToStorageKey: new Map(),
    idMapInitialized: false
  };
  context.dbMap.set(key, opened);
  return opened;
}

async function closeAllDirectDbs(context) {
  const entries = Array.from(context.dbMap.values());
  for (const entry of entries) {
    try {
      await rocksdbClose(entry.db);
    } catch (_) {
      // ignore close errors during shutdown path
    }
  }
  context.dbMap.clear();
}

function parseJsonBuffer(bufferValue) {
  if (!bufferValue || !Buffer.isBuffer(bufferValue)) return null;
  try {
    return JSON.parse(bufferValue.toString("utf8"));
  } catch (_) {
    return null;
  }
}

async function scanDbRecords(db, onRecord, maxRecords = Number.MAX_SAFE_INTEGER) {
  const iterator = db.iterator({ keys: true, values: true, keyAsBuffer: true, valueAsBuffer: true });
  let count = 0;
  try {
    while (count < maxRecords) {
      // eslint-disable-next-line no-await-in-loop
      const row = await new Promise((resolve, reject) => {
        iterator.next((err, key, value) => {
          if (err) {
            reject(err);
            return;
          }
          if (key === undefined && value === undefined) {
            resolve(null);
            return;
          }
          resolve({ key, value });
        });
      });

      if (!row) break;
      count += 1;
      // eslint-disable-next-line no-await-in-loop
      await onRecord(row.key, row.value);
    }
  } finally {
    await new Promise((resolve) => iterator.end(() => resolve()));
  }
}

async function ensureIdMapInitialized(dbEntry, options) {
  if (dbEntry.idMapInitialized) return;
  dbEntry.idMapInitialized = true;

  const enableLookup = Boolean(options.resolve_storage_key_by_id);
  if (!enableLookup) return;

  const maxScan = Number(options.id_scan_max_records || 500000);
  await scanDbRecords(dbEntry.db, async (keyBuf, valueBuf) => {
    const key = keyBuf.toString("utf8");
    if (key.startsWith("__meta_")) return;
    const row = parseJsonBuffer(valueBuf);
    if (!row || row.id == null) return;
    const idValue = String(row.id).trim();
    if (!idValue) return;
    if (!dbEntry.idToStorageKey.has(idValue)) {
      dbEntry.idToStorageKey.set(idValue, key);
    }
  }, maxScan);
}

async function resolveExistingStorageKeyDirect(db, appId, tableName, canonicalKey) {
  const candidates = buildLegacyKeyCandidates(appId, tableName, canonicalKey);
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const value = await rocksdbGet(db, candidate);
    if (value != null) {
      return candidate;
    }
  }
  return canonicalKey;
}

async function resolveStorageKeyByIdDirect(dbEntry, idValue, options) {
  const id = String(idValue == null ? "" : idValue).trim();
  if (!id) return null;

  await ensureIdMapInitialized(dbEntry, options);
  return dbEntry.idToStorageKey.get(id) || null;
}

async function incrementMetaCountDirect(db, delta) {
  const metaKey = "__meta_totalCount";
  const currentRaw = await rocksdbGet(db, metaKey);
  const current = Number(currentRaw ? String(currentRaw.toString("utf8")) : "0") || 0;
  const next = current + Number(delta || 0);
  await rocksdbPut(db, metaKey, Buffer.from(String(next), "utf8"));
}

async function applyDirectOperation(dbEntry, appId, tableName, command, record, pkFields, directOptions) {
  const normalizedCommand = String(command || "create").toLowerCase();
  const row = { ...record };

  if (String(tableName).toLowerCase() !== "index") {
    const idRaw = row.id;
    if (idRaw == null || String(idRaw).trim().length === 0) {
      row.id = crypto.randomUUID();
    }
  }

  const db = dbEntry.db;
  const canonicalKey = generateStorageKey(tableName, row, pkFields);
  const keyById = await resolveStorageKeyByIdDirect(dbEntry, row.id, directOptions);
  const keyToPersist = keyById || (await resolveExistingStorageKeyDirect(db, appId, tableName, canonicalKey));

  if (normalizedCommand === "delete") {
    const existed = await rocksdbGet(db, keyToPersist);
    if (existed == null) {
      return { status: "skipped", resolvedCommand: "delete" };
    }
    await rocksdbBatch(db, [
      { type: "del", key: Buffer.from(String(keyToPersist), "utf8") }
    ]);
    await incrementMetaCountDirect(db, -1);
    if (row.id != null) {
      dbEntry.idToStorageKey.delete(String(row.id));
    }
    return { status: "ok", resolvedCommand: "delete" };
  }

  const existing = await rocksdbGet(db, keyToPersist);
  const resolvedCommand = existing != null ? "update" : "create";

  const ops = [];
  if (resolvedCommand === "update" && keyById && keyById !== canonicalKey) {
    ops.push({ type: "del", key: Buffer.from(String(canonicalKey), "utf8") });
  }

  ops.push({
    type: "put",
    key: Buffer.from(String(keyToPersist), "utf8"),
    value: Buffer.from(JSON.stringify(row), "utf8")
  });

  if (resolvedCommand === "update" && keyById && keyById !== keyToPersist) {
    ops.push({ type: "del", key: Buffer.from(String(keyById), "utf8") });
  }

  await rocksdbBatch(db, ops);

  if (resolvedCommand === "create") {
    await incrementMetaCountDirect(db, 1);
  }

  if (row.id != null) {
    dbEntry.idToStorageKey.set(String(row.id), keyToPersist);
  }

  return {
    status: "ok",
    resolvedCommand,
    storageKey: keyToPersist
  };
}

async function fetchLocalTableStructFromRocks(context, appId, objName) {
  try {
    const indexDb = await getOrOpenDirectDb(context, appId, "index");
    const key = javaUrlEncode(objName);
    const value = await rocksdbGet(indexDb.db, key);
    const row = parseJsonBuffer(value);
    const struct = row && typeof row.struct === "object" ? row.struct : null;
    if (!struct) {
      return { exists: false, fieldsPK: [], fieldsSearch: [] };
    }
    return {
      exists: true,
      fieldsPK: normalizePkFieldList(struct.fieldsPK),
      fieldsSearch: normalizePkFieldList(struct.fieldsSearch)
    };
  } catch (_) {
    return { exists: false, fieldsPK: [], fieldsSearch: [] };
  }
}

function createMysqlConnectionOptions(mysqlCfg) {
  const host = isNonEmptyString(mysqlCfg.host) ? mysqlCfg.host.trim() : "";
  const user = isNonEmptyString(mysqlCfg.user) ? mysqlCfg.user.trim() : "";
  const database = isNonEmptyString(mysqlCfg.database) ? mysqlCfg.database.trim() : "";
  if (!host) throw new Error("Missing mysql.host in config");
  if (!user) throw new Error("Missing mysql.user in config");
  if (!database) throw new Error("Missing mysql.database in config");

  const options = {
    host,
    port: Number(mysqlCfg.port || 3306),
    user,
    password: mysqlCfg.password,
    charset: mysqlCfg.charset || "utf8mb4",
    connectTimeout: Number(mysqlCfg.connect_timeout_ms || 15000),
    decimalNumbers: mysqlCfg.decimal_numbers !== false,
    dateStrings: mysqlCfg.date_strings === true,
    supportBigNumbers: mysqlCfg.support_big_numbers !== false,
    bigNumberStrings: mysqlCfg.big_number_strings !== false
  };

  if (database) {
    options.database = database;
  }

  if (isNonEmptyString(mysqlCfg.timezone)) {
    options.timezone = mysqlCfg.timezone.trim();
  }

  if (mysqlCfg.ssl && typeof mysqlCfg.ssl === "object") {
    const ssl = { ...mysqlCfg.ssl };
    if (isNonEmptyString(ssl.ca_file)) {
      ssl.ca = fs.readFileSync(path.resolve(process.cwd(), ssl.ca_file), "utf8");
      delete ssl.ca_file;
    }
    if (isNonEmptyString(ssl.cert_file)) {
      ssl.cert = fs.readFileSync(path.resolve(process.cwd(), ssl.cert_file), "utf8");
      delete ssl.cert_file;
    }
    if (isNonEmptyString(ssl.key_file)) {
      ssl.key = fs.readFileSync(path.resolve(process.cwd(), ssl.key_file), "utf8");
      delete ssl.key_file;
    }
    options.ssl = ssl;
  }

  return options;
}

async function resolveHostMaybeIPv4(host, mysqlCfg) {
  if (!host) return host;
  if (mysqlCfg.force_ipv4 === false) return host;
  try {
    const result = await dns.promises.lookup(host, { family: 4 });
    if (result && result.address) {
      return result.address;
    }
  } catch (_) {
    // Fallback to original host if DNS lookup fails.
  }
  return host;
}

async function connectMysqlWithFallback(mysqlCfg) {
  const mysqlOptions = createMysqlConnectionOptions(mysqlCfg);
  mysqlOptions.host = await resolveHostMaybeIPv4(mysqlOptions.host, mysqlCfg);
  const database = isNonEmptyString(mysqlCfg.database) ? mysqlCfg.database.trim() : "";
  const escapedDb = database.replace(/`/g, "``");
  const preferConnectWithoutDatabaseFirst = mysqlCfg.connect_without_database_first === true;

  const attempts = [];
  if (database) {
    const withDatabaseOptions = { ...mysqlOptions, database };
    const withoutDatabaseOptions = { ...mysqlOptions };
    delete withoutDatabaseOptions.database;

    if (preferConnectWithoutDatabaseFirst) {
      attempts.push({ options: withoutDatabaseOptions, useDatabaseAfterConnect: true });
      attempts.push({ options: withDatabaseOptions, useDatabaseAfterConnect: false });
    } else {
      attempts.push({ options: withDatabaseOptions, useDatabaseAfterConnect: false });
      attempts.push({ options: withoutDatabaseOptions, useDatabaseAfterConnect: true });
    }
  } else {
    attempts.push({ options: mysqlOptions, useDatabaseAfterConnect: false });
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const conn = await mysql.createConnection(attempt.options);
      if (database && attempt.useDatabaseAfterConnect) {
        await conn.query(`USE \`${escapedDb}\``);
      }
      return conn;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    throw lastError;
  }

  try {
    const conn = await mysql.createConnection(mysqlOptions);
    if (database && !mysqlOptions.database) {
      await conn.query(`USE \`${escapedDb}\``);
    }
    return conn;
  } catch (err) {
    throw err;
  }
}

async function getPrimaryKeyFields(connection, schemaName, tableName) {
  const sql = `
    SELECT k.COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS t
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
      ON t.CONSTRAINT_NAME = k.CONSTRAINT_NAME
     AND t.TABLE_SCHEMA = k.TABLE_SCHEMA
     AND t.TABLE_NAME = k.TABLE_NAME
    WHERE t.TABLE_SCHEMA = ?
      AND t.TABLE_NAME = ?
      AND t.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ORDER BY k.ORDINAL_POSITION
  `;
  const [rows] = await connection.query(sql, [schemaName, tableName]);
  return rows.map((r) => String(r.column_name));
}

async function inspectMysqlConnection(connection, mysqlCfg, tableList) {
  const [metaRows] = await connection.query(
    "SELECT DATABASE() AS current_database, @@hostname AS host_name, @@port AS host_port, @@version AS version, @@time_zone AS time_zone, @@system_time_zone AS system_time_zone"
  );
  const meta = metaRows[0] || {};

  const [countRows] = await connection.query(
    "SELECT COUNT(*) AS table_count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
    [mysqlCfg.database]
  );
  const tableCount = Number((countRows[0] && countRows[0].table_count) || 0);

  const tableReport = [];
  for (const cfg of tableList) {
    const sourceTable = cfg.source_table;
    if (!isNonEmptyString(sourceTable)) continue;

    const [existsRows] = await connection.query(
      "SELECT TABLE_ROWS AS table_rows FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [mysqlCfg.database, sourceTable]
    );
    const exists = existsRows.length > 0;
    const dbPrimaryKeys = exists ? await getPrimaryKeyFields(connection, mysqlCfg.database, sourceTable) : [];
    const configuredPk = Array.isArray(cfg.pk_fields) ? cfg.pk_fields.map((x) => String(x)) : [];
    const pkMismatch = dbPrimaryKeys.length > 0
      ? JSON.stringify(configuredPk) !== JSON.stringify(dbPrimaryKeys)
      : false;

    tableReport.push({
      source_table: sourceTable,
      exists,
      estimated_rows: exists ? Number(existsRows[0].table_rows || 0) : 0,
      configured_pk_fields: configuredPk,
      db_pk_fields: dbPrimaryKeys,
      pk_mismatch: pkMismatch
    });
  }

  return {
    mysql: {
      host: mysqlCfg.host,
      port: Number(mysqlCfg.port || 3306),
      database: mysqlCfg.database,
      user: mysqlCfg.user,
      server_host: meta.host_name,
      server_port: meta.host_port,
      version: meta.version,
      time_zone: meta.time_zone,
      system_time_zone: meta.system_time_zone,
      table_count: tableCount
    },
    table_report: tableReport,
    missing_tables: tableReport.filter((t) => !t.exists).map((t) => t.source_table),
    pk_mismatch_tables: tableReport.filter((t) => t.pk_mismatch).map((t) => t.source_table)
  };
}

function syncPkFieldsFromInspection(config, inspection) {
  const byTable = new Map((inspection.table_report || []).map((t) => [t.source_table, t]));
  let updated = 0;
  for (const tableCfg of config.tables || []) {
    const sourceTable = tableCfg.source_table;
    const info = byTable.get(sourceTable);
    if (!info || !info.exists || !Array.isArray(info.db_pk_fields) || info.db_pk_fields.length === 0) {
      continue;
    }
    const current = Array.isArray(tableCfg.pk_fields) ? tableCfg.pk_fields.map((x) => String(x)) : [];
    if (JSON.stringify(current) !== JSON.stringify(info.db_pk_fields)) {
      tableCfg.pk_fields = info.db_pk_fields;
      updated += 1;
    }
  }
  return updated;
}

function mapRowKeys(inputRow, tableCfg, globalCfg) {
  const row = {};
  for (const [k, v] of Object.entries(inputRow)) {
    row[k] = normalizeRowValue(v);
  }

  const mapped = {};
  const columnMap = tableCfg.column_map || {};

  for (const [sourceKey, value] of Object.entries(row)) {
    const targetKey = columnMap[sourceKey] || sourceKey;
    mapped[targetKey] = value;
  }

  const includeColumns = readConfigArray(tableCfg, "include_columns", "include_fields");
  if (includeColumns.length > 0) {
    const included = {};
    for (const col of includeColumns) {
      if (Object.prototype.hasOwnProperty.call(mapped, col)) included[col] = mapped[col];
    }
    Object.assign(mapped, included);
    for (const key of Object.keys(mapped)) {
      if (!includeColumns.includes(key)) delete mapped[key];
    }
  }

  const excludeColumns = readConfigArray(tableCfg, "exclude_columns", "exclude_fields");
  if (excludeColumns.length > 0) {
    for (const col of excludeColumns) {
      delete mapped[col];
    }
  }

  if (tableCfg.static_fields && typeof tableCfg.static_fields === "object") {
    Object.assign(mapped, tableCfg.static_fields);
  }

  const lower = Boolean(tableCfg.lowercase_keys ?? globalCfg.lowercase_keys);
  if (!lower) return mapped;

  const out = {};
  for (const [k, v] of Object.entries(mapped)) {
    out[String(k).toLowerCase()] = v;
  }
  return out;
}

async function apiRequest(baseUrl, endpointPath, payload, auth) {
  const url = joinUrl(baseUrl, endpointPath);
  const headers = {
    "Content-Type": "application/json"
  };

  if (auth && auth.bearerToken) {
    headers.Authorization = `Bearer ${auth.bearerToken}`;
  }
  if (auth && auth.csmToken) {
    headers["csm-token"] = auth.csmToken;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  const json = safeJsonParse(text);

  if (!response.ok) {
    const errMsg = json && json.message ? json.message : text;
    throw new Error(`API ${endpointPath} failed (${response.status}): ${errMsg}`);
  }

  if (!json) {
    throw new Error(`API ${endpointPath} returned non-JSON response`);
  }

  return json;
}

async function resolveAuth(apiCfg, baseUrl) {
  if (apiCfg.token && String(apiCfg.token).trim()) {
    return { bearerToken: String(apiCfg.token).trim(), csmToken: "" };
  }

  if (apiCfg.csm_token && String(apiCfg.csm_token).trim()) {
    return { bearerToken: "", csmToken: String(apiCfg.csm_token).trim() };
  }

  const login = apiCfg.login || {};
  if (!login.username || !login.password) {
    return { bearerToken: "", csmToken: "" };
  }

  const loginPath = apiCfg.login_path || "/login";
  const loginRes = await apiRequest(baseUrl, loginPath, {
    username: login.username,
    password: login.password
  }, null);

  const token = loginRes.token || (loginRes.data && loginRes.data.token) || "";
  if (!token) {
    throw new Error("Login successful but token was not found in response");
  }

  return { bearerToken: String(token), csmToken: "" };
}

async function fetchPage(connection, tableCfg, offset, limit) {
  if (tableCfg.select_sql && String(tableCfg.select_sql).trim()) {
    const sql = `${String(tableCfg.select_sql).trim()} LIMIT ? OFFSET ?`;
    const [rows] = await connection.query(sql, [limit, offset]);
    return rows;
  }

  const table = tableCfg.source_table;
  if (!table) throw new Error("Missing source_table in table config");

  const whereSql = tableCfg.where ? ` WHERE ${tableCfg.where}` : "";
  const orderSql = tableCfg.order_by ? ` ORDER BY ${tableCfg.order_by}` : "";
  const sql = `SELECT * FROM \`${table}\`${whereSql}${orderSql} LIMIT ? OFFSET ?`;
  const [rows] = await connection.query(sql, [limit, offset]);
  return rows;
}

async function fetchRemoteTableStruct(baseUrl, auth, apiCfg, appId, objName) {
  const getTablePath = apiCfg.get_table_data_path || "/get-table-data";
  const payload = {
    app_id: appId,
    obj_name: "index",
    e_where: {
      field: "id",
      type: "eq",
      value: objName
    }
  };

  try {
    const res = await apiRequest(baseUrl, getTablePath, payload, auth);
    const rows = Array.isArray(res.rows) ? res.rows : [];
    if (rows.length === 0) {
      return {
        exists: false,
        fieldsPK: [],
        fieldsSearch: []
      };
    }
    const row = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
    const struct = row.struct && typeof row.struct === "object" ? row.struct : {};
    return {
      exists: true,
      fieldsPK: normalizePkFieldList(struct.fieldsPK),
      fieldsSearch: normalizePkFieldList(struct.fieldsSearch)
    };
  } catch (_) {
    return {
      exists: false,
      fieldsPK: [],
      fieldsSearch: []
    };
  }
}

function resolveEffectivePkFields(tableCfg, remoteStruct, inspectPkFields) {
  const configured = normalizePkFieldList(tableCfg.pk_fields);
  const remote = normalizePkFieldList(remoteStruct ? remoteStruct.fieldsPK : []);
  const mysqlPk = normalizePkFieldList(inspectPkFields);

  if (remote.length > 0) {
    return {
      source: "remote_struct",
      pkFields: remote,
      configuredPk: configured,
      mysqlPk
    };
  }

  if (configured.length > 0) {
    return {
      source: "config",
      pkFields: configured,
      configuredPk: configured,
      mysqlPk
    };
  }

  if (mysqlPk.length > 0) {
    return {
      source: "mysql",
      pkFields: mysqlPk,
      configuredPk: configured,
      mysqlPk
    };
  }

  return {
    source: "default",
    pkFields: ["id"],
    configuredPk: configured,
    mysqlPk
  };
}

async function migrateTable(connection, globalCfg, apiCfg, tableCfg, options) {
  const appId = tableCfg.app_id || globalCfg.app_id;
  const objName = pickTargetObjectName(tableCfg);
  const command = String(tableCfg.command || globalCfg.default_command || "create").toLowerCase();
  const batchSize = Number(tableCfg.batch_size || globalCfg.batch_size || 300);
  const continueOnError = Boolean(globalCfg.continue_on_error);
  const stopOnFailedBatch = Boolean(globalCfg.stop_on_failed_batch ?? true);
  const pkFields = normalizePkFieldList(tableCfg.effective_pk_fields || tableCfg.pk_fields);
  const strictPkValidation = Boolean(tableCfg.strict_pk_validation ?? globalCfg.strict_pk_validation ?? true);
  const bulkPath = apiCfg.bulk_update_path || "/bulk-update-table-data";
  const transport = String(options.transport || "api").toLowerCase();

  if (!appId) throw new Error(`Missing app_id for table ${objName}`);

  let offset = 0;
  let totalRead = 0;
  let totalOk = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  while (true) {
    const rows = await fetchPage(connection, tableCfg, offset, batchSize);
    if (!rows || rows.length === 0) break;

    totalRead += rows.length;

    const operations = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const mappedRow = mapRowKeys(rows[rowIndex], tableCfg, globalCfg);
      if (!hasAnyPrimaryKeyValue(mappedRow, pkFields) && !canSkipPkValidationForCreate(command, mappedRow, pkFields)) {
        if (strictPkValidation) {
          throw new Error(
            `[${objName}] Row missing all PK values (${pkFields.join(", ")}) at batch offset=${offset}, rowIndex=${rowIndex}`
          );
        }
        totalSkipped += 1;
        continue;
      }
      operations.push({
        command,
        obj_update: mappedRow
      });
    }

    if (operations.length === 0) {
      offset += rows.length;
      if (rows.length < batchSize) break;
      continue;
    }

    const payload = {
      app_id: appId,
      obj_name: objName,
      pk_fields: pkFields,
      continue_on_error: continueOnError,
      operations
    };

    let successCount = 0;
    let failedCount = 0;

    if (options.dryRun) {
      successCount = operations.length;
    } else if (transport === "rocksdb") {
      const dbEntry = await getOrOpenDirectDb(options.directContext, appId, objName);
      for (const op of operations) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await applyDirectOperation(
            dbEntry,
            appId,
            objName,
            op.command,
            op.obj_update,
            pkFields,
            options.directOptions || {}
          );
          if (result.status === "ok") {
            successCount += 1;
          } else {
            failedCount += 1;
          }
        } catch (err) {
          failedCount += 1;
          if (!continueOnError) {
            throw err;
          }
        }
      }
    } else {
      const res = await apiRequest(options.baseUrl, bulkPath, payload, options.auth);
      successCount = Number(res.successCount || 0);
      failedCount = Number(res.failedCount || 0);
    }

    totalOk += successCount;
    totalFailed += failedCount;

    console.log(
      `[${objName}] page=${Math.floor(offset / batchSize) + 1} rows=${rows.length} sent=${operations.length} skipped=${totalSkipped} success=${successCount} failed=${failedCount}`
    );

    if (failedCount > 0 && stopOnFailedBatch) {
      throw new Error(`[${objName}] failedCount=${failedCount}. Stop due to stop_on_failed_batch=true`);
    }

    offset += rows.length;
    if (rows.length < batchSize) break;
  }

  return {
    table: objName,
    source_table: tableCfg.source_table,
    pk_fields: pkFields,
    total_read: totalRead,
    total_skipped: totalSkipped,
    total_success: totalOk,
    total_failed: totalFailed
  };
}

async function main() {
  const cfgPathArg = getArg("--config") || "./config.json";
  const cfgPath = path.resolve(process.cwd(), cfgPathArg);
  const dryRun = hasFlag("--dry-run");
  const checkMysql = hasFlag("--check-mysql");
  const syncPkFields = hasFlag("--sync-pk-fields");

  if (!fs.existsSync(cfgPath)) {
    throw new Error(`Config file not found: ${cfgPath}`);
  }

  const config = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const mysqlCfg = config.mysql || {};
  const apiCfg = config.api || {};
  const globalCfg = config.global || {};
  const tableList = Array.isArray(config.tables) ? config.tables : [];

  if (tableList.length === 0) {
    throw new Error("No tables configured. Add at least one entry in config.tables");
  }

  const inferredFieldConfig = applyMenuInferredIncludeFields(globalCfg, tableList);

  const connection = await connectMysqlWithFallback(mysqlCfg);
  let directContext = null;

  try {
    const inspection = await inspectMysqlConnection(connection, mysqlCfg, tableList);

    if (checkMysql || syncPkFields) {
      let updatedPkTables = 0;
      if (syncPkFields) {
        updatedPkTables = syncPkFieldsFromInspection(config, inspection);
        if (updatedPkTables > 0) {
          fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + "\n", "utf8");
        }
      }

      console.log(JSON.stringify({
        ok: true,
        mode: syncPkFields ? "check-mysql+sync-pk-fields" : "check-mysql",
        updated_pk_tables: updatedPkTables,
        inferred_include_fields: inferredFieldConfig,
        inspection
      }, null, 2));

      if (checkMysql) {
        return;
      }
    }

    const transport = String(globalCfg.transport || "api").toLowerCase();
    const isDirectRocks = transport === "rocksdb" || transport === "direct-rocksdb";

    let baseUrl = "";
    let auth = { bearerToken: "", csmToken: "" };
    if (isDirectRocks) {
      directContext = createDirectRocksContext(globalCfg);
    } else {
      baseUrl = normalizeBaseUrl(apiCfg.base_url);
      auth = dryRun ? { bearerToken: "", csmToken: "" } : await resolveAuth(apiCfg, baseUrl);
    }

    const inspectedByTable = new Map(
      (inspection.table_report || []).map((x) => [String(x.source_table), x])
    );

    const migrationPlan = [];
    for (const tableCfg of tableList) {
      const appId = tableCfg.app_id || globalCfg.app_id;
      const objName = pickTargetObjectName(tableCfg);
      const inspected = inspectedByTable.get(String(tableCfg.source_table || "")) || null;
      const remoteStruct = dryRun
        ? { exists: false, fieldsPK: [], fieldsSearch: [] }
        : (isDirectRocks
          ? await fetchLocalTableStructFromRocks(directContext, appId, objName)
          : await fetchRemoteTableStruct(baseUrl, auth, apiCfg, appId, objName));
      const pkDecision = resolveEffectivePkFields(
        tableCfg,
        remoteStruct,
        inspected && Array.isArray(inspected.db_pk_fields) ? inspected.db_pk_fields : []
      );

      migrationPlan.push({
        tableCfg: {
          ...tableCfg,
          effective_pk_fields: pkDecision.pkFields
        },
        metadata: {
          source_table: tableCfg.source_table,
          target_obj_name: objName,
          app_id: appId,
          source_table_exists: inspected ? Boolean(inspected.exists) : true,
          pk_source: pkDecision.source,
          effective_pk_fields: pkDecision.pkFields,
          configured_pk_fields: pkDecision.configuredPk,
          mysql_pk_fields: pkDecision.mysqlPk,
          remote_struct_exists: Boolean(remoteStruct.exists),
          remote_struct_pk_fields: remoteStruct.fieldsPK,
          remote_struct_search_fields: remoteStruct.fieldsSearch
        }
      });
    }

    const summary = [];
    for (const planItem of migrationPlan) {
      if (planItem.metadata.source_table_exists === false) {
        summary.push({
          table: planItem.metadata.target_obj_name,
          source_table: planItem.metadata.source_table,
          pk_fields: planItem.metadata.effective_pk_fields,
          total_read: 0,
          total_skipped: 0,
          total_success: 0,
          total_failed: 0,
          skipped_missing_source_table: true,
          pk_source: planItem.metadata.pk_source,
          remote_struct_exists: planItem.metadata.remote_struct_exists
        });
        console.log(
          `[${planItem.metadata.target_obj_name}] skipped missing source table ${planItem.metadata.source_table}`
        );
        continue;
      }

      const item = await migrateTable(connection, globalCfg, apiCfg, planItem.tableCfg, {
        dryRun,
        transport: isDirectRocks ? "rocksdb" : "api",
        baseUrl,
        auth,
        directContext,
        directOptions: {
          resolve_storage_key_by_id: Boolean(globalCfg.resolve_storage_key_by_id ?? false),
          id_scan_max_records: Number(globalCfg.id_scan_max_records || 500000)
        }
      });
      item.pk_source = planItem.metadata.pk_source;
      item.remote_struct_exists = planItem.metadata.remote_struct_exists;
      summary.push(item);
    }

    const totals = summary.reduce((acc, item) => {
      acc.total_read += item.total_read;
      acc.total_skipped += Number(item.total_skipped || 0);
      acc.total_success += item.total_success;
      acc.total_failed += item.total_failed;
      return acc;
    }, { total_read: 0, total_skipped: 0, total_success: 0, total_failed: 0 });

    console.log(JSON.stringify({
      ok: true,
      dry_run: dryRun,
      transport: isDirectRocks ? "rocksdb" : "api",
      inferred_include_fields: inferredFieldConfig,
      mysql_inspection: {
        missing_tables: inspection.missing_tables,
        pk_mismatch_tables: inspection.pk_mismatch_tables
      },
      migration_plan: migrationPlan.map((x) => x.metadata),
      totals,
      tables: summary
    }, null, 2));
  } finally {
    if (directContext) {
      await closeAllDirectDbs(directContext);
    }
    await connection.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
