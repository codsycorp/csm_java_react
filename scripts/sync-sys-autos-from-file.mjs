#!/usr/bin/env node
/**
 * Push a local JS/HTML template into sys_autos (p_type=0) via update-table-data API.
 *
 * Usage:
 *   node scripts/sync-sys-autos-from-file.mjs \
 *     --file lmkt/src/api/ai/auto-kqxs.js \
 *     --name broadcast_kqxs \
 *     --api https://api.csmbridge.net \
 *     --token "$CSM_TOKEN"
 *
 * Optional env: CSM_TOKEN, CSM_REFRESH_TOKEN, CSM_CSRF_TOKEN, CSM_CLIENT_ID
 */

import fs from "node:fs";
import path from "node:path";

const PHONE = "0937.528.839";
const WRITEBY = "base._co.osa";

function strtr(str, from, to) {
  if (from.length !== to.length) return str;
  const map = {};
  for (let i = 0; i < from.length; i += 1) map[from[i]] = to[i];
  let out = "";
  for (let i = 0; i < str.length; i += 1) out += map[str[i]] ?? str[i];
  return out;
}

function csmEncrypt(code) {
  const base64 = Buffer.from(code, "utf8").toString("base64");
  return strtr(base64, PHONE + WRITEBY, WRITEBY + PHONE);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") out.file = argv[++i];
    else if (arg === "--name") out.name = argv[++i];
    else if (arg === "--api") out.api = argv[++i];
    else if (arg === "--token") out.token = argv[++i];
    else if (arg === "--type") out.type = Number(argv[++i]);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const filePath = args.file;
  const pName = args.name;
  const apiBase = String(args.api || process.env.CSM_API_BASE || "https://api.csmbridge.net").replace(/\/+$/, "");
  const token = args.token || process.env.CSM_TOKEN || "";

  if (!filePath || !pName) {
    console.error("Missing --file and/or --name");
    process.exit(1);
  }
  if (!token) {
    console.error("Missing --token or CSM_TOKEN env");
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const source = fs.readFileSync(abs, "utf8");
  const encrypted = csmEncrypt(source);
  const endpoint = `${apiBase}/update-table-data`;

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "csm-token": token,
    "csm-lang": "vi-VN",
  };
  if (process.env.CSM_REFRESH_TOKEN) headers["X-Refresh-Token"] = process.env.CSM_REFRESH_TOKEN;
  if (process.env.CSM_CSRF_TOKEN) headers["X-CSRF-Token"] = process.env.CSM_CSRF_TOKEN;
  if (process.env.CSM_CLIENT_ID) headers["X-Client-Id"] = process.env.CSM_CLIENT_ID;

  const payload = {
    app_id: "csm",
    obj_name: "sys_autos",
    command: "update",
    pk_fields: ["p_name", "p_type"],
    obj_update: {
      p_name: pName,
      p_type: Number.isFinite(args.type) ? args.type : 0,
      p_code: encrypted,
    },
    e_where: {
      operator: "AND",
      conditions: [
        { field: "p_name", type: "eq", value: pName },
        { field: "p_type", type: "eq", value: Number.isFinite(args.type) ? args.type : 0 },
      ],
    },
  };

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }

  if (!resp.ok || parsed?.success === false) {
    console.error("Sync failed:", resp.status, parsed);
    process.exit(1);
  }

  console.log(`OK: synced ${abs} -> sys_autos.p_name=${pName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
