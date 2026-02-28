import { DatabaseOutlined, HomeOutlined, MailOutlined, UserOutlined } from "@ant-design/icons";
import { createElement, lazy } from "react";
import type { AppRouteRecordRaw } from "#src/router/types";

const WuHome = lazy(() => import("#src/pages/website/wu_home"));
const WuServices = lazy(() => import("#src/pages/website/wu_services"));
const WuServiceDetail = lazy(() => import("#src/pages/website/wu_service_detail"));
const WuContact = lazy(() => import("#src/pages/website/wu_contact"));
const WuAbout = lazy(() => import("#src/pages/website/wu_about"));
const XemNgay = lazy(() => import("#src/pages/website/tools/XemNgay"));
const KQXS = lazy(() => import("#src/pages/website/tools/kqxs_main"));
const PrivacyPolicy = lazy(() => import("#src/pages/website/privacy_policy"));
const TermsOfService = lazy(() => import("#src/pages/website/terms_of_service"));

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
  // Tools pages (must be before dynamic category routes)
  {
    path: "/xem-ngay",
    Component: XemNgay,
    handle: {
      order: 5,
      title: "Xem Ngày",
      hideInMenu: true,
    },
  },
  {
    path: "/kqxs",
    Component: KQXS,
    handle: {
      order: 5,
      title: "Kết Quả Xổ Số",
      hideInMenu: true,
    },
  },
  {
      path: "/cong-cu",
      Component: XemNgay,
      handle: {
        order: 6,
        title: "Công Cụ",
        icon: createElement(DatabaseOutlined),
        hideInMenu: false,
      }
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