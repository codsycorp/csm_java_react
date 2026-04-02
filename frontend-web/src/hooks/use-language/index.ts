import type { LanguageType } from "#src/locales";
import { usePreferencesStore } from "#src/store";

import { useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";

export function useLanguage() {
	const { i18n } = useTranslation();
	const { changeLanguage, language: storeLanguage } = usePreferencesStore();

	// Sync i18n language with store on mount and when store changes
	useEffect(() => {
		if (storeLanguage && i18n.language !== storeLanguage) {
			console.log('Syncing language from store:', storeLanguage, 'current i18n:', i18n.language);
			i18n.changeLanguage(storeLanguage);
		}
	}, [storeLanguage, i18n]);

	const handleChangeLanguage = useCallback(
		async (locale: LanguageType) => {
			console.log('Changing language to:', locale);
			// Update store language first
			changeLanguage(locale);
			// Then update react-i18n language
			await i18n.changeLanguage(locale);
		},
		[changeLanguage, i18n],
	);

	return useMemo(
		() => ({
			language: storeLanguage || i18n.language as LanguageType,
			setLanguage: handleChangeLanguage,
		}),
		[handleChangeLanguage, storeLanguage, i18n.language],
	);
}
