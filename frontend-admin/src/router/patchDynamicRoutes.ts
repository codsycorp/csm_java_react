import React, { lazy } from "react";

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
    // Patch props cho các component động, kiểm tra kỹ các trường động
    const appId = route.appId || route.app_id || '';
    const menuId = route.menuId || route.id || route.key || '';
    const menuData = route.menuData || route.m_configs || route || {};
    // Kanban config: đảm bảo là object
    let kanbanConfig = route.kanban_config;
    if (typeof kanbanConfig === 'string') {
      try { kanbanConfig = JSON.parse(kanbanConfig); } catch { kanbanConfig = {}; }
    }
    if (!kanbanConfig || typeof kanbanConfig !== 'object') kanbanConfig = {};
    // Report config: đảm bảo m_configs là object
    let reportConfigs = route.m_configs || route.menuData || route || {};
    // Dynamic code
    let autoCodeName = route.auto_code_name || route.autoCodeName || '';
    let autoCode = route.auto_code || route.autoCode || '';


    if (route.type_form === 1 || route.type_form === 2) {
      Component = (props: any) => React.createElement(CsmDynamicGrid, {
        ...props,
        appId,
        menuId,
        menuData,
        m_configs: menuData,
        decrypt: props.decrypt,
      });
    }
    if (route.type_form === 3) {
      Component = (props: any) => React.createElement(CsmMasterDetail, {
        ...props,
        appId,
        menuId,
        menuData,
        m_configs: menuData,
        decrypt: props.decrypt,
      });
    }
    if (route.report_name) {
      Component = (props: any) => React.createElement(CsmReport, {
        ...props,
        appId,
        menuId,
        menuData,
        m_configs: reportConfigs,
        decrypt: props.decrypt,
      });
    }
    // Ưu tiên Kanban nếu type_form === 6 hoặc có kanban_config
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
      // Chỉ render DynamicCodeMenu nếu KHÔNG phải Kanban
      Component = (props: any) => React.createElement(DynamicCodeMenu, {
        ...props,
        appId,
        menuId,
        menuData,
        m_configs: menuData,
        autoCodeName,
        auto_code: autoCode,
        decrypt: props.decrypt,
      });
    }
    // Đệ quy cho children
    const children = route.children ? patchDynamicRoutesWithComponent(route.children) : undefined;
    return { ...route, Component, children };
  });
}
