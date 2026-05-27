/// <reference types="vitest/config" />

import process from "node:process";
import react from "@vitejs/plugin-react";
import { codeInspectorPlugin } from "code-inspector-plugin";
import dayjs from "dayjs";
import { defineConfig } from "vite";
import { checker } from "vite-plugin-checker";
import svgrPlugin from "vite-plugin-svgr";
import path from "path";
import compression from "vite-plugin-compression";
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
export default defineConfig({
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
				target: process.env.VITE_API_BASE_URL || "http://localhost:8080",
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
			assetFileNames: "lmkt/assets/[name].[hash].[ext]",
			chunkFileNames: "lmkt/assets/[name].[hash].js",
			entryFileNames: "lmkt/assets/[name].[hash].js",
			// Chỉ tách React + Ant Design vì chúng PHẢI ở cùng nhau
			// Mọi thứ khác để Vite tự động xử lý tránh circular dependency
			manualChunks: (id) => {
				if (id.includes("node_modules/react") ||
					id.includes("node_modules/react-dom") ||
					id.includes("node_modules/antd") ||
					id.includes("node_modules/@ant-design")) {
					return "ui-core";
				}
				// Tất cả vendor khác để Vite tự động bundle
				// KHÔNG tách thủ công để tránh lỗi initialization
			},
		  },
		  // Don't externalize anything for proper bundling
		  external: [],
		},
	},
});
