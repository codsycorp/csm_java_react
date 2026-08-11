/// <reference types="vitest/config" />

import process from "node:process";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import dayjs from "dayjs";
import { defineConfig, loadEnv } from "vite";
import { defineConfig as defineVitestConfig } from "vitest/config";
import { checker } from "vite-plugin-checker";
import svgrPlugin from "vite-plugin-svgr";
import path from "path";
import compression from "vite-plugin-compression";
import { constants as zlibConstants } from "node:zlib";
import autoResourceHints from "./vite-plugin-resource-hints.js";
import versionJsonPlugin from "./vite-plugin-version-json.js";

import { dependencies, devDependencies, name, version } from "./package.json";

const buildVersion = dayjs().format("YYYYMMDDHHmmss");
const __APP_INFO__ = {
	pkg: { dependencies, devDependencies, name, version },
	lastBuildTime: dayjs(new Date()).format("YYYY-MM-DD HH:mm:ss"),
	buildVersion,
};

const isDev = process.env.NODE_ENV === "development";

// https://vitejs.dev/config/
export default defineVitestConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const apiBaseUrl = env.VITE_API_BASE_URL || "http://localhost:9999";

	return {
	base: "/",
	plugins: [
		react(),
		// https://github.com/pd4d10/vite-plugin-svgr#options
		svgrPlugin({
			// https://react-svgr.com/docs/options/
			svgrOptions: {
				plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
				svgoConfig: { floatPrecision: 2 },
			},
		}),
		checker({ typescript: true, terminal: false, enableBuild: false }),
		codeInspectorPlugin({ bundler: "vite" }),
		// Precompress JS/CSS for faster serving (gzip + brotli)
		compression({ algorithm: "gzip", ext: ".gz", deleteOriginFile: false, threshold: 1024 }),
		compression({ algorithm: "brotliCompress", ext: ".br", deleteOriginFile: false, threshold: 1024 }) as any,
		{
			// Fix CSS preload error by suppressing failed preload warnings in browser when asset hashes mismatch
			name: 'fix-css-preload-error',
			transformIndexHtml: (html) => {
				const preloadFix = `<script>window.addEventListener('vite:preloadError',(e)=>{console.warn('[CSS Preload Fix] Failed to preload CSS, continuing anyway:',e.payload?.message);e.preventDefault?.()},true);</script>`;
				return html.replace('</head>', preloadFix + '\n</head>');
			}
		},
		autoResourceHints(),
		versionJsonPlugin({ version: buildVersion }),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: "happy-dom",
		setupFiles: ["./src/setupTests.ts"],
	},
	server: {
		port: 3333,
		// https://vitejs.dev/config/server-options#server-proxy
		proxy: {
			"/api": {
				target: apiBaseUrl,
				changeOrigin: true,
				rewrite: path => path.replace(/^\/api/, ""),
			},
		},
		hmr: {
			// Suppress HMR warnings in development
			overlay: false
		}
	},
	define: {
		__APP_INFO__: JSON.stringify(__APP_INFO__),
	},
	esbuild: {
		drop: isDev ? [] : ["console", "debugger"],
		legalComments: "none",
	},
	build: {
		outDir: "dist",
		sourcemap: false,
		reportCompressedSize: false,
		target: "es2015",
		minify: "terser",
		terserOptions: {
			compress: {
				drop_console: !isDev,
				drop_debugger: !isDev,
				pure_funcs: isDev ? [] : ["console.log", "console.info", "console.debug"],
			},
		},
		cssCodeSplit: true,
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
		  output: {
			assetFileNames: "web/assets/[name].[hash].[ext]",
			chunkFileNames: "web/assets/[name].[hash].js",
			entryFileNames: "web/assets/[name].[hash].js",
			// Split heavy vendor modules to keep first-paint bundle lean for SSR pages.
			manualChunks: (id) => {
				if (!id.includes("node_modules")) return;

				if (id.includes("node_modules/react") ||
					id.includes("node_modules/react-dom") ||
					id.includes("node_modules/antd") ||
					id.includes("node_modules/@ant-design")) {
					return "ui-core";
				}
				if (id.includes("node_modules/@codemirror") ||
					id.includes("node_modules/@uiw/react-codemirror") ||
					id.includes("node_modules/react-quill") ||
					id.includes("node_modules/quill")) {
					return "editor";
				}
				if (id.includes("node_modules/echarts") ||
					id.includes("node_modules/echarts-for-react")) {
					return "charts";
				}
				if (id.includes("node_modules/docxtemplater") ||
					id.includes("node_modules/jszip") ||
					id.includes("node_modules/xlsx") ||
					id.includes("node_modules/pdfjs-dist") ||
					id.includes("node_modules/html2pdf.js")) {
					return "office";
				}
				if (id.includes("node_modules/@fullcalendar")) {
					return "calendar";
				}
			},
		  },
		  external: [],
		},
	},
	};
});
