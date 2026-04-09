import { lazy } from "react";

// Import các component động
const User = lazy(() => import("#src/pages/system/user"));
const Menu = lazy(() => import("#src/pages/system/menu"));
const AdminPage = lazy(() => import("#src/pages/system/admin"));
const Developer = lazy(() => import("#src/pages/system/developer"));
const Broadcast = lazy(() => import("#src/pages/system/broadcast"));
const CsmDynamicGrid = lazy(() => import("#src/components/csm-grid/CsmDynamicGrid"));
const CsmMasterDetail = lazy(() => import("#src/components/csm-grid/CsmMasterDetail"));
const CsmReport = lazy(() => import("#src/components/csm-report/CsmReport"));
const CsmKanbanBoard = lazy(() => import("#src/components/csm-kanban/CsmKanbanBoard"));
const DynamicCodeMenu = lazy(() => import("#src/pages/system/dynamic-code"));

// Hàm mapping path + thuộc tính menu sang Component
export function patchDynamicRoutesWithComponent(routes: any[]): any[] {
  if (!Array.isArray(routes)) return routes;
  return routes.map(route => {
    let Component = route.Component;
    // Mapping theo path tĩnh
    switch (route.path) {
      case "/system/user": Component = User; break;
      case "/system/menu": Component = Menu; break;
      case "/system/developer": Component = Developer; break;
      case "/system/broadcast": Component = Broadcast; break;
      case "/system/dept":
      case "/system/role":
      case "/system/roles":
      case "/system/departments":
      case "/system/branches":
      case "/system/grid/:menuId":
        Component = AdminPage; break;
    }
    // Mapping động theo thuộc tính menu
    if (route.type_form === 1 || route.type_form === 2) Component = CsmDynamicGrid;
    if (route.type_form === 3) Component = CsmMasterDetail;
    if (route.report_name) Component = CsmReport;
    if (route.type_form === 4) Component = CsmKanbanBoard;
    if (route.type_form === 6) Component = DynamicCodeMenu;
    // Đệ quy cho children
    const children = route.children ? patchDynamicRoutesWithComponent(route.children) : undefined;
    return { ...route, Component, children };
  });
}
