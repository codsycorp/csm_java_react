import React from "react";
import { Tag, Tooltip, Space } from "antd";
import type { MenuItemType } from "#src/api/system/menu";
import { isMasterDetailMenu, getMenuConfigDisplay } from "../utils/menu-logic";
import { useTranslation } from "react-i18next";

interface MenuConfigBadgeProps {
  menu: MenuItemType | Partial<MenuItemType>;
  showDetails?: boolean;
}

/**
 * Component hiển thị các badge thông tin cấu hình menu
 * Giúp người quản trị dễ dàng nhìn thấy cách menu được cấu hình
 */
export function MenuConfigBadge({ menu, showDetails = true }: MenuConfigBadgeProps) {
  const { t } = useTranslation();
  const isMasterDetail = isMasterDetailMenu(menu);
  const configDisplay = getMenuConfigDisplay(menu, t);

  if (!menu.table_name) {
    return null;
  }

  const childrenCount = (menu.nodes || []).length;

  return (
    <Space size="small">
      {/* Hiển thị loại form */}
      <Tooltip title={t("system.menu.badge.displayType") || "Cách hiển thị dữ liệu"}>
        <Tag color={isMasterDetail ? "blue" : "cyan"}>
          {configDisplay.typeFormLabel}
        </Tag>
      </Tooltip>

      {/* Hiển thị kiểu edit */}
      <Tooltip title={t("system.menu.badge.editType") || "Cách chỉnh sửa dòng"}>
        <Tag color={configDisplay.rowEditLabel === "Form" ? "green" : "orange"}>
          {configDisplay.rowEditLabel}
        </Tag>
      </Tooltip>

      {/* Nếu là Master-Detail, hiển thị số tab */}
      {isMasterDetail && childrenCount > 0 && (
        <Tooltip title={t("system.menu.badge.tabsHint", { count: childrenCount }) || `${childrenCount} menu con sẽ thành tab trong Detail Grid`}>
          <Tag color="magenta">
            {t("system.menu.badge.tabsCount", { count: childrenCount }) || `${childrenCount} Tab`}
          </Tag>
        </Tooltip>
      )}

      {/* Cảnh báo nếu là Master-Detail nhưng không có menu con */}
      {isMasterDetail && childrenCount === 0 && (
        <Tooltip title={t("system.menu.badge.noTabsHint") || "Master-Detail nhưng chưa có menu con"}>
          <Tag color="red">
            {t("system.menu.badge.noTabs") || "⚠️ Chưa có Tab"}
          </Tag>
        </Tooltip>
      )}
    </Space>
  );
}

export default MenuConfigBadge;
