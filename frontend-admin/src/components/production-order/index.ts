// Config-driven editor (recommended — works across all projects)
export { default as CsmLineItemsEditor } from "./CsmLineItemsEditor";
export { default as CsmLineItemsPage } from "./CsmLineItemsPage";
export {
  applyWorkflowPromotion,
  resolveWorkflowPromoteLabel,
  resolveWorkflowStageField,
  resolveWorkflowStep,
  resolveNextWorkflowStep,
  validateWorkflowPromotion,
} from "./line-items-workflow";
export type {
  LiColumnDef, LiGroupConfig, LiTotalConfig, LiPrintConfig,
  LineItemsEditorConfig, LineItemsListColumn,
  LineItem, ProductGroup, OrderHeader, GroupCalcResult, EditorCalcResult,
  LiPrintTableOpts, LineItemsWorkflowConfig, LineItemsWorkflowStep,
} from "./types";
export {
  evalFormula, evalCondition, computeRowValues,
  calcGroupResult, calcEditorTotals, evalPrintTemplate,
  soThanhChu, fmtVND, fmtNum, groupLabel, printUtils,
  buildItemsTableHtml, buildPrintUtils,
  newItem, newGroup,
} from "./utils";
export {
  DEFAULT_LINE_ITEMS_DATA_FIELD,
  DEFAULT_LINE_ITEMS_GROUPS_KEY,
  buildLineItemsSavePayload,
  parseLineItemsRecord,
  resolveLineItemsDataField,
  resolveLineItemsGroupsKey,
  resolveLineItemsListColumns,
} from "./line-items-storage";

// Example config (Phú Sơn panel — copy and adapt per project)
export {
  fetchSysAppRow,
  loadPrintCompanySettings,
  mergePrintCompanySettings,
  resolveTenantAppIdForPrint,
} from "./line-items-company";
export { PHUSON_PANEL_CONFIG, PHUSON_WORKFLOW } from "./defaultConfig";
export {
  PHUSON_MENU_PRESETS,
  PHUSON_PRESET_OPTIONS,
  buildPhusonMenuConfig,
  resolvePhusonPresetTriggers,
  type PhusonMenuPresetId,
} from "./line-items-menu-presets";

// Legacy hardcoded version (kept for reference)
export { default as ProductionOrderForm } from "./ProductionOrderForm";
export { buildBaoGiaHtml, buildLenhSXHtml, buildPXKHtml } from "./printTemplates";
