import type { MenuItemType } from "#src/api/system/menu";
import type { TFunction } from "i18next";
import { BasicButton } from "#src/components";
import { PlusCircleOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { Tag, Popconfirm, Space, Table } from "antd";
import type { TableColumnsType } from "antd";

type MenuTreeItem = MenuItemType & { children?: MenuTreeItem[] };

interface MenuTreeTableProps {
	data: MenuTreeItem[];
	t: TFunction;
	onEdit: (record: MenuItemType) => void;
	onDelete: (id: string) => void;
	onAdd: (parentId?: string) => void;
	hasAuth: (action: string) => boolean;
	loading?: boolean;
}

export function MenuTreeTable({
	data,
	t,
	onEdit,
	onDelete,
	onAdd,
	hasAuth,
	loading = false,
}: MenuTreeTableProps) {
	const columns: TableColumnsType<MenuTreeItem> = [
		{
			title: t("system.menu.name"),
			dataIndex: "name",
			key: "name",
			width: 180,
			responsive: ['md'],
			render: (_, record) => {
				const rawLabel = record.label || record.name || record.id;
				if (rawLabel && rawLabel.includes(".")) return t(rawLabel);
				const idMap: Record<string, string> = {
					"system": "common.menu.system",
					"user": "common.menu.user",
					"role": "common.menu.role",
					"menu": "common.menu.menu",
					"developer": "common.menu.developer",
					"dept": "common.menu.dept",
				};
				if (record.id && idMap[record.id]) return t(idMap[record.id]);
				return rawLabel;
			},
		},
		{
			title: t("system.menu.routePath"),
			dataIndex: "path",
			key: "path",
			width: 120,
			responsive: ['lg'],
			ellipsis: true,
		},
		{
			title: t("system.menu.menuOrder"),
			dataIndex: "order",
			key: "order",
			width: 80,
		},
		{
			title: t("system.menu.menuIcon"),
			dataIndex: "icon",
			key: "icon",
			width: 80,
			responsive: ['md'],
		},
		{
			title: t("common.status"),
			dataIndex: "status",
			key: "status",
			width: 80,
			responsive: ['md'],
			render: (_, record) => {
				return <Tag color={record.status === 1 ? "success" : "default"}>{record.status === 1 ? t("common.enabled") : t("common.deactivated")}</Tag>;
			},
		},
		{
			title: t("system.menu.menuType"),
			dataIndex: "menuType",
			key: "menuType",
			width: 100,
			responsive: ['lg'],
			render: (_, record) => {
				const typeMap: Record<number, string> = {
					0: t("system.menu.menu"),
					1: t("system.menu.iframe"),
					2: t("system.menu.externalLink"),
					3: t("system.menu.button"),
				};
				return typeMap[record.menuType as number] || "-";
			},
		},
		{
			title: t("system.menu.componentUrl"),
			dataIndex: "component",
			key: "component",
			width: 100,
			responsive: ['lg'],
			ellipsis: true,
		},
		{
			title: t("common.action"),
			key: "action",
			width: 150,
			fixed: "right",
			render: (_, record) => {
				return (
					<Space size="small" wrap>
						<BasicButton
							type="link"
							size="small"
							disabled={!hasAuth("add")}
							icon={<PlusCircleOutlined />}
							onClick={() => onAdd(record.id)}
							title={t("system.menu.addSubMenu") || "Add sub-menu"}
						>
							{t("common.add")}
						</BasicButton>
						<BasicButton
							type="link"
							size="small"
							disabled={!hasAuth("update")}
							onClick={() => onEdit(record)}
						>
							{t("common.edit")}
						</BasicButton>
						<Popconfirm
							title={t("common.confirmDelete")}
							onConfirm={() => onDelete(record.id)}
							okText={t("common.confirm")}
							cancelText={t("common.cancel")}
						>
							<BasicButton
								type="link"
								danger
								size="small"
								disabled={!hasAuth("delete")}
							>
								{t("common.delete")}
							</BasicButton>
						</Popconfirm>
					</Space>
				);
			},
		},
	];

	return (
		<Table<MenuTreeItem>
			columns={columns}
			dataSource={data}
			loading={loading}
			pagination={false}
			rowKey={(record) => record.id}
			bordered
			size="small"
			expandable={{
				expandedRowRender: (record) => {
					if (!record.children || record.children.length === 0) {
						return null;
					}
					return (
						<div className="bg-gray-50 p-4">
							<MenuTreeTable
								data={record.children}
								t={t}
								onEdit={onEdit}
								onDelete={onDelete}
								onAdd={onAdd}
								hasAuth={hasAuth}
								loading={loading}
							/>
						</div>
					);
				},
			}}
		/>
	);
}
