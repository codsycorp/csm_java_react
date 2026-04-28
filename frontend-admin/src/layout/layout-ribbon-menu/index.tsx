/**
 * LayoutRibbonMenu — Microsoft Office–style ribbon navigation
 * Light mode : white group cards on grey band, flat buttons, clear borders.
 * Dark mode  : elevated group cards on dark band, higher-contrast borders.
 */
import type { MenuItemType } from "#src/layout/layout-menu/types";
import type { MenuProps } from "antd";

import type { RibbonShadowLevel } from "#src/store";

import { usePreferences } from "#src/hooks";
import { usePreferencesStore } from "#src/store";
import { cn } from "#src/utils";
import { normalizeMenuLabel } from "#src/utils";

import * as AntIcons from "@ant-design/icons";
import { Dropdown, Tooltip } from "antd";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createUseStyles } from "react-jss";
import { useLocation } from "react-router";

// ─── Constants ────────────────────────────────────────────────────────────────
const TAB_ROW_H  = 32;
const GROUP_CONTENT_HEIGHT = 72;
// Keep the band only slightly taller than the group cards.
// Large buttons can now grow to fit 2 wrapped label lines, so the band no longer
// needs to be oversized just to avoid clipping.
const BAND_HEIGHT = 110;

// ─── Style types ──────────────────────────────────────────────────────────────
interface StyleData {
	isDark: boolean;
	shadowLevel: RibbonShadowLevel;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// ─── NOTE: All styles use Ant Design CSS variables (--ant-color-*) so they
// auto-adapt to dark/light mode without any isDark JS detection in JSS.
// d.isDark is kept in StyleData for future use but not used below.
const useStyles = createUseStyles((_d: StyleData) => ({
	// ── Root wrapper ─────────────────────────────────────────────────────────
	root: {
		width: "100%",
		userSelect: "none",
		flexShrink: 0,
		position: "relative",
		zIndex: 10,
		boxShadow: "var(--ribbon-shadow)",
		borderBottom: "1px solid var(--ribbon-root-border)",
	},

	// ── Tab row ──────────────────────────────────────────────────────────────
	tabRow: {
		display: "flex",
		alignItems: "flex-end",
		height: TAB_ROW_H,
		paddingLeft: 6,
		paddingRight: 4,
		position: "relative",
		zIndex: 2,
		borderBottom: "1px solid var(--ribbon-tab-row-border)",
	},

	tab: {
		display: "inline-flex",
		alignItems: "center",
		gap: 5,
		padding: "0 13px",
		height: 27,
		fontSize: 13.5,
		fontWeight: 500,
		cursor: "pointer",
		whiteSpace: "nowrap",
		letterSpacing: 0.15,
		borderRadius: "4px 4px 0 0",
		border: "1px solid transparent",
		borderBottom: "none",
		transition: "color 0.15s, background 0.12s, box-shadow 0.14s, transform 0.12s",
		color: "var(--ribbon-tab-text)",
		"&:hover": {
			color: "var(--ribbon-tab-hover-text)",
			background: "var(--ribbon-tab-hover-bg)",
			boxShadow: "inset 0 1px 0 var(--ribbon-tab-hover-inset), 0 1px 0 rgba(255,255,255,0.08)",
			transform: "translateY(-1px)",
		},
		"&:focus-visible": {
			outline: "2px solid var(--ribbon-focus-ring)",
			outlineOffset: 1,
		},
	},

	tabIcon: {
		fontSize: 13,
		flexShrink: 0,
		color: "var(--ribbon-tab-icon)",
	},

	tabLabel: {
		whiteSpace: "nowrap",
	},

	// Active tab merges visually with the band below (folder-tab effect)
	tabActive: {
		color: "var(--ribbon-tab-active-text) !important",
		fontWeight: 600,
		border: "1px solid var(--ribbon-tab-active-border) !important",
		borderBottom: "none !important",
		boxShadow: [
			"inset 0 1px 0 var(--ribbon-tab-active-inset)",
			"0 -1px 3px rgba(0,0,0,0.14)",
			"0 1px 0 rgba(255,255,255,0.08)",
		].join(", "),
		transform: "translateY(-1px)",
	},

	tabRowSpacer: { flex: 1 },

	pinBtn: {
		display: "inline-flex",
		alignItems: "center",
		padding: "0 10px",
		cursor: "pointer",
		opacity: 0.4,
		fontSize: 11,
		color: "var(--ribbon-pin-text)",
		transition: "opacity 0.15s",
		"&:hover": { opacity: 1 },
		"&:focus-visible": {
			opacity: 1,
			outline: "2px solid var(--ribbon-focus-ring)",
			outlineOffset: 1,
			borderRadius: 4,
		},
	},

	// ── Ribbon band ──────────────────────────────────────────────────────────
	// The band still reserves a little bottom breathing room for group shadows,
	// but its height should track real content rather than leaving a large empty gap.
	band: {
		display: "flex",
		flexDirection: "row",
		flexWrap: "nowrap",
		alignItems: "flex-start",
		overflowX: "auto",
		overflowY: "hidden",
		minHeight: BAND_HEIGHT,
		maxHeight: BAND_HEIGHT,
		padding: "4px 8px 12px",
		// CSS vars auto-adapt: border is light grey in light mode, white-tinted in dark
		borderTop: "1px solid var(--ribbon-band-border-top)",
		borderBottom: "1px solid var(--ribbon-band-border-bottom)",
		boxShadow: "inset 0 1px 0 var(--ribbon-band-inset), inset 0 -1px 0 rgba(0,0,0,0.08)",
		transition: "min-height 0.18s ease, max-height 0.18s ease",
		"&::-webkit-scrollbar": { height: 4 },
		"&::-webkit-scrollbar-thumb": {
			borderRadius: 2,
			background: "var(--ribbon-scroll-thumb)",
		},
	},

	bandCollapsed: {
		minHeight: 0,
		maxHeight: 0,
		overflow: "hidden",
		padding: 0,
		borderTop: "none",
		borderBottom: "none",
		boxShadow: "none",
	},

	// ── Group card ────────────────────────────────────────────────────────────
	// Background is set via inline style (groupBg) using Ant Design tokens.
	// Border and shadow use CSS vars so they're always visible in both modes.
	group: {
		display: "flex",
		flexDirection: "column",
		flexShrink: 0,
		position: "relative",
		boxSizing: "border-box",
		width: "max-content",
		minWidth: 60,
		paddingLeft: 5,
		paddingRight: 5,
		paddingTop: 3,
		marginRight: 6,
		marginBottom: 4,
		borderRadius: 4,
		// colorBorderSecondary: visible in both light (~rgba(0,0,0,0.06)) and dark (~rgba(255,255,255,0.12))
		border: "1px solid var(--ribbon-group-border)",
		// Outer shadow for depth + inset top highlight for 3D lift appearance
		boxShadow: [
			"inset 0 1px 0 var(--ribbon-group-inset)",
			"inset 0 -1px 0 var(--ribbon-group-inset-bottom)",
			"0 1px 3px rgba(0,0,0,0.14)",
			"0 4px 10px rgba(0,0,0,0.12)",
		].join(", "),
	},

	groupItems: {
		flex: 1,
		display: "flex",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		flexShrink: 0,
		boxSizing: "border-box",
		height: GROUP_CONTENT_HEIGHT,
		gap: 2,
		padding: "2px 1px",
	},

	groupLabel: {
		display: "block",
		width: "100%",
		fontSize: 11,
		lineHeight: 1.3,
		textAlign: "center",
		paddingTop: 2,
		paddingBottom: 2,
		letterSpacing: 0.2,
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
		fontWeight: 500,
		// colorBorder adapts: dark grey in light, light grey in dark
		borderTop: "1px solid var(--ribbon-group-label-border)",
		color: "var(--ribbon-group-label-text)",
	},

	// ── Large button ─────────────────────────────────────────────────────────
	// Flat at rest — depth only on hover/active. All hover colors use CSS vars
	// so they work correctly in BOTH light and dark mode without isDark detection.
	btnLarge: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "flex-start",
		boxSizing: "border-box",
		padding: "4px 8px 3px",
		minWidth: 52,
		maxWidth: 90,
		height: GROUP_CONTENT_HEIGHT,
		cursor: "pointer",
		borderRadius: 4,
		border: "1px solid transparent",
		background: "transparent",
		boxShadow: "none",
		transition: "background 0.1s, border-color 0.1s, box-shadow 0.12s, transform 0.1s",
		"&:hover": {
			// colorFill: ~15% black in light, ~18% white in dark — clearly visible in both
			background: "var(--ant-color-fill)",
			borderColor: "var(--ant-color-border)",
			boxShadow: "inset 0 1px 0 rgba(255,255,255,0.26), 0 2px 6px rgba(0,0,0,0.22)",
			transform: "translateY(-1px)",
		},
		"&:active": {
			transform: "translateY(0)",
			background: "var(--ant-color-fill-secondary)",
			borderColor: "var(--ant-color-border)",
			boxShadow: "inset 0 2px 6px rgba(0,0,0,0.28), inset 0 -1px 0 rgba(255,255,255,0.08)",
		},
		"&:focus-visible": {
			outline: "2px solid var(--ribbon-focus-ring)",
			outlineOffset: 1,
		},
	},

	btnLargeActive: {
		background: "var(--ant-color-primary-bg) !important",
		borderColor: "var(--ant-color-primary-border) !important",
		boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1) !important",
	},

	btnLargeIcon: {
		fontSize: 22,
		lineHeight: 1,
		marginBottom: 3,
		flexShrink: 0,
		color: "var(--ribbon-item-icon)",
	},

	btnLargeIconActive: {
		color: "var(--ant-color-primary) !important",
	},

	btnLargeLabel: {
		fontSize: 11.5,
		fontWeight: 500,
		lineHeight: "1.25",
		textAlign: "center",
		width: "100%",
		minHeight: 26,
		whiteSpace: "normal",
		overflow: "hidden",
		wordBreak: "break-word",
		overflowWrap: "anywhere",
		display: "-webkit-box",
		"-webkit-line-clamp": 2,
		"-webkit-box-orient": "vertical",
		// colorText adapts: dark in light mode, near-white in dark mode
		color: "var(--ant-color-text)",
	},

	btnLargeArrow: {
		fontSize: 7,
		marginTop: 1,
		opacity: 0.5,
		color: "var(--ribbon-item-icon)",
	},

	// ── Small button ─────────────────────────────────────────────────────────
	btnSmallCol: {
		display: "flex",
		flexDirection: "column",
		justifyContent: "center",
		boxSizing: "border-box",
		gap: 2,
		height: GROUP_CONTENT_HEIGHT,
		paddingRight: 5,
		marginRight: 5,
		"&:not(:last-child)": {
			borderRight: "1px solid var(--ribbon-col-divider)",
		},
	},

	btnSmall: {
		display: "flex",
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		padding: "2px 7px 2px 5px",
		height: 18,
		minWidth: 96,
		maxWidth: 160,
		cursor: "pointer",
		borderRadius: 3,
		fontSize: 12,
		fontWeight: 500,
		border: "1px solid transparent",
		background: "transparent",
		boxShadow: "none",
		color: "var(--ant-color-text)",
		transition: "background 0.1s, border-color 0.1s, box-shadow 0.1s, transform 0.1s",
		overflow: "hidden",
		"&:hover": {
			background: "var(--ant-color-fill)",
			borderColor: "var(--ant-color-border)",
			boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 4px rgba(0,0,0,0.2)",
			transform: "translateY(-1px)",
		},
		"&:active": {
			transform: "translateY(0)",
			background: "var(--ant-color-fill-secondary)",
			borderColor: "var(--ant-color-border)",
			boxShadow: "inset 0 1px 4px rgba(0,0,0,0.24)",
		},
		"&:focus-visible": {
			outline: "2px solid var(--ribbon-focus-ring)",
			outlineOffset: 1,
		},
	},

	btnSmallActive: {
		color: "var(--ant-color-primary) !important",
		background: "var(--ant-color-primary-bg) !important",
		borderColor: "var(--ant-color-primary-border) !important",
	},

	btnSmallIcon: {
		fontSize: 12,
		flexShrink: 0,
		color: "var(--ribbon-item-icon)",
	},

	btnSmallIconActive: {
		color: "var(--ant-color-primary) !important",
	},

	btnSmallLabel: {
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		flex: 1,
	},
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RenderIcon({
	name,
	style,
	className,
	fallback,
}: {
	name?: string;
	style?: React.CSSProperties;
	className?: string;
	fallback?: React.ReactNode;
}) {
	if (!name) return fallback ? <>{fallback}</> : null;
	const Comp = (AntIcons as any)[name];
	if (!Comp) return fallback ? <>{fallback}</> : null;
	return <Comp style={style} className={className} />;
}

function normalizeAntIconName(raw: string): string {
	if (!raw) return "";
	if ((AntIcons as any)[raw]) return raw;
	for (const tok of raw.split(/\s+/)) {
		if ((AntIcons as any)[tok]) return tok;
	}
	if (!/Outlined$|Filled$|TwoTone$/i.test(raw)) {
		const outlined = `${raw}Outlined`;
		if ((AntIcons as any)[outlined]) return outlined;
	}
	return "";
}

function resolveIcon(
	icon: unknown,
	legacyIcon?: unknown,
	fallback?: React.ReactNode,
	size = 14,
): React.ReactNode {
	if (React.isValidElement(icon)) return icon;
	const src = (typeof icon === "string" ? icon : "") || (typeof legacyIcon === "string" ? legacyIcon : "");
	if (!src) return fallback ?? null;
	const name = normalizeAntIconName(src);
	if (name) return <RenderIcon name={name} style={{ fontSize: size }} fallback={fallback} />;
	return <i className={src} style={{ fontSize: size, lineHeight: 1 }} aria-hidden />;
}

function isPathActive(path: string, key: string) {
	if (!key) return false;
	return path === key || path.startsWith(key + "/");
}

// ─── Group builder ────────────────────────────────────────────────────────────

interface GroupDef {
	key: string;
	label: string;
	items: MenuItemType[];
}

function buildGroups(children: MenuItemType[]): GroupDef[] {
	const groups: GroupDef[] = [];
	const loose: MenuItemType[] = [];
	for (const child of children) {
		const kids = (child as any).children as MenuItemType[] | undefined;
		if (Array.isArray(kids) && kids.length > 0) {
				groups.push({ key: String(child.key), label: String(child.label ?? ""), items: kids });
		} else {
			loose.push(child);
		}
	}
	if (loose.length > 0) groups.unshift({ key: "__root__", label: "", items: loose });
	return groups;
}

// ─── LargeButton ─────────────────────────────────────────────────────────────

interface LargeButtonProps {
	item: MenuItemType;
	active: boolean;
	onSelect: (key: string) => void;
	classes: ReturnType<typeof useStyles>;
}

function LargeButton({ item, active, onSelect, classes }: LargeButtonProps) {
	const key    = String(item.key);
	const label  = String(item.label ?? "");
	const kids   = (item as any).children as MenuItemType[] | undefined;
	const hasKids = Array.isArray(kids) && kids.length > 0;

	const dropItems: MenuProps["items"] = hasKids
		? kids!.map(c => ({
			key: String(c.key),
			label: String(c.label ?? ""),
			icon: resolveIcon(c.icon, (c as any).m_icons, <AntIcons.AppstoreOutlined style={{ fontSize: 13 }} />, 13),
		}))
		: [];

	const content = (
		<div
			className={cn(classes.btnLarge, active && classes.btnLargeActive)}
			onClick={() => !hasKids && onSelect(key)}
		>
			<span className={cn(classes.btnLargeIcon, active && classes.btnLargeIconActive)}>
				{resolveIcon(item.icon, (item as any).m_icons, <AntIcons.AppstoreOutlined />, 22)}
			</span>
			<span className={classes.btnLargeLabel}>{label}</span>
			<span className={classes.btnLargeArrow} style={hasKids ? undefined : { visibility: "hidden" }}>
				<AntIcons.CaretDownOutlined />
			</span>
		</div>
	);

	if (hasKids) {
		return (
			<Dropdown
				menu={{ items: dropItems, onClick: ({ key: k }) => onSelect(k) }}
				trigger={["click"]}
			>
				{content}
			</Dropdown>
		);
	}
	return content;
}

// ─── SmallButton ─────────────────────────────────────────────────────────────

interface SmallButtonProps {
	item: MenuItemType;
	active: boolean;
	onSelect: (key: string) => void;
	classes: ReturnType<typeof useStyles>;
}

function SmallButton({ item, active, onSelect, classes }: SmallButtonProps) {
	const key   = String(item.key);
	const label = String(item.label ?? "");
	return (
		<div
			className={cn(classes.btnSmall, active && classes.btnSmallActive)}
			onClick={() => onSelect(key)}
			title={label}
		>
			<span className={cn(classes.btnSmallIcon, active && classes.btnSmallIconActive)}>
				{resolveIcon(item.icon, (item as any).m_icons, <AntIcons.AppstoreOutlined />, 12)}
			</span>
			<span className={classes.btnSmallLabel}>{label}</span>
		</div>
	);
}

// ─── RibbonGroup ─────────────────────────────────────────────────────────────

const LARGE_BTN_MAX = 5;
const SMALL_PER_COL = 3;

interface RibbonGroupProps {
	group: GroupDef;
	activePath: string;
	onSelect: (key: string) => void;
	classes: ReturnType<typeof useStyles>;
	groupBg: string;
}

function RibbonGroup({ group, activePath, onSelect, classes, groupBg }: RibbonGroupProps) {
	const useLarge = group.items.length <= LARGE_BTN_MAX;

	const smallCols = useMemo(() => {
		if (useLarge) return [] as MenuItemType[][];
		const cols: MenuItemType[][] = [];
		for (let i = 0; i < group.items.length; i += SMALL_PER_COL) {
			cols.push(group.items.slice(i, i + SMALL_PER_COL));
		}
		return cols;
	}, [group.items, useLarge]);

	return (
		<div className={classes.group} style={{ background: groupBg }}>
			<div className={classes.groupItems}>
				{useLarge
					? group.items.map(item => (
						<LargeButton
							key={String(item.key)}
							item={item}
							active={isPathActive(activePath, String(item.key))}
							onSelect={onSelect}
							classes={classes}
						/>
					))
					: smallCols.map((col, ci) => (
						<div key={ci} className={classes.btnSmallCol}>
							{col.map(item => (
								<SmallButton
									key={String(item.key)}
									item={item}
									active={isPathActive(activePath, String(item.key))}
									onSelect={onSelect}
									classes={classes}
								/>
							))}
						</div>
					))}
			</div>
			{group.label
				? <div className={classes.groupLabel} title={group.label}>{group.label}</div>
				: <div style={{ height: 14 }} />}
		</div>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface LayoutRibbonMenuProps {
	menus: MenuItemType[];
	handleMenuSelect?: (key: string, mode: MenuProps["mode"]) => void;
}

export default function LayoutRibbonMenu({ menus, handleMenuSelect }: LayoutRibbonMenuProps) {
	const { isDark } = usePreferences();

	const ribbonShadowLevel = usePreferencesStore(state => state.ribbonShadowLevel);

	const classes = useStyles({ theme: { isDark, shadowLevel: ribbonShadowLevel } } as any);

	const location     = useLocation();
	const [activeTabKey, setActiveTabKey] = useState<string>("");
	const [collapsed, setCollapsed]       = useState(false);
	const lastClickTimeRef = useRef<number>(0);
	const lastClickKeyRef  = useRef<string>("");

	useEffect(() => {
		if (menus.length === 0) return;
		const path = location.pathname;

		function matchPath(items: MenuItemType[]): boolean {
			for (const it of items) {
				const k = String(it.key ?? "");
				if (k && isPathActive(path, k)) return true;
				const kids = (it as any).children as MenuItemType[] | undefined;
				if (kids && matchPath(kids)) return true;
			}
			return false;
		}

		const matching = menus.find(tab => {
			const tabKey = String(tab.key ?? "");
			if (tabKey && isPathActive(path, tabKey)) return true;
			const kids = (tab as any).children as MenuItemType[] | undefined;
			return kids ? matchPath(kids) : false;
		});

		if (matching) {
			setActiveTabKey(String(matching.key ?? ""));
		} else if (!activeTabKey && menus[0]) {
			setActiveTabKey(String(menus[0].key ?? ""));
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname, menus]);

	const handleTabClick = useCallback((key: string) => {
		const now     = Date.now();
		const sameKey = key === lastClickKeyRef.current;
		const dbl     = sameKey && now - lastClickTimeRef.current < 400;
		lastClickKeyRef.current  = key;
		lastClickTimeRef.current = now;
		if (dbl) {
			setCollapsed(prev => !prev);
		} else {
			setActiveTabKey(key);
			if (collapsed) setCollapsed(false);
		}
	}, [collapsed]);

	const activeTab = useMemo(
		() => menus.find(t => String(t.key) === activeTabKey),
		[menus, activeTabKey],
	);

	const groups = useMemo(() => {
		const kids = (activeTab as any)?.children as MenuItemType[] | undefined;
		if (!kids || kids.length === 0) return [];
		return buildGroups(kids);
	}, [activeTab]);

	const handleItemSelect = useCallback((key: string) => {
		handleMenuSelect?.(key, "horizontal");
	}, [handleMenuSelect]);

	const activePath = location.pathname;

	const shadowByLevel: Record<RibbonShadowLevel, string> = {
		soft: "0 2px 6px rgba(0,0,0,0.12)",
		medium: "0 3px 10px rgba(0,0,0,0.18)",
		strong: "0 5px 14px rgba(0,0,0,0.24)",
	};

	const ribbonPalette = useMemo(() => {
		if (isDark) {
			// Dark palette aligned with system csm-surface variables:
			// --csm-surface-0: #0f1115  --csm-surface-1: #141a22  --csm-surface-2: #1b2430
			// --csm-border-soft: #2c3747  --csm-border-strong: #3a4a5f
			// --csm-text-soft: #a9b6ca  --csm-focus-ring: #6ea8d9
			return {
				rootBg: "linear-gradient(180deg, #17222e 0%, #0f1115 100%)",
				tabRowBg: "linear-gradient(180deg, #1b2430 0%, #141a22 100%)",
				tabText: "#a9b6ca",
				tabHoverText: "#c8d8ea",
				tabHoverBg: "rgba(110, 168, 217, 0.14)",
				tabActiveText: "#d4e4f4",
				tabActiveBg: "rgba(110, 168, 217, 0.18)",
				tabActiveBorder: "#3a4a5f",
				tabRowBorder: "#2c3747",
				tabIcon: "#7f98b0",
				pinText: "#7f98b0",
				bandBg: "linear-gradient(180deg, #1b2637 0%, #141a22 100%)",
				bandBorderTop: "#2c3747",
				bandBorderBottom: "#0f1115",
				bandInset: "rgba(255,255,255,0.04)",
				scrollThumb: "rgba(90, 120, 150, 0.4)",
				groupBg: "#1b2430",
				groupBorder: "#2c3747",
				groupInset: "rgba(255,255,255,0.05)",
				groupInsetBottom: "rgba(0,0,0,0.4)",
				groupLabelBorder: "#2c3747",
				groupLabelText: "#a9b6ca",
				itemIcon: "#8fa8be",
				colDivider: "#2c3747",
				tabHoverInset: "rgba(255,255,255,0.07)",
				tabActiveInset: "rgba(255,255,255,0.10)",
				rootBorder: "#2c3747",
				focusRing: "#6ea8d9",
			};
		}

		return {
			// Light mode derived from the same blue-steel family, brighter and cleaner.
			rootBg: "linear-gradient(180deg, #9ec0d4 0%, #7ea8bf 100%)",
			tabRowBg: "linear-gradient(180deg, #f9fbfc 0%, #e8eef3 100%)",
			tabText: "#184561",
			tabHoverText: "#11364d",
			tabHoverBg: "rgba(255,255,255,0.78)",
			tabActiveText: "#123d56",
			tabActiveBg: "#ffffff",
			tabActiveBorder: "#a7c0d0",
			tabRowBorder: "#adc3d2",
			tabIcon: "#295673",
			pinText: "#2a5874",
			bandBg: "linear-gradient(180deg, #c3d9e6 0%, #adcada 100%)",
			bandBorderTop: "#d7e6ef",
			bandBorderBottom: "#8db0c4",
			bandInset: "rgba(255,255,255,0.72)",
			scrollThumb: "rgba(106, 144, 168, 0.6)",
			groupBg: "#ffffff",
			groupBorder: "#7fa2b7",
			groupInset: "rgba(255,255,255,0.86)",
			groupInsetBottom: "rgba(157, 184, 201, 0.5)",
			groupLabelBorder: "#d4e4ef",
			groupLabelText: "#2f5d77",
			itemIcon: "#3a6985",
			colDivider: "#b8cfde",
			tabHoverInset: "rgba(255,255,255,0.85)",
			tabActiveInset: "rgba(255,255,255,0.95)",
			rootBorder: "#87adc3",
			focusRing: "#2c73a1",
		};
	}, [isDark]);

	const rootVars = {
		"--ribbon-shadow": shadowByLevel[ribbonShadowLevel],
		"--ribbon-tab-text": ribbonPalette.tabText,
		"--ribbon-tab-hover-text": ribbonPalette.tabHoverText,
		"--ribbon-tab-hover-bg": ribbonPalette.tabHoverBg,
		"--ribbon-tab-active-text": ribbonPalette.tabActiveText,
		"--ribbon-tab-active-border": ribbonPalette.tabActiveBorder,
		"--ribbon-tab-row-border": ribbonPalette.tabRowBorder,
		"--ribbon-tab-icon": ribbonPalette.tabIcon,
		"--ribbon-pin-text": ribbonPalette.pinText,
		"--ribbon-band-border-top": ribbonPalette.bandBorderTop,
		"--ribbon-band-border-bottom": ribbonPalette.bandBorderBottom,
		"--ribbon-band-inset": ribbonPalette.bandInset,
		"--ribbon-scroll-thumb": ribbonPalette.scrollThumb,
		"--ribbon-group-border": ribbonPalette.groupBorder,
		"--ribbon-group-inset": ribbonPalette.groupInset,
		"--ribbon-group-inset-bottom": ribbonPalette.groupInsetBottom,
		"--ribbon-group-label-border": ribbonPalette.groupLabelBorder,
		"--ribbon-group-label-text": ribbonPalette.groupLabelText,
		"--ribbon-item-icon": ribbonPalette.itemIcon,
		"--ribbon-col-divider": ribbonPalette.colDivider,
		"--ribbon-tab-hover-inset": ribbonPalette.tabHoverInset,
		"--ribbon-tab-active-inset": ribbonPalette.tabActiveInset,
		"--ribbon-root-border": ribbonPalette.rootBorder,
		"--ribbon-focus-ring": ribbonPalette.focusRing,
	} as React.CSSProperties;

	return (
		<div className={classes.root} style={{ ...rootVars, background: ribbonPalette.rootBg }}>

			{/* ── Tab row ─────────────────────────────────────────────────── */}
			<div className={classes.tabRow} style={{ background: ribbonPalette.tabRowBg }}>
				{menus.map(tab => {
					const key      = String(tab.key ?? "");
					const tabLabel = String(tab.label ?? "");
					const isActive = key === activeTabKey;
					return (
						<div
							key={key}
							className={cn(classes.tab, isActive && classes.tabActive)}
							style={isActive ? { background: ribbonPalette.tabActiveBg } : undefined}
							onClick={() => handleTabClick(key)}
							title={tabLabel}
						>
							<span className={classes.tabIcon}>
								{resolveIcon((tab as any).icon, (tab as any).m_icons, undefined, 13)}
							</span>
							<span className={classes.tabLabel}>{tabLabel}</span>
						</div>
					);
				})}
				<div className={classes.tabRowSpacer} />
				<Tooltip
					title={collapsed ? "Mở rộng ribbon (double-click tab)" : "Thu gọn ribbon (double-click tab)"}
					placement="bottomRight"
				>
					<div className={classes.pinBtn} onClick={() => setCollapsed(v => !v)}>
						{collapsed ? <AntIcons.DownOutlined /> : <AntIcons.UpOutlined />}
					</div>
				</Tooltip>
			</div>

			{/* ── Ribbon band ─────────────────────────────────────────────── */}
			<div
				className={cn(classes.band, collapsed && classes.bandCollapsed)}
				style={{ background: ribbonPalette.bandBg }}
			>
				{!collapsed && groups.map(group => (
					<RibbonGroup
						key={group.key}
						group={group}
						activePath={activePath}
						onSelect={handleItemSelect}
						classes={classes}
						groupBg={ribbonPalette.groupBg}
					/>
				))}

				{!collapsed && groups.length === 0 && activeTab && (
					<div className={classes.group} style={{ background: ribbonPalette.groupBg }}>
						<div className={classes.groupItems}>
							<LargeButton
								item={activeTab}
								active={isPathActive(activePath, String(activeTab.key))}
								onSelect={handleItemSelect}
								classes={classes}
							/>
						</div>
						<div style={{ height: 14 }} />
					</div>
				)}
			</div>
		</div>
	);
}
