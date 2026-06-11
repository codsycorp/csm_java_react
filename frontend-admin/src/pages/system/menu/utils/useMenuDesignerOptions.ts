import { useMemo } from "react";
import type { TFunction } from "i18next";

import {
  getDataScopeOptions,
  getI18nSelectOptions,
  getOrientationOptions,
  getRowTypeEditOptions,
  getTypeFormOptions,
  getTypeMenuOptions,
} from "../constants";

/** Select options for menu designer — labels follow the user's UI language. */
export function useMenuDesignerOptions(t: TFunction<"translation", undefined>) {
  return useMemo(() => ({
    typeForm: getTypeFormOptions(t),
    rowTypeEdit: getRowTypeEditOptions(t),
    typeMenu: getTypeMenuOptions(t),
    dataScope: getDataScopeOptions(t),
    yesNoBool: getI18nSelectOptions(t, [
      { value: false, key: "system.menu.no" },
      { value: true, key: "system.menu.yes" },
    ]),
    yesNoNum: getI18nSelectOptions(t, [
      { value: 0, key: "system.menu.no" },
      { value: 1, key: "system.menu.yes" },
    ]),
    orientation: getOrientationOptions(t),
    kanbanProgressTracking: getI18nSelectOptions(t, [
      { value: "single_table", key: "system.menu.kanbanProgressTrackingModeSingle" },
      { value: "separate_table", key: "system.menu.kanbanProgressTrackingModeSeparate" },
    ]),
    kanbanStrictMode: getI18nSelectOptions(t, [
      { value: "inherit", key: "system.menu.kanbanInheritJson" },
      { value: true, key: "system.menu.kanbanStrictModeOn" },
      { value: false, key: "system.menu.kanbanStrictModeOff" },
    ]),
    kanbanAutoProgress: getI18nSelectOptions(t, [
      { value: "inherit", key: "system.menu.kanbanInheritJson" },
      { value: true, key: "system.menu.kanbanAutoProgressOn" },
      { value: false, key: "system.menu.kanbanAutoProgressOff" },
    ]),
    rootMenu: getI18nSelectOptions(t, [
      { value: "", key: "system.menu.root" },
    ]),
  }), [t]);
}
