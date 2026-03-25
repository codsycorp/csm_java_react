import type { MenuItemType } from "#src/api/system/menu";
import type { TFunction } from "i18next";
import { BasicButton } from "#src/components";
import { PlusCircleOutlined, MinusCircleOutlined } from "@ant-design/icons";
import { Tag, Popconfirm, Space, Tree } from "antd";
import useToken from "antd/es/theme/useToken";
import type { TreeDataNode } from "antd";
import { getMenuConfigDisplay } from "./utils/menu-logic";
import MenuConfigBadge from "./components/MenuConfigBadge";

/**
 * Hàm lấy nhãn menu ưu tiên theo ngôn ngữ hiện tại
 * Thứ tự: VI (label) → EN (label_en) → ZH (label_zh)
 * Hỗ trợ dịch i18n key nếu label là i18n key
 */
const ID_TO_I18N_KEY: Record<string, string> = {
	"system": "common.menu.system",
	"user": "common.menu.user",
	"menu": "common.menu.menu",
	"developer": "common.menu.developer",
	"dept": "common.menu.permissionGroup",
};

function getMenuLabel(menu: MenuItemType, lang: string = 'vi', t?: TFunction): string {
	const currentLang = lang.toLowerCase().startsWith('en') ? 'en' : lang.toLowerCase().startsWith('zh') ? 'zh' : 'vi';
	
	if (currentLang === 'en' && menu.label_en) return menu.label_en;
	if (currentLang === 'zh' && menu.label_zh) return menu.label_zh;
	
	// Fallback to VI - check if label is i18n key
	if (menu.label) {
		// If label looks like an i18n key (e.g., "common.menu.system"), translate it
		if (t && menu.label.includes('.')) {
			return t(menu.label);
		}
		return menu.label;
	}
	if (menu.name) {
		// Same for name field
		if (t && menu.name.includes('.')) {
			return t(menu.name);
		}
		return menu.name;
	}
	// Try ID mapping as final fallback
	if (menu.id && t && ID_TO_I18N_KEY[menu.id]) {
		return t(ID_TO_I18N_KEY[menu.id]);
	}
	return menu.id || '';
}

type MenuTreeItem = MenuItemType & { children?: MenuTreeItem[] };

interface MenuTreeViewProps {
	data: MenuTreeItem[];
	t: TFunction;
	lang?: string;
	onEdit: (record: MenuItemType) => void;
	onDelete: (id: string) => void;
	onAdd: (parentId?: string) => void;
	hasAuth: (action: string) => boolean;
	loading?: boolean;
}

