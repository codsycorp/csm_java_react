import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, theme } from "antd";
import CsmDynamicGrid from "./CsmDynamicGrid";
import { buildDetailGridSelectEnums } from "./CsmEditModal";
import { usePreferences } from "#src/hooks/use-preferences";

function resolveMultilingualText(raw: any, fallback = "", langInput?: string): string {
	if (raw == null || raw === "") return String(fallback || "");
	if (typeof raw === "string" || typeof raw === "number") return String(raw);
	if (typeof raw === "object") {
		const lang = String(langInput || (typeof navigator !== "undefined" ? navigator.language : "vi") || "vi").toLowerCase();
		const vi = raw.vi ?? raw.vn;
		const en = raw.en;
		const zh = raw.zh ?? raw.cn;
		const preferred = lang.startsWith("en") ? en : lang.startsWith("zh") ? zh : vi;
		if (preferred != null && preferred !== "") return String(preferred);
		if (vi != null && vi !== "") return String(vi);
		if (en != null && en !== "") return String(en);
		if (zh != null && zh !== "") return String(zh);
	}
	return String(fallback || "");
}

export default function CsmMasterDetail(props: any) {
	const { appId, permissions, menusPermissions, dataScope, database, decrypt, m_configs, onDataChange } = props;
	const { isDark } = usePreferences();
	const { token } = theme.useToken();
	const [selectRow, setSelectRow] = useState<any>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [viewportHeight, setViewportHeight] = useState(() => {
		if (typeof window === "undefined") return 760;
		return Math.max(window.innerHeight - 220, 520);
	});

	const nodes = (m_configs && m_configs.nodes) || [];
	const hasNodes = nodes.length > 0;

	useEffect(() => {
		if (typeof window === "undefined") return;
		const updateLayoutMetrics = () => {
			const containerTop = containerRef.current?.getBoundingClientRect().top ?? 180;
			const nextHeight = Math.max(window.innerHeight - containerTop - 24, 520);
			setViewportHeight(nextHeight);
		};

		updateLayoutMetrics();
		const handleResize = () => updateLayoutMetrics();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.code === "Escape" && isFullscreen) {
				setIsFullscreen(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isFullscreen]);

	const masterTitle = resolveMultilingualText(m_configs?.label, "Dữ liệu chính");
	const masterRows = Array.isArray(database?.[m_configs?.table_name]?.rows)
		? database[m_configs.table_name].rows.length
		: undefined;
	const selectedRowSummary = useMemo(() => {
		if (!selectRow || typeof selectRow !== "object") return "Chọn một dòng để xem chi tiết";
		const preferredFields = ["ma_ct", "code", "name", "ten", "title", "so_ct", "id"];
		for (const field of preferredFields) {
			const value = String(selectRow?.[field] ?? "").trim();
			if (value) return value;
		}
		const firstScalar = Object.values(selectRow).find((value) => typeof value === "string" || typeof value === "number");
		return firstScalar != null ? String(firstScalar) : "Đã chọn bản ghi";
	}, [selectRow]);

	const tabItems = nodes.map((node: any) => {
		const nodeLabel = resolveMultilingualText(node.label, node.id || "");
		const label = nodeLabel.includes(".") ? nodeLabel.split(".").slice(-1)[0] : nodeLabel;
		const detailGridSelectEnums = buildDetailGridSelectEnums(node?.table || [], database, decrypt, { m_configs: node, context: { select_row: selectRow || undefined } });
		const children = React.createElement("div", {
			style: {
				height: "100%",
				minHeight: 0,
				overflow: "auto",
			}
		}, React.createElement(CsmDynamicGrid as any, {
			key: `grid-${node.id}`,
			appId,
			permissions,
			menusPermissions,
			dataScope,
			menuId: (m_configs as any).menu_id,
			database,
			decrypt,
			m_configs: {
				...node,
				table_name: node.table_name,
				table: node.table,
				type_form: 1,
				row_type_edit: 1,
				g_readonly: true,
				selectEnumsOverride: detailGridSelectEnums,
			},
			context: { select_row: selectRow || undefined },
			isDetailGrid: true,
			onDataChange,
		}));
		return { key: String(node.id), label, children } as any;
	});

	const panelStyle: React.CSSProperties = {
		minWidth: 0,
		background: token.colorBgContainer,
		border: `1px solid ${token.colorBorder}`,
		borderRadius: token.borderRadiusSM,
		padding: 0,
		boxSizing: "border-box",
		overflow: "hidden",
		height: "100%",
		display: "flex",
		flexDirection: "column",
		boxShadow: token.boxShadow,
	};

	const contentHeight = hasNodes ? viewportHeight : "auto";
	const effectiveHeight = isFullscreen ? (typeof window !== "undefined" ? window.innerHeight : 760) : viewportHeight;
	const masterHeight = hasNodes ? Math.max(Math.floor(effectiveHeight * 0.45), 200) : undefined;
	const detailHeight = hasNodes && typeof masterHeight === "number"
		? Math.max(effectiveHeight - masterHeight - 4, 200)
		: undefined;

	return React.createElement("div", {
		ref: containerRef,
		style: {
			display: "flex",
			flexDirection: "column",
			gap: 0,
			width: isFullscreen ? "100vw" : "100%",
			height: isFullscreen ? "100vh" : contentHeight,
			minHeight: hasNodes ? viewportHeight : undefined,
			overflow: "hidden",
			padding: 0,
			borderRadius: 0,
			background: token.colorBgLayout,
			position: isFullscreen ? "fixed" : "relative",
			top: isFullscreen ? 0 : "auto",
			left: isFullscreen ? 0 : "auto",
			zIndex: isFullscreen ? 9999 : "auto",
		}
	}, [
		!isFullscreen && React.createElement("button", {
			key: "fullscreen-btn",
			onClick: () => setIsFullscreen(true),
			title: "Toàn màn hình (F11)",
			style: {
				position: "absolute",
				top: 12,
				right: 12,
				zIndex: 10001,
				width: 36,
				height: 36,
				padding: 0,
			border: `1px solid ${token.colorBorder}`,
			borderRadius: token.borderRadiusSM,
			background: token.colorBgContainer,
			color: token.colorTextHeading,
				cursor: "pointer",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				fontSize: 16,
				lineHeight: 1,
				boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
				transition: "all 0.2s",
			}
		}, "⛶"),
		isFullscreen && React.createElement("div", {
			key: "fullscreen-overlay",
			style: {
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.1)",
				pointerEvents: "none",
				zIndex: 9998,
				transition: "background 0.3s",
			}
		}),
		isFullscreen && React.createElement("button", {
			key: "exit-fullscreen",
			onClick: () => setIsFullscreen(false),
			title: "Thoát toàn màn hình (Esc)",
			style: {
				position: "fixed",
				top: 16,
				right: 16,
				zIndex: 10002,
				width: 40,
				height: 40,
				padding: 0,
			border: `1px solid ${token.colorBorder}`,
			borderRadius: token.borderRadiusSM,
			background: token.colorBgContainer,
			color: token.colorTextHeading,
			cursor: "pointer",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			fontSize: 18,
			boxShadow: token.boxShadow,
				transition: "all 0.2s",
				fontFamily: "system-ui, -apple-system, sans-serif",
			}
		}, "✕"),
		React.createElement("div", {
			key: "master-panel",
			style: {
				...panelStyle,
				flex: hasNodes ? "0 0 auto" : "1 1 auto",
				height: hasNodes ? masterHeight : "100%",
				border: `1px solid ${token.colorBorder}`,
				borderRadius: 0,
			}
		}, React.createElement("div", {
			style: { flex: 1, minHeight: 0, overflow: "auto", width: "100%" }
		}, React.createElement(CsmDynamicGrid as any, {
			appId,
			permissions,
			menusPermissions,
			dataScope,
			menuId: (m_configs as any).menu_id,
			database,
			decrypt,
			m_configs,
			onSelectRow: (r: any) => setSelectRow(r),
			onDataChange,
		}))),
		hasNodes
			? React.createElement("div", {
				key: "detail-panel",
				style: {
					...panelStyle,
					flex: "1 1 auto",
					height: detailHeight,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
					border: `1px solid ${token.colorBorder}`,
					borderRadius: 0,
					background: token.colorBgContainer,
				}
			}, React.createElement(Tabs as any, {
				className: "csm-detail-tabs",
				items: tabItems,
				type: "card",
				size: "small",
				style: { 
					height: "100%", 
					display: "flex", 
					flexDirection: "column",
					background: token.colorBgContainer,
					color: token.colorTextHeading,
				},
				tabBarStyle: {
					marginBottom: 0,
					position: "relative",
					zIndex: 2,
					background: token.colorBgContainer,
					padding: "2px 4px",
					flex: "0 0 auto",
					border: `1px solid ${token.colorBorder}`,
					color: token.colorTextHeading,
				}
			}))
			: null,
	]);
}

