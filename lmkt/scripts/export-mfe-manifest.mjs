import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const app = "lmkt";
const rpIndex = "lmkt";
const routeBase = "/";
const distDir = join(process.cwd(), "dist");
const assetsRoot = join(distDir, rpIndex, "assets");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      walk(abs, out);
      continue;
    }
    out.push(abs);
  }
  return out;
}

const files = walk(assetsRoot);
const js = files
  .filter((f) => f.endsWith(".js"))
  .map((f) => relative(distDir, f).replaceAll("\\", "/"));
const css = files
  .filter((f) => f.endsWith(".css"))
  .map((f) => relative(distDir, f).replaceAll("\\", "/"));

const entry = js.find((f) => f.includes("index.")) || js[0] || "";

const manifest = {
  schema: "csm.monolith.mfe.v1",
  app,
  rpIndex,
  routeBase,
  hydrate: true,
  entry,
  js,
  css,
  generatedAt: new Date().toISOString(),
};

writeFileSync(join(distDir, "mfe.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[mfe] wrote dist/mfe.manifest.json for ${app}`);
