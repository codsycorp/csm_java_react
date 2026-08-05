import { TanstackQuery } from "#src/components";
import { setupI18n } from "#src/locales";
import { setupLoading } from "#src/plugins";
import { setupRouter } from "#src/router";
import { ensureBrowserClientId, ensureTabSessionId } from "#src/utils/browser-client-id";
import "#src/utils/chatHelpers"; // Import để expose chat helpers lên window

// import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import App from "./app";
import "./styles/index.css";
import "./styles/responsive-table.css";

async function setupApp() {
	ensureBrowserClientId();
	ensureTabSessionId();
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
