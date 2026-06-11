// Config-driven editor (recommended — works across all projects)
export { default as CsmLineItemsEditor } from "./CsmLineItemsEditor";
export { default as CsmLineItemsPage } from "./CsmLineItemsPage";
export type {
  LiColumnDef, LiGroupConfig, LiTotalConfig, LiPrintConfig,
  LineItemsEditorConfig, LineItemsListColumn,
  LineItem, ProductGroup, OrderHeader, GroupCalcResult, EditorCalcResult,
} from "./types";
export {
  evalFormula, evalCondition, computeRowValues,
  calcGroupResult, calcEditorTotals, evalPrintTemplate,
  soThanhChu, fmtVND, fmtNum, groupLabel, printUtils,
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
export { PHUSON_PANEL_CONFIG } from "./defaultConfig";

// Legacy hardcoded version (kept for reference)
export { default as ProductionOrderForm } from "./ProductionOrderForm";
export { buildBaoGiaHtml, buildLenhSXHtml, buildPXKHtml } from "./printTemplates";
