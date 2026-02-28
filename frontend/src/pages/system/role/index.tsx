
import { useState, useRef } from "react";
import { ProTable, ActionType } from "@ant-design/pro-components";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { getConstantColumns } from "./constants";
import { fetchRoleList, fetchDeleteRoleItem, fetchMenuByRoleId } from "#src/api/system/role";
import { usePermissionStore } from "#src/store";
import { transformApiMenusToLayoutMenus } from "#src/store/permission";
import { Detail } from "./components/detail";

export default function Role() {
       const { t } = useTranslation();
       const [open, setOpen] = useState(false);
       const [title, setTitle] = useState("");
       const [detailData, setDetailData] = useState<any>({});
       const [treeData, setTreeData] = useState<any[]>([]);
       const actionRef = useRef<ActionType>();


		       // Lấy menu tree giống sidebar (đầy đủ label, key, ...)
				 const getMenuTreeForRole = () => {
								 const apiWholeMenus = usePermissionStore.getState().apiWholeMenus || [];
								 // Đảm bảo mỗi node có title là label hoặc name để FormTreeItem hiển thị đúng
								 const menus = transformApiMenusToLayoutMenus(apiWholeMenus as any);
								 const addTitle = (nodes: any[]): any[] =>
									 nodes.map((node) => ({
										 ...node,
										 title: node.label || node.name || node.title || '',
										 children: node.children ? addTitle(node.children) : undefined,
									 }));
								 return addTitle(menus);
				 };

		       // Đảm bảo menu đã có dữ liệu trước khi mở form
			       const ensureMenuReady = async () => {
				       let apiWholeMenus = usePermissionStore.getState().apiWholeMenus;
				       if (!apiWholeMenus || apiWholeMenus.length === 0) {
					       // Nếu chưa có, fetch lại menu (giống sidebar)
					       if (usePermissionStore.getState().handleAsyncRoutes) {
						       await usePermissionStore.getState().handleAsyncRoutes();
						       apiWholeMenus = usePermissionStore.getState().apiWholeMenus;
					       }
				       }
				       return apiWholeMenus;
			       };

				       const handleEdit = async (record: any) => {
					       setTitle(t("common.edit"));
					       // Lấy danh sách menu đã gán cho role từ API
					       let menus = record.menus;
					       if (record.id) {
						       try {
							       const res = await fetchMenuByRoleId({ id: record.id });
							       if (res?.result) {
								       menus = res.result;
							       }
						       } catch (e) {
							       // fallback nếu lỗi
						       }
					       }
					       setDetailData({ ...record, menus });
					       const _ = await ensureMenuReady();
					       const tree = getMenuTreeForRole();
					       setTreeData(tree);
					       if (tree && tree.length > 0) {
						       setOpen(true);
					       } else {
						       // Có thể show thông báo nếu cần
						       console.warn("Menu chưa sẵn sàng, không mở form");
					       }
				       };

				       const handleAdd = async () => {
					       setTitle(t("common.add"));
					       setDetailData({ menus: [] });
					       const _ = await ensureMenuReady();
					       const tree = getMenuTreeForRole();
					       setTreeData(tree);
					       if (tree && tree.length > 0) {
						       setOpen(true);
					       } else {
						       // Có thể show thông báo nếu cần
						       console.warn("Menu chưa sẵn sàng, không mở form");
					       }
				       };

       const handleDelete = async (id: string) => {
	       await fetchDeleteRoleItem(id);
	       actionRef.current?.reload();
       };

	       // Hàm đồng bộ lại menu sidebar sau khi thêm/sửa role
	       const refreshTableAndMenu = async () => {
		       actionRef.current?.reload();
		       if (usePermissionStore.getState().handleAsyncRoutes) {
			       await usePermissionStore.getState().handleAsyncRoutes();
		       }
	       };

	       return (
		       <>
			       <ProTable
				       rowKey="id"
				       columns={getConstantColumns(t)}
				       request={async (params) => {
					       const res = await fetchRoleList(params);
					       return {
						       data: res?.result?.list || [],
						       total: res?.result?.total || 0,
						       success: true,
					       };
				       }}
				       actionRef={actionRef}
				       toolBarRender={() => [
					       <Button key="add" type="primary" onClick={handleAdd}>{t("common.add")}</Button>
				       ]}
				       onRow={(record) => ({
					       onClick: () => handleEdit(record),
				       })}
				       pagination={{ showQuickJumper: true }}
				       search={false}
				       options={false}
			       />
			       <Detail
				       title={title}
				       open={open}
				       onCloseChange={() => setOpen(false)}
				       detailData={detailData}
				       treeData={treeData}
				       refreshTable={refreshTableAndMenu}
			       />
		       </>
	       );
}
