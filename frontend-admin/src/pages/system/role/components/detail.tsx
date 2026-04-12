import type { RoleItemType } from "#src/api/system";
import type { TreeDataNodeWithId } from "#src/components";
import { fetchAddRoleItem, fetchUpdateRoleItem } from "#src/api/system";
import { FormTreeItem } from "#src/components";

import {
	DrawerForm,
	ProFormRadio,
	ProFormText,
	ProFormTextArea,
} from "@ant-design/pro-components";
import { useMutation } from "@tanstack/react-query";
import { Form } from "antd";
import { useEffect,useState } from "react";
import { useTranslation } from "react-i18next";

interface DetailProps {
	treeData: any[]; // nhận mọi kiểu treeData, tương thích menuData
	title: React.ReactNode;
	open: boolean;
	detailData: Partial<RoleItemType>;
	onCloseChange: () => void;
	refreshTable?: () => void;
	flatParentMenus?: any[];
	appId?: string;
}

export function Detail({ title, open, onCloseChange, detailData, treeData, refreshTable }: DetailProps) {
		const updateRoleItemMutation = useMutation({ mutationFn: fetchUpdateRoleItem });
		const addRoleItemMutation = useMutation({ mutationFn: fetchAddRoleItem });
       const { t } = useTranslation();
       const [form] = Form.useForm<RoleItemType>();
       // Đệ quy loại bỏ node thiếu id
       function filterTreeWithId(nodes: any[]): any[] {
	       if (!Array.isArray(nodes)) return [];
	       return nodes
		       .filter(node => node && typeof node.id !== "undefined" && node.id !== null)
		       .map(node => ({
			       ...node,
			       children: filterTreeWithId(node.children)
		       }));
       }

       // State cho menus
       const [menus, setMenus] = useState<React.Key[]>(Array.isArray((detailData as any).menus) ? (detailData as any).menus : []);
       // Tạo safeTreeData từ treeData
       const safeTreeData = filterTreeWithId(Array.isArray(treeData) ? treeData : []);

	       useEffect(() => {
		       // Khi detailData thay đổi (mở drawer mới), đồng bộ lại toàn bộ form
		       if (open && detailData) {
			       form.setFieldsValue(detailData);
			       const newMenus = Array.isArray((detailData as any).menus) ? (detailData as any).menus : [];
			       setMenus(newMenus);
		       }
	       }, [detailData, open]);

	const onFinish = async (values: RoleItemType) => {
		// console.info(values);
		/* 有 id 则为修改，否则为新增 */
		if (detailData.id) {
			await updateRoleItemMutation.mutateAsync(values);
			window.$message?.success(t("common.updateSuccess"));
		}
		else {
			await addRoleItemMutation.mutateAsync(values);
			window.$message?.success(t("common.addSuccess"));
		}
		/* 刷新表格 */
		refreshTable?.();
		// 不返回不会关闭弹框
		return true;
	};


	// Nếu muốn debug, bật dòng sau:
	// console.log('safeTreeData:', safeTreeData);

	return (
		<DrawerForm<RoleItemType>
			title={title}
			open={open}
			onOpenChange={(visible) => {
				if (visible === false) {
					onCloseChange();
				}
			}}
			resize={{
				onResize() {
					// console.log('resize!');
				},
				maxWidth: window.innerWidth * 0.8,
				minWidth: 500,
			}}
			labelCol={{ span: 6 }}
			wrapperCol={{ span: 24 }}
			layout="horizontal"
			form={form}
			autoFocusFirstInput
			drawerProps={{
				destroyOnClose: true,
			}}
			onFinish={onFinish}
			initialValues={{
				status: 1,
				menus: [],
			}}
		>

			<ProFormText
				allowClear
				rules={[
					{
						required: true,
					},
				]}
				width="md"
				name="name"
				label={t("system.role.name")}
				tooltip={t("form.length", { length: 24 })}
			/>

			<ProFormText
				allowClear
				rules={[
					{
						required: true,
					},
				]}
				width="md"
				name="code"
				label={t("system.role.id")}
			/>

			<ProFormRadio.Group
				name="status"
				label={t("common.status")}
				radioType="button"
				options={[
					{
						label: t("common.enabled"),
						value: 1,
					},
					{
						label: t("common.deactivated"),
						value: 0,
					},
				]}
			/>

			<ProFormTextArea
				allowClear
				width="md"
				name="remark"
				label={t("common.remark")}
			/>

			<div style={{ marginBottom: 24 }}>
				<span style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>{t("system.role.assignMenu")}</span>
				<FormTreeItem
					key={safeTreeData.length + '-' + menus.length}
					treeData={safeTreeData}
					value={menus}
					onChange={v => {
						setMenus([...v]);
						form.setFieldsValue({ ...(form.getFieldsValue()), menus: [...v] });
					}}
				/>
			</div>
		</DrawerForm>
	);
};
