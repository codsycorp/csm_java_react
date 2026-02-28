/**
 * Admin Menu Loader Module
 * 
 * Provides dynamic menu content rendering for admin interface
 * - MenuContentRenderer: Renders menu content based on type (report/grid)
 * - AdminWorkspace: Full-featured workspace with sidebar menu + tabs
 */

export { MenuContentRenderer } from "./index";
export type { MenuContentRendererProps, MenuConfig } from "./index";
export { getMenuType } from "./index";
export { AdminWorkspace } from "./AdminWorkspace";
export type { AdminWorkspaceProps } from "./AdminWorkspace";
