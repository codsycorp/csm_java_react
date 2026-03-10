import { HomeOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { createElement, lazy } from "react";
import type { AppRouteRecordRaw } from "#src/router/types";

const WuHome = lazy(() => import("#src/pages/website/wu_home"));
const WuServiceDetail = lazy(() => import("#src/pages/website/wu_service_detail"));
const WuContact = lazy(() => import("#src/pages/website/wu_contact"));
const WuAbout = lazy(() => import("#src/pages/website/wu_about"));
const PrivacyPolicy = lazy(() => import("#src/pages/website/privacy_policy"));
const TermsOfService = lazy(() => import("#src/pages/website/terms_of_service"));
const WuCategoryPage = lazy(() => import("#src/pages/website/wu_category_page"));

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
  // Single dispatcher: reads SSR data at render time and shows the right component
  // (WuServices, WuDynamicMenuPage, or WuNoContentPage) — no redirect, clean /:slug URL.
  {
    path: "/:slug",
    Component: WuCategoryPage,
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