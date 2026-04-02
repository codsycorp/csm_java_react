import { AntdApp, JSSThemeProvider } from "#src/components";
import { usePreferences, useScrollToHash, useThemeEffect } from "#src/hooks";
import { AppVersionMonitor } from "#src/layout/widgets/version-monitor";
import { ANT_DESIGN_LOCALE } from "#src/locales";
import { initializePerformanceOptimizations } from "#src/utils/performance-optimization";
import { deleteChatMessage } from "#src/components/csm-grid/CsmApi";

import { theme as antdTheme, ConfigProvider } from "antd";
import dayjs from "dayjs";
import { Suspense, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { RouterProvider } from "react-router/dom";

import { router } from "./router";
import { customAntdDarkTheme, customAntdLightTheme } from "./styles/theme/antd/antd-theme";
import "dayjs/locale/zh-cn";
import "dayjs/locale/vi";

export default function App() {
	const { i18n } = useTranslation();
	const { language, isDark, theme, themeColorPrimary, colorBlindMode, colorGrayMode, themeRadius, changeSiteTheme } = usePreferences();

	useScrollToHash();
	
	// Apply theme effect globally
	useThemeEffect();

	// Initialize performance optimizations on mount
	useEffect(() => {
		initializePerformanceOptimizations();
	}, []);

	// Setup global API wrappers for components to use via window object
	useEffect(() => {
		// 🔥 Setup window.deleteChatMessage with proper appId support
		// This wrapper is called from InternalChatBox when deleting messages
		(window as any).deleteChatMessage = (timestamp: number, appId: string = "csm") => {
			return deleteChatMessage(timestamp, appId);
		};

		return () => {
			// Cleanup on unmount
			if ((window as any).deleteChatMessage) {
				delete (window as any).deleteChatMessage;
			}
		};
	}, []);

	/**
	 * ant design internationalization
	 * @link https://ant.design/docs/react/i18n
	 */
	const getAntdLocale = () => {
		return ANT_DESIGN_LOCALE[language];
	};

	/**
	 * day.js internationalization
	 * @link https://day.js.org/docs/en/installation/installation
	 */
	useEffect(() => {
		if (language === "en-US") {
			dayjs.locale("en");
		}
		else if (language === "zh-CN") {
			dayjs.locale("zh-cn");
		}
		else if (language === "vi-VN") {
			dayjs.locale("vi");
		}
	}, [language]);

	/**
	 * react-i18next internationalization
	 * @link https://www.i18next.com/overview/api#changelanguage
	 */
	useEffect(() => {
		i18n.changeLanguage(language);
	}, [language, i18n.changeLanguage]);

	/**
	 * Change theme when the system theme changes
	 */
	const setEmulateTheme = useCallback(
		// eslint-disable-next-line unused-imports/no-unused-vars
		(dark?: boolean) => {
			changeSiteTheme("auto");
		},
		[changeSiteTheme],
	);

	/**
	 * Watch system theme change
	 */
	useEffect(() => {
		if (theme === "auto") {
			// https://developer.chrome.com/docs/devtools/rendering/emulate-css/
			const darkModeMediaQuery = window.matchMedia(
				"(prefers-color-scheme: dark)",
			);

			function matchMode(e: MediaQueryListEvent) {
				setEmulateTheme(e.matches);
			}

			setEmulateTheme(darkModeMediaQuery.matches);
			darkModeMediaQuery.addEventListener("change", matchMode);
			return () => {
				darkModeMediaQuery.removeEventListener("change", matchMode);
			};
		}
	}, [theme, setEmulateTheme]);

	/**
	 * 更新页面颜色模式（灰色、色弱）
	 */
	const updateColorMode = () => {
		const dom = document.documentElement;
		const COLOR_BLIND = "color-blind-mode";
		const COLOR_GRAY = "gray-mode";
		colorBlindMode
			? dom.classList.add(COLOR_BLIND)
			: dom.classList.remove(COLOR_BLIND);
		colorGrayMode
			? dom.classList.add(COLOR_GRAY)
			: dom.classList.remove(COLOR_GRAY);
	};

	useEffect(() => {
		updateColorMode();
	}, [colorBlindMode, colorGrayMode]);

	return (
		<ConfigProvider
			input={{ autoComplete: "off" }}
			locale={getAntdLocale()}
			theme={{
				cssVar: true,
				hashed: false,
				algorithm:
					isDark
						? antdTheme.darkAlgorithm
						: antdTheme.defaultAlgorithm,
				...(isDark ? customAntdDarkTheme : customAntdLightTheme),
				token: {
					...(isDark ? customAntdDarkTheme.token : customAntdLightTheme.token),
					borderRadius: themeRadius,
					colorPrimary: themeColorPrimary,
				},
			}}
		>
			<AntdApp>
				<JSSThemeProvider>
					<Suspense fallback={null}>
						{import.meta.env.VITE_APP_VERSION_MONITOR === "Y" ? <AppVersionMonitor /> : null}
						<RouterProvider router={router} />
					</Suspense>
				</JSSThemeProvider>
			</AntdApp>
		</ConfigProvider>
	);
}
