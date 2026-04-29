import type { ThemeConfig } from "antd";

export const COLLAPSED_WIDTH = 56;

interface RGB {
	r: number
	g: number
	b: number
}

function clampColor(value: number) {
	return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeHex(input: string, fallback = "#1677ff") {
	const value = String(input || "").trim();
	const shortHex = /^#([0-9a-f]{3})$/i;
	const longHex = /^#[0-9a-f]{6}$/i;

	if (longHex.test(value)) {
		return value.toLowerCase();
	}
	if (shortHex.test(value)) {
		const [, raw] = value.match(shortHex)!;
		return `#${raw.split("").map(v => `${v}${v}`).join("")}`.toLowerCase();
	}
	return fallback;
}

function hexToRgb(hex: string): RGB {
	const normalized = normalizeHex(hex).slice(1);
	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	};
}

function rgbToHex(rgb: RGB) {
	const toHex = (value: number) => clampColor(value).toString(16).padStart(2, "0");
	return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mixHex(base: string, target: string, ratio: number) {
	const a = hexToRgb(base);
	const b = hexToRgb(target);
	const k = Math.max(0, Math.min(1, ratio));
	return rgbToHex({
		r: a.r + (b.r - a.r) * k,
		g: a.g + (b.g - a.g) * k,
		b: a.b + (b.b - a.b) * k,
	});
}

function toRgba(hex: string, alpha: number) {
	const { r, g, b } = hexToRgb(hex);
	const a = Math.max(0, Math.min(1, alpha));
	return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function createProfessionalThemePalette(primaryColor: string, isDark: boolean) {
	const primary = normalizeHex(primaryColor);

	if (isDark) {
		const surface0 = mixHex(primary, "#0f1115", 0.92);
		const surface1 = mixHex(primary, "#141a22", 0.9);
		const surface2 = mixHex(primary, "#1b2430", 0.86);
		const borderSoft = mixHex(primary, "#2c3747", 0.8);
		const borderStrong = mixHex(primary, "#3a4a5f", 0.78);
		const textSoft = mixHex(primary, "#a9b6ca", 0.86);
		const textMuted = mixHex(primary, "#5f7485", 0.82);
		const actionDelete = mixHex(primary, "#ff8a8a", 0.75);

		return {
			primary,
			tokens: {
				colorPrimary: primary,
				colorLink: mixHex(primary, "#9bc7ff", 0.3),
				colorInfo: mixHex(primary, "#8ac5ff", 0.26),
				colorPrimaryBg: mixHex(primary, surface1, 0.68),
				colorPrimaryBgHover: mixHex(primary, surface1, 0.6),
				colorPrimaryBorder: mixHex(primary, borderStrong, 0.54),
				colorPrimaryBorderHover: mixHex(primary, borderStrong, 0.46),
				colorBgLayout: surface0,
				colorBgContainer: surface1,
				colorBorder: borderSoft,
				colorBorderSecondary: mixHex(primary, borderSoft, 0.86),
				colorText: mixHex(primary, "#dde7f5", 0.88),
				colorTextSecondary: textSoft,
				colorTextTertiary: textMuted,
			},
			cssVars: {
				"--csm-theme-primary": primary,
				"--csm-surface-0": surface0,
				"--csm-surface-1": surface1,
				"--csm-surface-2": surface2,
				"--csm-border-soft": borderSoft,
				"--csm-border-strong": borderStrong,
				"--csm-text-soft": textSoft,
				"--csm-text-muted": textMuted,
				"--csm-focus-ring": mixHex(primary, "#6ea8d9", 0.2),
				"--csm-action-edit": mixHex(primary, "#7cb2ff", 0.3),
				"--csm-action-clone": mixHex(primary, "#7ccd86", 0.72),
				"--csm-action-delete": actionDelete,
				"--csm-layout-edge-shadow": `3px 0 10px ${toRgba("#000000", 0.45)}`,
				"--csm-layout-top-shadow": `0 -3px 10px ${toRgba("#000000", 0.45)}`,
				"--csm-control-elevated-shadow": `0 3px 12px ${toRgba("#000000", 0.4)}`,
			},
		};
	}

	const surface0 = mixHex(primary, "#f7f9fc", 0.94);
	const surface1 = "#ffffff";
	const surface2 = mixHex(primary, "#eef3f8", 0.88);
	const borderSoft = mixHex(primary, "#d8e3ef", 0.82);
	const borderStrong = mixHex(primary, "#c4d4e3", 0.78);
	const textSoft = mixHex(primary, "#1f2d3d", 0.88);
	const textMuted = mixHex(primary, "#5b6d82", 0.9);

	return {
		primary,
		tokens: {
			colorPrimary: primary,
			colorLink: mixHex(primary, "#1454c2", 0.1),
			colorInfo: primary,
			colorPrimaryBg: mixHex(primary, "#ffffff", 0.86),
			colorPrimaryBgHover: mixHex(primary, "#ffffff", 0.8),
			colorPrimaryBorder: mixHex(primary, "#c2d8ff", 0.48),
			colorPrimaryBorderHover: mixHex(primary, "#aac8ff", 0.4),
			colorBgLayout: surface0,
			colorBgContainer: surface1,
			colorBorder: borderSoft,
			colorBorderSecondary: mixHex(primary, borderSoft, 0.9),
			colorText: mixHex(primary, "#1f2d3d", 0.9),
			colorTextSecondary: textMuted,
			colorTextTertiary: mixHex(primary, textMuted, 0.94),
		},
		cssVars: {
			"--csm-theme-primary": primary,
			"--csm-surface-0": surface0,
			"--csm-surface-1": surface1,
			"--csm-surface-2": surface2,
			"--csm-border-soft": borderSoft,
			"--csm-border-strong": borderStrong,
			"--csm-text-soft": textSoft,
			"--csm-text-muted": textMuted,
			"--csm-focus-ring": mixHex(primary, "#2c73a1", 0.16),
			"--csm-action-edit": mixHex(primary, "#1677ff", 0.04),
			"--csm-action-clone": mixHex(primary, "#52c41a", 0.82),
			"--csm-action-delete": mixHex(primary, "#f5222d", 0.76),
			"--csm-layout-edge-shadow": `3px 0 8px ${toRgba(mixHex(primary, "#0f2c44", 0.82), 0.08)}`,
			"--csm-layout-top-shadow": `0 -3px 8px ${toRgba(mixHex(primary, "#0f2c44", 0.82), 0.08)}`,
			"--csm-control-elevated-shadow": `0 2px 8px ${toRgba(mixHex(primary, "#0f172a", 0.8), 0.14)}`,
		},
	};
}

export function applyProfessionalThemeCssVars(target: HTMLElement, primaryColor: string, isDark: boolean) {
	const palette = createProfessionalThemePalette(primaryColor, isDark);
	Object.entries(palette.cssVars).forEach(([key, value]) => {
		target.style.setProperty(key, String(value));
	});
}
/**
 * 自定义的Ant Design浅色主题配置
 *
 * English: Custom Ant Design light theme configuration
 *
 * @see https://ant.design/theme-editor-cn (中文版)
 * @see https://ant.design/docs/react/customize-theme-cn (中文版配置指南)
 * @see https://ant.design/theme-editor (English version)
 * @see https://ant.design/docs/react/customize-theme (English version configuration guide)
 */
export const customAntdLightTheme: ThemeConfig = {
	components: {
		Menu: {
			collapsedWidth: COLLAPSED_WIDTH,
		},
	},
};

/**
 * 自定义的Ant Design深色主题配置
 *
 * English: Custom Ant Design dark theme configuration
 *
 * @see https://ant.design/theme-editor-cn (中文版)
 * @see https://ant.design/docs/react/customize-theme-cn (中文版配置指南)
 * @see https://ant.design/theme-editor (English version)
 * @see https://ant.design/docs/react/customize-theme (English version configuration guide)
 */
export const customAntdDarkTheme: ThemeConfig = {
	components: {
		Menu: {
			collapsedWidth: COLLAPSED_WIDTH,
		},
	},
};
