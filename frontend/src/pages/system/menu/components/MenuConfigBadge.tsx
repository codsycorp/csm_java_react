import React from "react";
import { Tag, Tooltip, Space } from "antd";
import type { MenuItemType } from "#src/api/system/menu";
import { isMasterDetailMenu, getMenuConfigDisplay } from "../utils/menu-logic";

interface MenuConfigBadgeProps {
  menu: MenuItemType | Partial<MenuItemType>;
  showDetails?: boolean;
}

/**
 * Component hiển thị các badge thông tin cấu hình menu
 * Giúp người quản trị dễ dàng nhìn thấy cách menu được cấu hình
 */
export function MenuConfigBadge({ menu, showDetails = true }: MenuConfigBadgeProps) {
  const isMasterDetail = isMasterDetailMenu(menu);
  const configDisplay = getMenuConfigDisplay(menu);

  if (!menu.table_name) {
    return null;
  }

  const childrenCount = (menu.nodes || []).length;

  return (
    <Space size="small">
      {/* Hiển thị loại form */}
      <Tooltip title="Cách hiển thị dữ liệu">
        <Tag color={isMasterDetail ? "blue" : "cyan"}>
          {configDisplay.typeFormLabel}
        </Tag>
      </Tooltip>

      {/* Hiển thị kiểu edit */}
      <Tooltip title="Cách chỉnh sửa dòng">
        <Tag color={configDisplay.rowEditLabel === "Form" ? "green" : "orange"}>
          {configDisplay.rowEditLabel}
        </Tag>
      </Tooltip>

      {/* Nếu là Master-Detail, hiển thị số tab */}
      {isMasterDetail && childrenCount > 0 && (
        <Tooltip title={`${childrenCount} menu con sẽ thành tab trong Detail Grid`}>
          <Tag color="magenta">
            {childrenCount} Tab
          </Tag>
        </Tooltip>
      )}

      {/* Cảnh báo nếu là Master-Detail nhưng không có menu con */}
      {isMasterDetail && childrenCount === 0 && (
        <Tooltip title="Master-Detail nhưng chưa có menu con">
          <Tag color="red">
            ⚠️ Chưa có Tab
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
}

export default MenuConfigBadge;
