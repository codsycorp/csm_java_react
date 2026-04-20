import React, { lazy } from "react";

// Import dynamic components
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

// Map path + menu attributes to Component
export function patchDynamicRoutesWithComponent(routes: any[]): any[] {
  if (!Array.isArray(routes)) return routes;
  // Static system paths to always keep static
  const staticSystemPaths = [
    "/system/user", "/system/menu", "/system/developer", "/system/broadcast",
    "/system/dept", "/system/role", "/system/roles", "/system/departments", "/system/branches", "/system/grid/:menuId",
    "/system/routers", "/system/apps", "/system/react-native"
  ];

  // Filter out any dynamic route that has the same path as a static system path
  // (only keep the first occurrence, which should be the static one if merged correctly)
  const seenStatic = new Set();
  const filteredRoutes = routes.filter(route => {
    if (staticSystemPaths.includes(route.path)) {
      if (seenStatic.has(route.path)) return false;
      seenStatic.add(route.path);
      return true;
    }
    return true;
  });

  return filteredRoutes.map(route => {
    // Debug: Log route info to diagnose mapping issues
    // eslint-disable-next-line no-console
    console.log('[patchDynamicRoutesWithComponent]', {
      path: route.path,
      type_form: route.type_form,
      report_name: route.report_name,
      kanban_config: route.kanban_config,
      auto_code: route.auto_code,
      menuId: route.menuId || route.id || route.key,
      label: route.label || route.name,
    });
    let Component = route.Component;
    // Static system paths: always use static component, do NOT wrap in prop-injection
    if (staticSystemPaths.includes(route.path)) {
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
        case "/system/routers":
        case "/system/apps":
        case "/system/react-native":
          Component = AdminPage; break;
      }
    } else {
      // Only apply dynamic mapping for non-system paths:
      const appId = route.appId || route.app_id || '';
      const menuId = route.menuId || route.id || route.key || '';
      const menuData = route.menuData || route.m_configs || route || {};
      // Kanban config: ensure object
      let kanbanConfig = route.kanban_config;
      if (typeof kanbanConfig === 'string') {
        try { kanbanConfig = JSON.parse(kanbanConfig); } catch { kanbanConfig = {}; }
      }
      if (!kanbanConfig || typeof kanbanConfig !== 'object') kanbanConfig = {};
      // Report config: ensure object
      let reportConfigs = route.m_configs || route.menuData || route || {};
      // Dynamic code
      let autoCodeName = route.auto_code_name || route.autoCodeName || '';
      let autoCode = route.auto_code || route.autoCode || '';

      if (route.type_form === 1) {
        Component = (props: any) => React.createElement(CsmDynamicGrid, {
          ...props,
          appId,
          menuId,
          menuData,
          m_configs: menuData,
          decrypt: props.decrypt,
        });
      }
      if (route.type_form === 2) {
        Component = (props: any) => React.createElement(CsmMasterDetail, {
          ...props,
          appId,
          menuId,
          menuData,
          m_configs: menuData,
          decrypt: props.decrypt,
        });
      }
      // Only render CsmReport if type_form === 5 (or your business logic for report menu)
      if (route.type_form === 5 && route.report_name) {
        Component = (props: any) => React.createElement(CsmReport, {
          ...props,
          appId,
          menuId,
          menuData,
          m_configs: reportConfigs,
          decrypt: props.decrypt,
        });
      }
      // Kanban: type_form === 6 OR has kanban_config
      if (route.type_form === 6 || (kanbanConfig && Object.keys(kanbanConfig).length > 0)) {
        Component = (props: any) => React.createElement(CsmKanbanBoard, {
          ...props,
          appId,
          menuId,
          menuData,
          m_configs: menuData,
          config: kanbanConfig,
          decrypt: props.decrypt,
        });
      } else if (autoCodeName || autoCode) {
        // Only render DynamicCodeMenu if NOT Kanban
        // autoCode = decrypted JS from menu.auto_code → pass as inlineCode (skip API lookup)
        // autoCodeName = lookup name → pass as autoCodeName
        Component = (props: any) => React.createElement(DynamicCodeMenu, {
          ...props,
          appId,
          menuId,
          menuData,
          m_configs: menuData,
          ...(autoCodeName ? { autoCodeName } : {}),
          ...(autoCode && !autoCodeName ? { inlineCode: autoCode } : {}),
          decrypt: props.decrypt,
        });
      }
    }
    // Recursively patch children
    const children = route.children ? patchDynamicRoutesWithComponent(route.children) : undefined;
    return { ...route, Component, children };
  });
}
