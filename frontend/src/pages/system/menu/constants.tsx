import type { MenuItemType } from "#src/api/system";
import type { ProColumns } from "@ant-design/pro-components";
import type { TFunction } from "i18next";

import { getBooleanOptions, getYesNoOptions } from "#src/constants";

import { Tag } from "antd";

/**
 * Lấy các tùy chọn loại menu
 */
export function getMenuTypeOptions(t: TFunction<"translation", undefined>) {
	return [
		{
			label: t("system.menu.menu"),
			value: 0,
		},
		{
			label: t("system.menu.iframe"),
			value: 1,
		},
		{
			label: t("system.menu.externalLink"),
			value: 2,
		},
		{
			label: t("system.menu.button"),
			value: 3,
		},
	];
}

/**
 * Lấy các tùy chọn loại hiển thị form
 * 1: Dạng bảng (Grid)
 * 2: Dạng Form Master-Detail
 */
export function getTypeFormOptions(t?: TFunction<"translation", undefined>) {
	return [
		{
			label: t ? t("system.menu.typeForm.grid") : "Dạng bảng",
			value: 1,
		},
		{
			label: t ? t("system.menu.typeForm.masterDetail") : "Dạng Form Master-Detail",
			value: 2,
		},
		{
			label: t ? t("system.menu.typeForm.crmWorkspace") : "CRM Workspace",
			value: 5,
		},
	];
}

/**
 * Lấy các tùy chọn kiểu chỉnh sửa dòng
 * 0: Form (popup/modal)
 * 1: Inline edit (chỉnh sửa trên dòng)
 */
export function getRowTypeEditOptions(t?: TFunction<"translation", undefined>) {
	return [
		{
			label: t ? t("system.menu.rowTypeEdit.form") : "Dạng Form",
			value: 0,
		},
		{
			label: t ? t("system.menu.rowTypeEdit.inline") : "Chỉnh sửa trên dòng",
			value: 1,
		},
	];
}

/**
 * Lấy các tùy chọn kiểu menu
 * 0: Kiểu cột (Vertical)
 * 1: Kiểu dòng (Horizontal/Row)
 */
export function getTypeMenuOptions(t?: TFunction<"translation", undefined>) {
	return [
		{
			label: t ? t("system.menu.typeMenu.vertical") : "Kiểu cột",
			value: 0,
		},
		{
			label: t ? t("system.menu.typeMenu.horizontal") : "Kiểu dòng",
			value: 1,
		},
	];
}

export function getConstantColumns(t: TFunction<"translation", undefined>): ProColumns<MenuItemType>[] {
	return [
		{
			dataIndex: "index",
			title: t("common.index"),
			valueType: "indexBorder",
			width: 80,
		},
		{
			title: t("system.menu.name"),
			dataIndex: "name",
			ellipsis: true,
			width: 200,
			render: (_, record) => {
				const rawLabel = record.label || record.name || record.id;
				// Translate i18n-style keys; otherwise show the provided label/name/id
				if (rawLabel && rawLabel.includes(".")) return t(rawLabel);
				// Fallback: check if ID maps to known i18n key
				const idMap: Record<string, string> = {
					"system": "common.menu.system",
					"user": "common.menu.user",
					"menu": "common.menu.menu",
					"developer": "common.menu.developer",
					"dept": "common.menu.permissionGroup",
				};
				if (record.id && idMap[record.id]) return t(idMap[record.id]);
				return rawLabel;
			},
			formItemProps: {
				rules: [
					{
						required: true,
						message: t("form.required"),
					},
				],
			},
		},
		{
			title: t("system.menu.routePath"),
			dataIndex: "path",
			width: 120,
			filters: true,
			onFilter: true,
			ellipsis: true,
		},
		{
			title: t("system.menu.menuOrder"),
			dataIndex: "order",
			valueType: "digit",
			width: 80,
		},
		{
			title: t("system.menu.menuIcon"),
			dataIndex: "icon",
			width: 130,
		},
		{
			disable: true,
			title: t("common.status"),
			dataIndex: "status",
			valueType: "select",
			width: 80,
			render: (_, record) => {
				const isEnabled = record.status === 1;
				return (
					<Tag color={isEnabled ? "success" : "default"}>
						{isEnabled ? t("common.enabled") : t("common.deactivated")}
					</Tag>
				);
			},
			valueEnum: {
				1: {
					text: t("common.enabled"),
				},
				0: {
					text: t("common.deactivated"),
				},
			},
		},
		{
			title: t("system.menu.menuType"),
			dataIndex: "menuType",
			width: 100,
			valueEnum: getMenuTypeOptions(t).reduce((acc, curr) => {
				acc[curr.value] = curr.label;
				return acc;
			}, {} as Record<number, string>),
		},
		{
			title: t("system.menu.componentUrl"),
			dataIndex: "component",
			width: 120,
			search: false,
		},
		{
			title: t("system.menu.keepAlive"),
			dataIndex: "keepAlive",
			valueType: "select",
			width: 80,
			render: (_, record) => {
				return t(record.keepAlive ? "common.yes" : "common.no");
			},
			valueEnum: getYesNoOptions(t).reduce((acc, curr) => {
				acc.set(curr.value, curr.label);
				return acc;
			}, new Map()),
		},
		{
			title: t("system.menu.hideInMenu"),
			dataIndex: "hideInMenu",
			valueType: "select",
			width: 120,
			render: (_, record) => {
				return t(record.hideInMenu ? "common.yes" : "common.no");
			},
			valueEnum: getYesNoOptions(t).reduce((acc, curr) => {
				acc.set(curr.value, curr.label);
				return acc;
			}, new Map()),
		},
		{
			title: t("system.menu.currentActiveMenu"),
			dataIndex: "currentActiveMenu",
			width: 120,
		},
		{
			title: t("system.menu.iframeLink"),
			dataIndex: "iframeLink",
			width: 120,
		},
		{
			title: t("system.menu.externalLink"),
			dataIndex: "externalLink",
			width: 120,
		},
		{
			title: t("common.createTime"),
			dataIndex: "createTime",
			valueType: "date",
			width: 150,
			search: false,
		},
		{
			title: t("common.updateTime"),
			dataIndex: "updateTime",
			valueType: "dateTime",
			width: 170,
			search: false,
		},
	];
}