function convertToTreeData(
	data: MenuTreeItem[],
	t: TFunction,
	lang: string,
	onEdit: (record: MenuItemType) => void,
	onDelete: (id: string) => void,
	onAdd: (parentId?: string) => void,
	hasAuth: (action: string) => boolean,
	token: ReturnType<typeof useToken>[1],
	keySet = new Set<string>(),
): TreeDataNode[] {
	return data.map((item) => {
		let uniqueKey = item.id;
		let counter = 1;
		while (keySet.has(uniqueKey)) {
			uniqueKey = `${item.id}_${counter}`;
			counter++;
		}
		keySet.add(uniqueKey);
		
		// Lấy cấu hình hiển thị menu
		const configDisplay = getMenuConfigDisplay(item);

		return {
			key: uniqueKey,
			title: (
				<div className="flex items-center justify-between w-full gap-2 py-1">
					<div className="flex-1 flex items-center gap-4">
						{/* Menu Name - Multilingual */}
						<div className="min-w-[200px] font-medium">
							<div className="flex items-center gap-2">
								<span>{getMenuLabel(item, lang, t)}</span>
								{(item.label_en || item.label_zh) && (
									<div className="flex gap-1 text-xs">
										{item.label_en && <Tag color="blue">EN: {item.label_en}</Tag>}
										{item.label_zh && <Tag color="red">ZH: {item.label_zh}</Tag>}
									</div>
								)}
							</div>
						</div>

						{/* Path */}
						<div className="min-w-[120px] text-sm" style={{ color: token.colorTextSecondary }}>
							{item.path || "-"}
						</div>

						{/* Order */}
						<div className="min-w-[80px] text-sm" style={{ color: token.colorTextSecondary }}>
							{item.order || "-"}
						</div>

						{/* Icon */}
						<div className="min-w-[80px] text-sm" style={{ color: token.colorTextSecondary }}>
							{item.icon || "-"}
						</div>

						{/* Status */}
						<div className="min-w-[100px]">
							<Tag color={item.status === 1 ? "success" : "default"}>
								{item.status === 1 ? t("common.enabled") : t("common.deactivated")}
							</Tag>
						</div>

						{/* Type */}
						<div className="min-w-[100px] text-sm" style={{ color: token.colorTextSecondary }}>
							{(() => {
								const typeMap: Record<number, string> = {
									0: t("system.menu.menu"),
									1: t("system.menu.iframe"),
									2: t("system.menu.externalLink"),
									3: t("system.menu.button"),
								};
								return typeMap[item.menuType as number] || "-";
							})()}
						</div>

						{/* Component */}
						<div className="min-w-[120px] text-sm truncate" style={{ color: token.colorTextSecondary }}>
							{item.component || "-"}
						</div>

					{/* Menu Config Badge - Hiển thị loại menu */}
					{item.table_name && (
						<MenuConfigBadge menu={item} showDetails={true} />
					)}
					</div>

					{/* Actions */}
					<div className="flex-shrink-0 flex items-center gap-1">
						<BasicButton
							type="text"
							size="small"
							disabled={!hasAuth("add")}
							icon={<PlusCircleOutlined />}
							onClick={(e) => {
								e.stopPropagation();
								onAdd(item.id);
							}}
							title={t("system.menu.addSubMenu") || "Add sub-menu"}
						/>
						<BasicButton
							type="link"
							size="small"
							disabled={!hasAuth("update")}
							onClick={(e) => {
								e.stopPropagation();
								onEdit(item);
							}}
						>
							{t("common.edit")}
						</BasicButton>
						<Popconfirm
							title={t("common.confirmDelete")}
							onConfirm={(e) => {
								e?.stopPropagation();
								onDelete(item.id);
							}}
							okText={t("common.confirm")}
							cancelText={t("common.cancel")}
						>
							<BasicButton
								type="link"
								danger
								size="small"
								disabled={!hasAuth("delete")}
								onClick={(e) => e.stopPropagation()}
							>
								{t("common.delete")}
							</BasicButton>
						</Popconfirm>
					</div>
				</div>
			),
			// Hiển thị tất cả menu con (không lọc)
			children: item.children && item.children.length > 0 
				? convertToTreeData(
						item.children as MenuTreeItem[],
						t,
						lang,
						onEdit,
						onDelete,
						onAdd,
						hasAuth,
						token,
						keySet,
					)
				: undefined,
		};
	});
}

export function MenuTreeView({
	data,
	t,
	lang = "vi",
	onEdit,
	onDelete,
	onAdd,
	hasAuth,
	loading = false,
}: MenuTreeViewProps) {
	const [, token] = useToken();
	const treeData = convertToTreeData(data, t, lang, onEdit, onDelete, onAdd, hasAuth, token);

	return (
		<div className="w-full">
			{/* Header */}
			<div
				className="sticky top-0 z-10 px-4 py-3 rounded-t-lg"
				style={{
					backgroundColor: token.colorBgContainer,
					borderColor: token.colorBorder,
					borderBottomWidth: 1,
				}}
			>
				<div className="flex items-center gap-2">
					{/* Menu Name */}
					<div className="min-w-[200px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.name")}
					</div>

					{/* Path */}
					<div className="min-w-[120px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.routePath")}
					</div>

					{/* Order */}
					<div className="min-w-[80px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.menuOrder")}
					</div>

					{/* Icon */}
					<div className="min-w-[80px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.menuIcon")}
					</div>

					{/* Status */}
					<div className="min-w-[100px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("common.status")}
					</div>

					{/* Type */}
					<div className="min-w-[100px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.menuType")}
					</div>

					{/* Component */}
					<div className="min-w-[120px] font-semibold text-sm" style={{ color: token.colorTextHeading }}>
						{t("system.menu.componentUrl")}
					</div>

					{/* Actions */}
					<div className="flex-1" />
					<div className="min-w-[150px] font-semibold text-sm text-right" style={{ color: token.colorTextHeading }}>
						{t("common.action")}
					</div>
				</div>
			</div>

			{/* Tree */}
			<div
				className="overflow-auto rounded-b-lg"
				style={{
					backgroundColor: token.colorBgContainer,
					borderColor: token.colorBorder,
					borderWidth: 1,
					borderTopWidth: 0,
				}}
			>
				{treeData.length === 0 ? (
					<div className="text-center py-8" style={{ color: token.colorTextSecondary }}>
						{t("common.noData")}
					</div>
				) : (
					<Tree
						treeData={treeData}
						defaultExpandAll
						showLine
						blockNode
						className="[&_.ant-tree-node-content-wrapper]:!bg-transparent [&_.ant-tree-node-content-wrapper]:!pl-0"
					/>
				)}
			</div>
		</div>
	);
}
