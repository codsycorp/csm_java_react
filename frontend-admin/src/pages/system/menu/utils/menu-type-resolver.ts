/**
 * Menu Type Resolver Utility
 * Handles resolution and rendering of different menu types:
 * - type_form = 0: Group Menu (container only)
 * - type_form = 1: Data Table Grid
 * - type_form = 2: Master-Detail Form
 * - type_form = 3: Dynamic Link (external/internal redirect)
 * - type_form = 4: Dynamic Code (resolved inside AdminPage runtime)
 * - type_form = 6: Kanban Board (resolved inside AdminPage runtime)
 * - type_form = 7: Line Items form + PDF export (CsmLineItemsPage)
 */

import type { MenuItemType } from "#src/api/system/menu";

/**
 * Menu type enumeration
 */
export enum MenuFormType {
  GROUP = 0,                 // Nhom menu
  TABLE = 1,                  // Dạng bảng
  MASTER_DETAIL = 2,         // Dạng Form Master-Detail
  DYNAMIC_LINK = 3,          // Liên kết động
  DYNAMIC_CODE = 4,          // Chạy code động
  KANBAN_BOARD = 6,          // Bang Kanban doc lap
  LINE_ITEMS_PDF = 7,        // Form dong hang + in PDF
}

const SUPPORTED_TYPE_FORMS = new Set<number>([
  MenuFormType.GROUP,
  MenuFormType.TABLE,
  MenuFormType.MASTER_DETAIL,
  MenuFormType.DYNAMIC_LINK,
  MenuFormType.DYNAMIC_CODE,
  MenuFormType.KANBAN_BOARD,
  MenuFormType.LINE_ITEMS_PDF,
]);

function toFiniteMenuNumber(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * Resolve type_form for menu edit form — explicit field, legacy `type`, or payload inference.
 */
export function resolveMenuTypeForm(menu: Partial<MenuItemType> | Record<string, any> | null | undefined): number {
  if (!menu) return MenuFormType.TABLE;

  const explicit = toFiniteMenuNumber(menu.type_form);
  if (explicit !== undefined && SUPPORTED_TYPE_FORMS.has(explicit)) {
    return explicit;
  }

  const fromLegacyType = toFiniteMenuNumber((menu as any).type);
  if (fromLegacyType !== undefined && SUPPORTED_TYPE_FORMS.has(fromLegacyType)) {
    return fromLegacyType;
  }

  if ((menu as any).kanban_config != null) return MenuFormType.KANBAN_BOARD;
  if (String((menu as any).auto_code_name || "").trim()) return MenuFormType.DYNAMIC_CODE;
  if (String(menu.dynamic_link_url || (menu as any).v_link || (menu as any).externalLink || "").trim()) {
    return MenuFormType.DYNAMIC_LINK;
  }
  if (Array.isArray((menu as any).line_items_columns) && (menu as any).line_items_columns.length > 0) {
    return MenuFormType.LINE_ITEMS_PDF;
  }

  const children = Array.isArray(menu.children)
    ? menu.children
    : Array.isArray((menu as any).nodes)
      ? (menu as any).nodes
      : [];
  const tableName = String(menu.table_name || "").trim();
  const tableFields = Array.isArray(menu.table) ? menu.table : [];
  const hasChildren = children.length > 0;

  if (hasChildren && !tableName && tableFields.length === 0) return MenuFormType.GROUP;
  if (hasChildren && tableName) return MenuFormType.MASTER_DETAIL;
  if (tableName || tableFields.length > 0) return MenuFormType.TABLE;

  return MenuFormType.TABLE;
}

/**
 * Get menu form type label for display
 */
export function getMenuFormTypeLabel(typeForm: number | string | undefined): string {
  const type = Number(typeForm || 1);
  const labels: Record<number, string> = {
    [MenuFormType.GROUP]: "Nhóm menu",
    [MenuFormType.TABLE]: "Dạng bảng",
    [MenuFormType.MASTER_DETAIL]: "Master-Detail",
    [MenuFormType.DYNAMIC_LINK]: "Liên kết động",
    [MenuFormType.DYNAMIC_CODE]: "Code động",
    [MenuFormType.KANBAN_BOARD]: "Kanban Board",
    [MenuFormType.LINE_ITEMS_PDF]: "Form dòng hàng + PDF",
  };
  return labels[type] || labels[MenuFormType.GROUP];
}

/**
 * Resolve menu routing based on type_form
 */
export function resolveMenuRoute(
  menu: MenuItemType,
  baseRoutes: { gridPath: string; adminPath: string }
): { type: MenuFormType; route: string; target?: string } | null {
  const typeForm = Number(menu.type_form ?? MenuFormType.GROUP);

  switch (typeForm) {
    case MenuFormType.GROUP:
      return null;

    case MenuFormType.TABLE:
    case MenuFormType.MASTER_DETAIL:
    case MenuFormType.DYNAMIC_CODE:
    case MenuFormType.KANBAN_BOARD:
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
  const typeForm = Number(menu.type_form ?? MenuFormType.GROUP);
  return [
    MenuFormType.TABLE,
    MenuFormType.MASTER_DETAIL,
    MenuFormType.DYNAMIC_CODE,
    MenuFormType.KANBAN_BOARD,
  ].includes(typeForm);
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
  const typeForm = Number(menu.type_form ?? MenuFormType.GROUP);

  switch (typeForm) {
    case MenuFormType.GROUP:
      return null;

    case MenuFormType.TABLE:
    case MenuFormType.MASTER_DETAIL:
    case MenuFormType.DYNAMIC_CODE:
    case MenuFormType.KANBAN_BOARD:
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
  const typeForm = Number(menu.type_form ?? MenuFormType.GROUP);

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
    isKanbanBoard: Number(menu.type_form ?? MenuFormType.GROUP) === MenuFormType.KANBAN_BOARD,
    shouldOpenNewWindow: shouldNewWindow,
  };
}
