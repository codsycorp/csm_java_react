/**
 * Vite Plugin: Auto Inject Preload/Prefetch Hints
 * Automatically adds resource hints to index.html based on build output
 */

export default function autoResourceHints(options = {}) {
	/** e.g. "/admin/assets" — prefix for rollup output paths, NOT vite router base */
	const assetPrefix = String(options.assetPrefix ?? "/admin/assets").replace(/\/$/, "");

	return {
		name: 'auto-resource-hints',
		enforce: 'post',

		transformIndexHtml(html, ctx) {
			if (!ctx.bundle) return html;

			const criticalChunks = ['ui-core', 'react-router'];
			const prefetchChunks = [];

			let preloadTags = '';
			let prefetchTags = '';

			for (const [fileName, chunk] of Object.entries(ctx.bundle)) {
				if (chunk.type !== 'chunk') continue;

				const chunkName = chunk.name || '';
				const assetPath = fileName.startsWith('/')
					? fileName
					: `/${fileName}`.replace(/\/{2,}/g, '/');

				if (criticalChunks.some(name => chunkName.includes(name))) {
					if (fileName.endsWith('.js')) {
						preloadTags += `\n    <link rel="modulepreload" href="${assetPath}" as="script" crossorigin />`;
					} else if (fileName.endsWith('.css')) {
						preloadTags += `\n    <link rel="preload" href="${assetPath}" as="style" />`;
					}
				}

				if (prefetchChunks.some(name => chunkName.includes(name))) {
					if (fileName.endsWith('.js')) {
						prefetchTags += `\n    <link rel="prefetch" href="${assetPath}" as="script" />`;
					}
				}
			}

			const hints = `${preloadTags}${prefetchTags}`;
			return html.replace('</head>', `${hints}\n  </head>`);
		},
	};
}
