import { HomeOutlined, MailOutlined, UserOutlined, CalendarOutlined } from "@ant-design/icons";
import { createElement, lazy } from "react";
import type { AppRouteRecordRaw } from "#src/router/types";

const WuHome = lazy(() => import("#src/pages/website/wu_home"));
const WuServiceDetail = lazy(() => import("#src/pages/website/wu_service_detail"));
const WuContact = lazy(() => import("#src/pages/website/wu_contact"));
const WuAbout = lazy(() => import("#src/pages/website/wu_about"));
const XemNgay = lazy(() => import("#src/pages/website/wu_xem_ngay"));
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
    path: "/en",
    Component: WuHome,
    handle: {
      order: 0,
      title: "Trang Chủ (EN)",
      icon: createElement(HomeOutlined),
      hideInMenu: true,
    },
  },
  {
    path: "/zh",
    Component: WuHome,
    handle: {
      order: 0,
      title: "Trang Chủ (ZH)",
      icon: createElement(HomeOutlined),
      hideInMenu: true,
    },
  },
  // Tools pages (must be before dynamic category routes)
  {
    path: "/xem-ngay",
    Component: XemNgay,
    handle: {
      order: 5,
      title: "Xem Ngày",
      icon: createElement(CalendarOutlined),
      hideInMenu: false,
    },
  },
  {
    path: "/en/xem-ngay",
    Component: XemNgay,
    handle: {
      order: 5,
      title: "Xem Ngày (EN)",
      icon: createElement(CalendarOutlined),
      hideInMenu: false,
    },
  },
  {
    path: "/zh/xem-ngay",
    Component: XemNgay,
    handle: {
      order: 5,
      title: "Xem Ngày (ZH)",
      icon: createElement(CalendarOutlined),
      hideInMenu: false,
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
    path: "/en/lien-he",
    Component: WuContact,
    handle: {
      order: 6,
      title: "Liên Hệ (EN)",
      icon: createElement(MailOutlined),
      hideInMenu: true,
    },
  },
  {
    path: "/zh/lien-he",
    Component: WuContact,
    handle: {
      order: 6,
      title: "Liên Hệ (ZH)",
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
  {
    path: "/en/ve-chung-toi",
    Component: WuAbout,
    handle: {
      order: 7,
      title: "Về Chúng Tôi (EN)",
      icon: createElement(UserOutlined),
      hideInMenu: true,
    },
  },
  {
    path: "/zh/ve-chung-toi",
    Component: WuAbout,
    handle: {
      order: 7,
      title: "Về Chúng Tôi (ZH)",
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
    path: "/en/:slug",
    Component: WuCategoryPage,
    handle: {
      order: 9,
      title: "Dịch Vụ - Category (EN)",
      hideInMenu: true,
    },
  },
  {
    path: "/zh/:slug",
    Component: WuCategoryPage,
    handle: {
      order: 9,
      title: "Dịch Vụ - Category (ZH)",
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
  },
  {
    path: "/en/:category/:slug",
    Component: WuServiceDetail,
    handle: {
      order: 10,
      title: "Chi Tiết Dịch Vụ (EN)",
      hideInMenu: true,
    },
  },
  {
    path: "/zh/:category/:slug",
    Component: WuServiceDetail,
    handle: {
      order: 10,
      title: "Chi Tiết Dịch Vụ (ZH)",
      hideInMenu: true,
    },
  }
];

export default routes;