import { usePreferences } from "#src/hooks";
import PageError from "#src/pages/error/page-error";
import { toggleHtmlClass } from "#src/utils";

import { useEffect } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Outlet } from "react-router";

/**
 * RouterGuards component for route guards - simplified for public website
 *
 * @returns JSX.Element for rendering Outlet component
 */
export function RouterGuards() {
	const { isDark } = usePreferences();

	/* tailwind theme */
	useEffect(() => {
		if (isDark) {
			toggleHtmlClass("dark").add();
		}
		else {
			toggleHtmlClass("dark").remove();
		}
	}, [isDark]);

	return (
		<ErrorBoundary FallbackComponent={PageError}>
			<Outlet />
		</ErrorBoundary>
	);
}
