import type { MenuItemType } from "#src/api/system/menu";

/**
 * Kiểm tra xem menu có phải là dạng Master-Detail không
 * Nếu menu có table_name và type_form === 2, thì menu con sẽ thành tab trong detail grid
 */
export function isMasterDetailMenu(menu: MenuItemType | Partial<MenuItemType>): boolean {
  return !!(menu.table_name && Number(menu.type_form) === 2);
}

/**
 * Lọc menu con: chỉ hiển thị menu con nếu menu cha KHÔNG phải là Master-Detail
 */
export function filterVisibleChildren(menu: MenuItemType | Partial<MenuItemType>): (MenuItemType | Partial<MenuItemType>)[] {
  // Nếu là Master-Detail menu, không hiển thị children (chúng sẽ thành tab)
  if (isMasterDetailMenu(menu)) {
    return [];
  }
  // Nếu không phải Master-Detail, hiển thị children bình thường
  return (menu.nodes || []) as (MenuItemType | Partial<MenuItemType>)[];
}

/**
 * Lấy danh sách menu con để sử dụng làm TAB trong Detail Grid
 * Chỉ áp dụng khi menu cha là Master-Detail (type_form === 2 và có table_name)
 */
export function getDetailTabs(menu: MenuItemType | Partial<MenuItemType>): MenuItemType[] {
  if (!isMasterDetailMenu(menu)) {
    return [];
  }
  return (menu.nodes || []) as MenuItemType[];
}

/**
 * Xác định loại chỉnh sửa dựa trên row_type_edit
 * 0: Form (popup/modal)
 * 1: Inline edit (chỉnh sửa trên dòng)
 */
export function getEditType(menu: MenuItemType | Partial<MenuItemType>): "form" | "inline" {
  const rowTypeEdit = Number(menu.row_type_edit || 0);
  return rowTypeEdit === 1 ? "inline" : "form";
}

/**
 * Xác định loại hiển thị dựa trên type_form
 * 1: Dạng bảng (Grid)
 * 2: Dạng Form Master-Detail
 */
export function getDisplayType(menu: MenuItemType | Partial<MenuItemType>): "grid" | "master-detail" {
  const typeForm = Number(menu.type_form || 1);
  return typeForm === 2 ? "master-detail" : "grid";
}

/**
 * Xác định loại menu dựa trên type_menu
 * 0: Kiểu Cột (Vertical)
 * 1: Kiểu dòng (Horizontal/Row)
 */
export function getMenuType(menu: MenuItemType | Partial<MenuItemType>): "column" | "row" {
  const typeMenu = Number(menu.type_menu || 0);
  return typeMenu === 1 ? "row" : "column";
}

/**
 * Build tree structure với logic filter menu con
 * Nếu menu là Master-Detail, không hiển thị children trong tree
 */
export function buildMenuTree(
  items: (MenuItemType | Partial<MenuItemType>)[]
): (MenuItemType & { children?: any[] })[] {
  return items.map((item) => {
    const children = filterVisibleChildren(item);
    return {
      ...item,
      children: children.length > 0 ? buildMenuTree(children as MenuItemType[]) : undefined,
    } as MenuItemType & { children?: any[] };
  });
}

/**
 * Lấy thông tin chi tiết về cách hiển thị menu
 */
export interface MenuDisplayConfig {
  isMasterDetail: boolean;
  displayType: "grid" | "master-detail";
  editType: "form" | "inline";
  menuType: "column" | "row";
  detailTabs: MenuItemType[];
  showChildren: boolean;
}

export function getMenuDisplayConfig(menu: MenuItemType | Partial<MenuItemType>): MenuDisplayConfig {
  const isMasterDetail = isMasterDetailMenu(menu);
  return {
    isMasterDetail,
    displayType: getDisplayType(menu),
    editType: getEditType(menu),
    menuType: getMenuType(menu),
    detailTabs: getDetailTabs(menu),
    showChildren: !isMasterDetail,
  };
}

/**
 * Format thông tin menu để hiển thị tag/badge
 */
export function getMenuConfigDisplay(menu: MenuItemType | Partial<MenuItemType>): {
  typeFormLabel: string;
  rowEditLabel: string;
  configBadge: string;
} {
  const typeForm = Number(menu.type_form || 1);
  const rowTypeEdit = Number(menu.row_type_edit || 0);

  const typeFormMap: Record<number, string> = {
    1: "Dạng bảng",
    2: "Form Master-Detail",
  };

  const rowEditMap: Record<number, string> = {
    0: "Form",
    1: "Inline",
  };

  const isMasterDetail = isMasterDetailMenu(menu);
  const configBadge = isMasterDetail ? "Master-Detail" : "Bảng";

  return {
    typeFormLabel: typeFormMap[typeForm] || "N/A",
    rowEditLabel: rowEditMap[rowTypeEdit] || "N/A",
    configBadge,
  };
}
