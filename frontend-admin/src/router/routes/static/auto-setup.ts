import type { AppRouteRecordRaw } from "#src/router/types";
import { ContainerLayout } from "#src/layout";
import { createElement, lazy } from "react";
import { SettingOutlined } from "@ant-design/icons";
import { $t } from "#src/locales";

const AutoSetup = lazy(() => import("#src/pages/auto/AutoSetup"));

const routes: AppRouteRecordRaw[] = [
  {
    path: "/auto-setup",
    Component: ContainerLayout,
    handle: {
      title: $t("common.menu.auto_setup"),
      icon: createElement(SettingOutlined),
    },
    children: [
      {
        index: true,
        Component: AutoSetup,
        handle: {
          title: $t("common.menu.auto_setup"),
          icon: createElement(SettingOutlined),
        },
      },
    ],
  },
];

export default routes;
