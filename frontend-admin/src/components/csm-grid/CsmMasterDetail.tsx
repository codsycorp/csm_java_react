import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spin, Tabs, theme } from "antd";
import CsmDynamicGrid from "./CsmDynamicGrid";
import { buildDetailGridSelectEnums } from "./CsmEditModal";
import { useComboPrefetchGate } from "./combo-prefetch";
import { flattenAppMenusById } from "./combo-utils";
import { usePreferences } from "#src/hooks/use-preferences";
import { useAppStore, usePermissionStore } from "#src/store";
import {
	buildMasterRowKey,
	getPrimaryKeyFieldsFromConfig,
	resolveMasterRowFromGridSelection,
} from "./master-detail-utils";

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

function buildStableTextHash(input: string): string {
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = ((hash << 5) - hash) + input.charCodeAt(i);
		hash |= 0;
	}
	return String(hash >>> 0);
}

export default function CsmMasterDetail(props: any) {
	const { appId, permissions, menusPermissions, dataScope, database, decrypt, m_configs, onDataChange, menuId } = props;
	const { isDark } = usePreferences();
	const { token } = theme.useToken();
	const globalDatabase = useAppStore((state) => state.database);
	const setTableData = useAppStore((state) => state.setTableData);
	const mergeTableRows = useAppStore((state) => state.mergeTableRows);
	const resolvedDatabase = useMemo(() => ({ ...(database || {}), ...(globalDatabase || {}) }), [database, globalDatabase]);
	const apiWholeMenus = usePermissionStore((state) => state.apiWholeMenus);
	const menuById = useMemo(() => flattenAppMenusById(apiWholeMenus || []), [apiWholeMenus]);
	const [selectRow, setSelectRow] = useState<any>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const masterPkFields = useMemo(() => getPrimaryKeyFieldsFromConfig(m_configs), [m_configs]);
	const [viewportHeight, setViewportHeight] = useState(() => {
		if (typeof window === "undefined") return 760;
		return Math.max(window.innerHeight - 220, 520);
	});

	const nodes = (m_configs && m_configs.nodes) || [];
	const hasNodes = nodes.length > 0;
	const masterTableName = String(m_configs?.table_name || "").trim();
	const inheritedMenuId = (menuId ?? (m_configs as any)?.menu_id ?? (m_configs as any)?.id) as any;

	const allComboFields = useMemo(() => {
		const masterFields = Array.isArray(m_configs?.table) ? m_configs.table : [];
		const detailFields = nodes.flatMap((node: any) => (Array.isArray(node?.table) ? node.table : []));
		return [...masterFields, ...detailFields];
	}, [m_configs?.table, nodes]);

	const comboGate = useComboPrefetchGate({
		fields: allComboFields,
		signatureSuffix: `master-detail:${masterTableName}:${nodes.map((n: any) => n?.id).join(",")}`,
		fallbackAppId: appId,
		menuById,
		database: resolvedDatabase,
		setTableData,
		mergeTableRows,
		decrypt,
		evalContext: {
			seft: { m_configs, context: { select_row: selectRow }, database: resolvedDatabase, appId },
			database: resolvedDatabase,
		},
	});

	const patchMasterRowInStore = useCallback((nextMasterRow: Record<string, any>) => {
		if (!masterTableName || !nextMasterRow) return;
		const entry = useAppStore.getState().database?.[masterTableName];
		if (!entry?.rows) return;
		const masterKey = buildMasterRowKey(nextMasterRow, masterPkFields);
		const nextRows = entry.rows.map((row) => (
			buildMasterRowKey(row, masterPkFields) === masterKey ? nextMasterRow : row
		));
		setTableData(masterTableName, { ...entry, rows: nextRows });
	}, [masterPkFields, masterTableName, setTableData]);

	const handleMasterSelectRow = useCallback((row: any) => {
		if (!row) {
			setSelectRow(null);
			return;
		}
		const masterRows = resolvedDatabase?.[masterTableName]?.rows;
		const resolved = resolveMasterRowFromGridSelection(row, masterRows, masterPkFields);
		// Prefer the freshest row from store (after save), fallback to emitted selection row.
		const merged = resolved ? { ...row, ...resolved } : row;
		setSelectRow(merged);
	}, [resolvedDatabase, masterPkFields, masterTableName]);

	const handleDetailRowsChange = useCallback((detailFieldName: string, rows: Record<string, any>[]) => {
		setSelectRow((prev: Record<string, any> | null) => {
			if (!prev) return prev;
			// Vue parity: detail tab data is embedded in a master row field (node.table_name), not a separate table.
			const nextMasterRow = { ...prev, [detailFieldName]: Array.isArray(rows) ? [...rows] : [] };
			patchMasterRowInStore(nextMasterRow);
			return nextMasterRow;
		});
		onDataChange?.();
	}, [onDataChange, patchMasterRowInStore]);

	const handleMasterDataChange = useCallback(() => {
		onDataChange?.();
		if (!selectRow || !masterTableName) return;
		const masterRows = useAppStore.getState().database?.[masterTableName]?.rows;
		if (!Array.isArray(masterRows) || masterRows.length === 0) return;
		const selectedKey = buildMasterRowKey(selectRow, masterPkFields);
		if (!selectedKey) return;
		const latestRow = masterRows.find((row: any) => buildMasterRowKey(row, masterPkFields) === selectedKey);
		if (latestRow) {
			setSelectRow({ ...latestRow });
		}
	}, [onDataChange, selectRow, masterTableName, masterPkFields]);

	useEffect(() => {
		if (!selectRow || !masterTableName) return;
		const masterRows = resolvedDatabase?.[masterTableName]?.rows;
		if (!Array.isArray(masterRows) || masterRows.length === 0) return;

		const selectedKey = buildMasterRowKey(selectRow, masterPkFields);
		if (!selectedKey) return;

		const latestRow = masterRows.find((row: any) => buildMasterRowKey(row, masterPkFields) === selectedKey);
		if (!latestRow) return;

		let currentSignature = "";
		let latestSignature = "";
		try {
			currentSignature = JSON.stringify(selectRow);
			latestSignature = JSON.stringify(latestRow);
		} catch {
			currentSignature = selectedKey;
			latestSignature = selectedKey;
		}

		if (currentSignature !== latestSignature) {
			setSelectRow({ ...latestRow });
		}
	}, [resolvedDatabase, masterPkFields, masterTableName, selectRow]);

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

	const detailSelectEnumsByNode = useMemo(() => {
		const map = new Map<string, Record<string, unknown>>();
		const contextRow = selectRow || undefined;
		nodes.forEach((node: any) => {
			const nodeId = String(node?.id || "");
			if (!nodeId) return;
			map.set(
				nodeId,
				buildDetailGridSelectEnums(node?.table || [], resolvedDatabase, decrypt, {
					m_configs: node,
					context: { select_row: contextRow },
				}),
			);
		});
		return map;
	}, [nodes, resolvedDatabase, decrypt, selectRow]);

	const tabItems = useMemo(() => nodes.map((node: any) => {
		const nodeLabel = resolveMultilingualText(node.label, node.id || "");
		const label = nodeLabel.includes(".") ? nodeLabel.split(".").slice(-1)[0] : nodeLabel;
		const detailGridSelectEnums = detailSelectEnumsByNode.get(String(node.id)) || {};
		const detailFieldName = String(node.table_name || "").trim();
		const masterKey = selectRow ? buildMasterRowKey(selectRow, masterPkFields) : "none";
		const detailRaw = detailFieldName ? (selectRow as any)?.[detailFieldName] : undefined;
		let detailText = "";
		if (typeof detailRaw === "string") {
			detailText = detailRaw;
		} else {
			try {
				detailText = JSON.stringify(detailRaw ?? []);
			} catch {
				detailText = String(detailRaw ?? "");
			}
		}
		const detailVersionKey = buildStableTextHash(detailText);
		const detailGridKey = `${String(node.id)}-${masterKey}-${detailVersionKey}`;
		const children = React.createElement("div", {
			style: {
				height: "100%",
				minHeight: 0,
				overflow: "auto",
			}
		}, React.createElement(CsmDynamicGrid as any, {
			key: `grid-${detailGridKey}`,
			gridInstanceKey: `detail-${detailGridKey}`,
			appId,
			permissions,
			menusPermissions,
			dataScope,
			menuId: inheritedMenuId,
			database: resolvedDatabase,
			decrypt,
			m_configs: {
				...node,
				table_name: node.table_name,
				table: node.table,
				type_form: 1,
				row_type_edit: node?.row_type_edit ?? 1,
				// In master-detail browse mode, detail tabs are view-only.
				// Detail CRUD is available in CsmEditModal when adding/editing master.
				g_readonly: true,
				selectEnumsOverride: detailGridSelectEnums,
			},
			context: { select_row: selectRow || undefined },
			inheritMasterPermissions: true,
			masterMenuId: inheritedMenuId,
			isDetailGrid: true,
			comboGateExternalReady: true,
			onDetailRowsChange: (rows: Record<string, any>[]) => handleDetailRowsChange(detailFieldName, rows),
			onDataChange,
		}));
		return { key: String(node.id), label, children } as any;
	}), [nodes, appId, permissions, menusPermissions, dataScope, inheritedMenuId, resolvedDatabase, decrypt, m_configs, selectRow, onDataChange, detailSelectEnumsByNode, handleDetailRowsChange, masterPkFields]);

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

	return React.createElement(Spin, {
		spinning: comboGate.blockingBusy,
		tip: comboGate.blockingBusy ? "Đang tải dữ liệu combo (co)..." : undefined,
		style: { maxHeight: "none" },
	}, React.createElement("div", {
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
			gridInstanceKey: `master-${String(m_configs?.id || masterTableName || "main")}`,
			appId,
			permissions,
			menusPermissions,
			dataScope,
			menuId: (m_configs as any).menu_id,
			database: resolvedDatabase,
			shareTableState: true,
			decrypt,
			m_configs,
			onSelectRow: handleMasterSelectRow,
			onDataChange: handleMasterDataChange,
			embeddedPanelContainer: containerRef,
			comboGateExternalReady: true,
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
				destroyInactiveTabPane: false,
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
	]));
}
