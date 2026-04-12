import enUS from "antd/locale/en_US";
import zhCN from "antd/locale/zh_CN";
import viVN from "antd/locale/vi_VN"; // Import Vietnamese locale

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { getEnUsLang, getZhCnLang, getViVnLang } from "./helper"; // Import Vietnamese language helper

export * from "./t";

export type LanguageType = "zh-CN" | "en-US" | "vi-VN"; // Add Vietnamese language type

export const ANT_DESIGN_LOCALE = {
	"zh-CN": zhCN,
	"en-US": enUS,
	"vi-VN": viVN, // Add Vietnamese locale
};

export const i18nResources = {
	"zh-CN": {
		translation: getZhCnLang(),
	},
	"en-US": {
		translation: getEnUsLang(),
	},
	"vi-VN": {
		translation: getViVnLang(), // Add Vietnamese translations
	},
};

export const i18nInitOptions = {
	lng: (() => {
		// Try to get language from preferences store first
		try {
			const preferences = localStorage.getItem('preferences');
			if (preferences) {
				const parsed = JSON.parse(preferences);
				if (parsed?.state?.language) {
					return parsed.state.language;
				}
			}
		} catch (e) {
			console.warn('Failed to parse preferences from localStorage:', e);
		}
		// Fallback to direct language key or default
		const fallbackLang = localStorage.getItem('language') || "vi-VN";
		return fallbackLang;
	})(),
	resources: i18nResources,
	fallbackLng: "vi-VN",
	debug: false,
	interpolation: {
		escapeValue: false,
	},
};

export function setupI18n() {
	i18n.use(initReactI18next).init(i18nInitOptions);
	/**
	 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang
	 */
	i18n.on("languageChanged", (lng) => {
		document.documentElement.lang = lng;
		// Update both localStorage keys for compatibility
		localStorage.setItem('language', lng);
		// Also update preferences store
		try {
			const preferences = localStorage.getItem('preferences');
			if (preferences) {
				const parsed = JSON.parse(preferences);
				if (parsed?.state) {
					parsed.state.language = lng;
					localStorage.setItem('preferences', JSON.stringify(parsed));
				}
			} else {
				// Create initial preferences structure if not exists
				const initialPrefs = {
					state: {
						language: lng
					},
					version: 0
				};
				localStorage.setItem('preferences', JSON.stringify(initialPrefs));
			}
		} catch (e) {
			console.warn('Failed to update preferences language:', e);
		}
	});
}
