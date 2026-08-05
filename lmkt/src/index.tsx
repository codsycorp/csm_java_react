import { TanstackQuery } from "#src/components";
import { setupI18n } from "#src/locales";
import { setupLoading } from "#src/plugins";
import { setupRouter } from "#src/router";
import suppressDevelopmentWarnings from "#src/utils/suppressWarnings";
// Initialize crypto functions (expose to window for auto-upload)
import "#src/components/CsmCrypto";

// import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import App from "./app";
import "./styles/index.css";

// Initialize development warning suppression
suppressDevelopmentWarnings();

// Suppress findDOMNode warnings from Ant Design components
// [PROD] Removed custom console.warn/error overrides for findDOMNode

async function setupApp() {
	// Legacy SSR injected raw HTML before #root; React owns visible UI via __INITIAL_REACT_DATA__.
	document.getElementById("ssr-fallback")?.remove();

	// App Loading
	setupLoading();

	/* setupI18n 必须放在 setupRouter 前面 */
	setupI18n();

	/* setupRouter 使用了 setupI18n，所以必须放在 setupI18n 后面 */
	await setupRouter();

	const rootElement = document.getElementById("root");
	if (!rootElement)
		return;
	const app = (
		// <StrictMode>
		<TanstackQuery>
			<App />
		</TanstackQuery>
		// </StrictMode>
	);

	if (rootElement.hasChildNodes()) {
		hydrateRoot(rootElement, app);
		return;
	}

	const root = createRoot(rootElement);
	root.render(app);
}

setupApp();
