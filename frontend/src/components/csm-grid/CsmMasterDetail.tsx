import React, { useState } from "react";
import { Tabs, Space, Typography, Divider } from "antd";
import CsmDynamicGrid from "./CsmDynamicGrid";
import { buildDetailGridSelectEnums } from "./CsmEditModal";

export default function CsmMasterDetail(props: any) {
	const { appId, permissions, menusPermissions, database, decrypt, m_configs, onDataChange } = props;
	const [selectRow, setSelectRow] = useState<any>(null);

	const nodes = (m_configs && m_configs.nodes) || [];

	const tabItems = nodes.map((node: any) => {
		const label = (node.label && node.label.split(".").slice(-1)[0]) || node.label;
		const detailGridSelectEnums = buildDetailGridSelectEnums(node?.table || [], database, decrypt, { m_configs: node, context: { select_row: selectRow || undefined } });
		const children = React.createElement(CsmDynamicGrid as any, {
			key: `grid-${node.id}`,
			appId,
			permissions,
			menusPermissions,
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
		});
		return { key: String(node.id), label, children } as any;
	});

	const children: any[] = [];
	
	// Master grid section with header
	children.push(
		React.createElement(Space, { 
			key: "master-space",
			direction: "vertical",
			size: "large",
			style: { width: "100%", marginBottom: nodes.length > 0 ? 24 : 0 }
		}, [
			React.createElement(Typography.Title, {
				key: "master-title",
				level: 4,
				style: { margin: 0, color: "#1890ff" }
			}, m_configs.label || "Master"),
			React.createElement(CsmDynamicGrid as any, {
				key: "master-grid",
				appId,
				permissions,
				menusPermissions,
				menuId: (m_configs as any).menu_id,
				database,
				decrypt,
				m_configs,
				onSelectRow: (r: any) => setSelectRow(r),
				onDataChange,
			}),
		])
	);
	
	// Detail grids with Tabs if exists
	if (nodes.length > 0) {
		children.push(
			React.createElement(Divider, { key: "divider", style: { margin: "24px 0" } })
		);
		children.push(
			React.createElement(Space, {
				key: "detail-space",
				direction: "vertical",
				size: "middle",
				style: { width: "100%" }
			}, [
				React.createElement(Typography.Title, {
					key: "detail-title",
					level: 4,
					style: { margin: 0, color: "#52c41a" }
				}, "Chi tiết"),
				React.createElement(Tabs as any, { 
					key: "details-tabs",
					items: tabItems,
					type: "card",
					size: "large",
					style: { marginTop: 8 }
				})
			])
		);
	}

	return React.createElement(React.Fragment, null, ...children);
}
