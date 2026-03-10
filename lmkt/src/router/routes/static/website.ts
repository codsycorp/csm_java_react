import { HomeOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { createElement, lazy } from "react";
import type { AppRouteRecordRaw } from "#src/router/types";

const WuHome = lazy(() => import("#src/pages/website/wu_home"));
const WuServices = lazy(() => import("#src/pages/website/wu_services"));
const WuServiceDetail = lazy(() => import("#src/pages/website/wu_service_detail"));
const WuContact = lazy(() => import("#src/pages/website/wu_contact"));
const WuAbout = lazy(() => import("#src/pages/website/wu_about"));
const PrivacyPolicy = lazy(() => import("#src/pages/website/privacy_policy"));
const TermsOfService = lazy(() => import("#src/pages/website/terms_of_service"));
const WuDynamicMenuPage = lazy(() => import("#src/pages/website/wu_dynamic_menu_page"));
const WuNoContentPage = lazy(() => import("#src/pages/website/wu_no_content_page"));

const routes: AppRouteRecordRaw[] = [
	{
    path: "/",
    Component: WuHome,
    handle: {
      order: 0,
      title: "Trang Chủ",
      icon: createElement(HomeOutlined),
      hideInMenu: true,
    },
  },
  {
    path: "/lien-he",
    Component: WuContact,
    handle: {
      order: 6,
      title: "Liên Hệ",
      icon: createElement(MailOutlined),
      hideInMenu: true,
    },
  },
  {
    path: "/ve-chung-toi",
    Component: WuAbout,
    handle: {
      order: 7,
      title: "Về Chúng Tôi",
      icon: createElement(UserOutlined),
      hideInMenu: true,
    },
  },
  // Dynamic menu page (non-service items with dynamic code)
  // Must be before dynamic category routes to take precedence
  {
    path: "/dynamic-code/:slug",
    Component: WuDynamicMenuPage,
    handle: {
      order: 8,
      title: "Dynamic Menu",
      hideInMenu: true,
    },
  },
  // No content page (non-service items without dynamic code)
  // Must be before dynamic category routes to take precedence
  {
    path: "/no-content/:slug",
    Component: WuNoContentPage,
    handle: {
      order: 8,
      title: "No Content",
      hideInMenu: true,
    },
  }
  ,
  // Dynamic category pages and service details (placed after specific static routes)
  {
    path: "/:category",
    Component: WuServices,
    handle: {
      order: 9,
      title: "Dịch Vụ - Category",
      hideInMenu: true,
    },
  },
  {
    path: "/:category/:slug",
    Component: WuServiceDetail,
    handle: {
      order: 10,
      title: "Chi Tiết Dịch Vụ",
      hideInMenu: true,
    },
  }
];

export default routes;