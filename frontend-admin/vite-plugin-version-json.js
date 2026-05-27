import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

/** Emit dist/version.json on each production build for AppVersionMonitor. */
export default function versionJsonPlugin() {
	return {
		name: "version-json",
		apply: "build",
		closeBundle() {
			const outDir = resolve(process.cwd(), "dist");
			const version = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
			writeFileSync(
				resolve(outDir, "version.json"),
				JSON.stringify({ version }, null, 0),
				"utf8",
			);
		},
	};
}
