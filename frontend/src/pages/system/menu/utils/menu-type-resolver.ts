/**
 * Menu Type Resolver Utility
 * Handles resolution and rendering of different menu types:
 * - type_form = 1: Data Table Grid
 * - type_form = 2: Master-Detail Form
 * - type_form = 3: Dynamic Link (external/internal redirect)
 * - type_form = 4: Dynamic Code (execute JavaScript template from sys_autos)
 * - type_form = 5: CRM Workspace (Kanban + Inventory + Activities + Analytics)
 */

import type { MenuItemType } from "#src/api/system/menu";

/**
 * Menu type enumeration
 */
export enum MenuFormType {
  TABLE = 1,                  // Dạng bảng
  MASTER_DETAIL = 2,         // Dạng Form Master-Detail
  DYNAMIC_LINK = 3,          // Liên kết động
  DYNAMIC_CODE = 4,          // Chạy code động
  CRM_WORKSPACE = 5,         // Workspace CRM chuyên biệt
}

/**
 * Get menu form type label for display
 */
export function getMenuFormTypeLabel(typeForm: number | string | undefined): string {
  const type = Number(typeForm || 1);
  const labels: Record<number, string> = {
    [MenuFormType.TABLE]: "Dạng bảng",
    [MenuFormType.MASTER_DETAIL]: "Master-Detail",
    [MenuFormType.DYNAMIC_LINK]: "Liên kết động",
    [MenuFormType.DYNAMIC_CODE]: "Code động",
    [MenuFormType.CRM_WORKSPACE]: "CRM Workspace",
  };
  return labels[type] || labels[MenuFormType.TABLE];
}

/**
 * Resolve menu routing based on type_form
 */
export function resolveMenuRoute(
  menu: MenuItemType,
  baseRoutes: { gridPath: string; adminPath: string }
): { type: MenuFormType; route: string; target?: string } | null {
  const typeForm = Number(menu.type_form || MenuFormType.TABLE);

  switch (typeForm) {
    case MenuFormType.TABLE:
    case MenuFormType.MASTER_DETAIL:
      // Route to dynamic grid page
      return {
        type: typeForm,
        route: `${baseRoutes.gridPath}/${menu.id}`,
      };

    case MenuFormType.DYNAMIC_LINK:
      // Return dynamic link URL (will be handled by navigation logic)
      return {
        type: MenuFormType.DYNAMIC_LINK,
        route: menu.dynamic_link_url || menu.v_link || "",
      };

    case MenuFormType.DYNAMIC_CODE:
      // Return special marker for dynamic code
      return {
        type: MenuFormType.DYNAMIC_CODE,
        route: `/system/dynamic-code/${menu.id}`,
      };

    case MenuFormType.CRM_WORKSPACE:
      return {
        type: MenuFormType.CRM_WORKSPACE,
        route: `${baseRoutes.gridPath}/${menu.id}`,
      };

    default:
      return null;
  }
}

/**
 * Check if menu should be handled as Dynamic Link
 */
export function isDynamicLinkMenu(menu: MenuItemType): boolean {
  return Number(menu.type_form || 1) === MenuFormType.DYNAMIC_LINK;
}

/**
 * Check if menu should be handled as Dynamic Code
 */
export function isDynamicCodeMenu(menu: MenuItemType): boolean {
  return Number(menu.type_form || 1) === MenuFormType.DYNAMIC_CODE;
}

/**
 * Check if menu should be handled as Grid (Table or Master-Detail)
 */
export function isGridMenu(menu: MenuItemType): boolean {
  const typeForm = Number(menu.type_form || MenuFormType.TABLE);
  return typeForm === MenuFormType.TABLE || typeForm === MenuFormType.MASTER_DETAIL || typeForm === MenuFormType.CRM_WORKSPACE;
}

/**
 * Get the navigation target for a menu item
 */
export function getMenuNavigationTarget(
  menu: MenuItemType,
  options: {
    gridPath?: string;
    adminPath?: string;
    baseUrl?: string;
  } = {}
): string | null {
  const typeForm = Number(menu.type_form || MenuFormType.TABLE);

  switch (typeForm) {
    case MenuFormType.TABLE:
    case MenuFormType.MASTER_DETAIL:
      return `${options.gridPath || "/system/grid"}/${menu.id}`;

    case MenuFormType.DYNAMIC_LINK: {
      const linkUrl = menu.dynamic_link_url || menu.v_link || "";
      
      // Check if it's an external URL
      if (/^https?:/.test(linkUrl)) {
        return linkUrl; // Open in new window
      }
      
      // Check if it's an absolute path
      if (linkUrl.startsWith("/")) {
        return linkUrl;
      }
      
      // Treat as relative URL with base
      return linkUrl;
    }

    case MenuFormType.DYNAMIC_CODE:
      return `/system/dynamic-code/${menu.id}`;

    case MenuFormType.CRM_WORKSPACE:
      return `${options.gridPath || "/system/grid"}/${menu.id}`;

    default:
      return null;
  }
}

/**
 * Check if navigation target should open in new window
 */
export function shouldOpenInNewWindow(
  menu: MenuItemType,
  navigationTarget: string | null
): boolean {
  const typeForm = Number(menu.type_form || MenuFormType.TABLE);

  if (typeForm === MenuFormType.DYNAMIC_LINK) {
    const linkUrl = menu.dynamic_link_url || menu.v_link || "";
    return /^https?:/.test(linkUrl);
  }

  return false;
}

/**
 * Build menu navigation config including special handling for dynamic types
 */
export function buildMenuNavConfig(
  menu: MenuItemType,
  options: {
    gridPath?: string;
    adminPath?: string;
  } = {}
) {
  const typeForm = Number(menu.type_form || MenuFormType.TABLE);
  const target = getMenuNavigationTarget(menu, options);
  const shouldNewWindow = shouldOpenInNewWindow(menu, target);

  return {
    typeForm,
    typeLabel: getMenuFormTypeLabel(typeForm),
    target,
    isGrid: isGridMenu(menu),
    isDynamicLink: isDynamicLinkMenu(menu),
    isDynamicCode: isDynamicCodeMenu(menu),
    isCrmWorkspace: Number(menu.type_form || MenuFormType.TABLE) === MenuFormType.CRM_WORKSPACE,
    shouldOpenNewWindow: shouldNewWindow,
  };
}
