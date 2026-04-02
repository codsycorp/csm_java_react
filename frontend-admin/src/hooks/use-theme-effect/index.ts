import { useEffect } from "react";
import { usePreferences } from "#src/hooks";

/**
 * Hook để tự động apply theme class cho HTML element
 * và listen cho system theme changes
 */
export function useThemeEffect() {
	const { theme, isDark, isLight } = usePreferences();

	useEffect(() => {
		const html = document.documentElement;
		
		// Remove existing theme classes
		html.classList.remove("dark", "light");
		html.removeAttribute("data-theme");
		
		// Apply new theme
		if (theme === "auto") {
			// Listen for system theme changes
			const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
			
			const handleChange = (e: MediaQueryListEvent) => {
				html.classList.remove("dark", "light");
				html.removeAttribute("data-theme");
				
				if (e.matches) {
					html.classList.add("dark");
					html.setAttribute("data-theme", "dark");
				} else {
					html.classList.add("light");
					html.setAttribute("data-theme", "light");
				}
			};
			
			// Set initial theme
			if (mediaQuery.matches) {
				html.classList.add("dark");
				html.setAttribute("data-theme", "dark");
			} else {
				html.classList.add("light");
				html.setAttribute("data-theme", "light");
			}
			
			// Listen for changes
			mediaQuery.addEventListener("change", handleChange);
			
			return () => {
				mediaQuery.removeEventListener("change", handleChange);
			};
		} else {
			// Manual theme
			if (isDark) {
				html.classList.add("dark");
				html.setAttribute("data-theme", "dark");
			} else if (isLight) {
				html.classList.add("light");
				html.setAttribute("data-theme", "light");
			}
		}
	}, [theme, isDark, isLight]);
}