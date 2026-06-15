package services

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

const greenfieldScaffoldMinNodes = 12

// PlannedModuleRow is one row in BusinessSpec.planned_structure.
type PlannedModuleRow struct {
	Module        string
	LegoPiece     string
	TypeForm      int
	TableNameHint string
	Notes         string
}

// IsComprehensiveGreenfieldMenuRequest detects full ERP-style menu requests (Java parity).
func IsComprehensiveGreenfieldMenuRequest(message string) bool {
	msg := strings.ToLower(strings.TrimSpace(message))
	if msg == "" {
		return false
	}
	return strings.Contains(msg, "đầy đủ") || strings.Contains(msg, "day du") ||
		strings.Contains(msg, "toàn bộ") || strings.Contains(msg, "toan bo") ||
		strings.Contains(msg, "full menu") || strings.Contains(msg, "complete menu") ||
		(strings.Contains(msg, "báo cáo") && (strings.Contains(msg, "bán hàng") || strings.Contains(msg, "xuất nhập") || strings.Contains(msg, "công nợ"))) ||
		(strings.Contains(msg, "xuất nhập") && strings.Contains(msg, "công nợ"))
}

// ShouldRunGreenfieldScaffoldFirst decides scaffold-first path (Java AD.3.2 subset).
func ShouldRunGreenfieldScaffoldFirst(req *CodeStreamRequest, spec BusinessSpec, responseMode string) bool {
	if req == nil || responseMode != "edit" || req.ContextType != "menu_json" {
		return false
	}
	if !IsEffectivelyEmptyMenuEditor(req.CurrentCode) || !spec.Greenfield {
		return false
	}
	if IsComprehensiveGreenfieldMenuRequest(req.Message) {
		return true
	}
	enriched := EnrichBusinessSpecForMenuGreenfield(spec, req.Message)
	return len(enriched.PlannedStructure) >= 3
}

// EnrichBusinessSpecForMenuGreenfield expands modules and planned_structure (Pass 2).
func EnrichBusinessSpecForMenuGreenfield(spec BusinessSpec, userMessage string) BusinessSpec {
	modules := append([]string{}, spec.Modules...)
	if len(modules) == 0 {
		modules = extractModulesFromMessage(strings.ToLower(userMessage))
	}
	modules = uniqueStrings(modules, 12)

	var planned []PlannedModuleRow
	if len(modules) > 0 {
		for _, m := range modules {
			planned = append(planned, buildPlannedStructureRow(m, userMessage))
		}
	}
	expandPlannedStructureFromUserWording(&planned, userMessage)
	normalizePlannedStructure(&planned)

	if spec.UserDelta == "" {
		spec.UserDelta = truncateStr(userMessage, 500)
	}
	spec.Modules = modules
	spec.PlannedStructure = planned
	return spec
}

func buildPlannedStructureRow(module, userMessage string) PlannedModuleRow {
	label := strings.TrimSpace(module)
	lower := strings.ToLower(label)
	row := PlannedModuleRow{Module: label, Notes: "From USER_REQUEST / comprehend"}
	switch {
	case strings.Contains(lower, "công nợ") && strings.Contains(lower, "khách"):
		row.LegoPiece, row.TypeForm, row.TableNameHint = "grid_crud", 1, "m_customer_debt"
	case strings.Contains(lower, "công nợ") && (strings.Contains(lower, "cung") || strings.Contains(lower, "ncc") || strings.Contains(lower, "nhà cung")):
		row.LegoPiece, row.TypeForm, row.TableNameHint = "grid_crud", 1, "m_supplier_debt"
	case strings.Contains(lower, "báo cáo") || strings.Contains(lower, "bao cao") || strings.Contains(lower, "report"):
		if isNoiseReportModuleLabel(label) {
			row.LegoPiece, row.TypeForm, row.TableNameHint = "grid_crud", 1, slugTableName(label)
		} else {
			row.LegoPiece, row.TypeForm, row.TableNameHint = "report", 5, strings.Replace(slugTableName(label), "m_", "rpt_", 1)
		}
	case isMasterDetailModuleLabel(label):
		row.LegoPiece, row.TypeForm, row.TableNameHint = "master_detail", 2, slugTableName(label)
	default:
		row.LegoPiece, row.TypeForm, row.TableNameHint = "grid_crud", 1, slugTableName(label)
	}
	_ = userMessage
	return row
}

func expandPlannedStructureFromUserWording(planned *[]PlannedModuleRow, userMessage string) {
	msg := strings.ToLower(userMessage)
	existing := map[string]struct{}{}
	for _, row := range *planned {
		existing[strings.ToLower(row.Module)] = struct{}{}
	}
	add := func(module, lego string, typeForm int, tableHint string) {
		key := strings.ToLower(module)
		if _, ok := existing[key]; ok {
			return
		}
		existing[key] = struct{}{}
		*planned = append(*planned, PlannedModuleRow{
			Module: module, LegoPiece: lego, TypeForm: typeForm, TableNameHint: tableHint,
			Notes: "Expanded from USER_REQUEST wording",
		})
	}
	if strings.Contains(msg, "xuất nhập") || strings.Contains(msg, "xuat nhap") || strings.Contains(msg, "tồn") {
		add("Danh mục sản phẩm", "grid_crud", 1, "m_products")
		add("Khách hàng", "grid_crud", 1, "m_customers")
		add("Nhà cung cấp", "grid_crud", 1, "m_suppliers")
		add("Phiếu bán / Xuất kho", "master_detail", 2, "m_sales_orders")
		add("Phiếu mua / Nhập kho", "master_detail", 2, "m_purchase_orders")
		add("Tồn kho", "grid_crud", 1, "m_inventory")
	}
	if strings.Contains(msg, "bán hàng") || strings.Contains(msg, "ban hang") {
		add("Phiếu bán hàng", "master_detail", 2, "m_sales_orders")
	}
	if strings.Contains(msg, "công nợ") && strings.Contains(msg, "khách") {
		add("Công nợ khách hàng", "grid_crud", 1, "m_customer_debt")
	}
	if strings.Contains(msg, "công nợ") && (strings.Contains(msg, "cung cấp") || strings.Contains(msg, "nhà cung")) {
		add("Công nợ nhà cung cấp", "grid_crud", 1, "m_supplier_debt")
	}
	if strings.Contains(msg, "báo cáo") || strings.Contains(msg, "bao cao") {
		add("Báo cáo doanh thu", "report", 5, "rpt_revenue")
		add("Báo cáo tồn kho", "report", 5, "rpt_inventory")
		add("Báo cáo công nợ", "report", 5, "rpt_debt")
	}
}

func normalizePlannedStructure(planned *[]PlannedModuleRow) {
	if len(*planned) == 0 {
		return
	}
	seen := map[string]struct{}{}
	var out []PlannedModuleRow
	for _, row := range *planned {
		key := strings.ToLower(strings.TrimSpace(row.TableNameHint))
		if key == "" {
			key = strings.ToLower(row.Module)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, row)
		if len(out) >= 20 {
			break
		}
	}
	*planned = out
}

// BuildGreenfieldMenuScaffoldJson assembles deterministic menu skeleton (Pass 3b).
func BuildGreenfieldMenuScaffoldJson(spec BusinessSpec, userMessage string) string {
	enriched := EnrichBusinessSpecForMenuGreenfield(spec, userMessage)
	if len(enriched.PlannedStructure) == 0 {
		return ""
	}
	rootLabel := extractGreenfieldRootTitle(userMessage)
	if rootLabel == "" {
		rootLabel = truncateStr(enriched.DomainSummary, 60)
	}
	if rootLabel == "" {
		rootLabel = truncateStr(userMessage, 60)
	}
	if rootLabel == "" {
		rootLabel = "Hệ thống quản lý"
	}

	root := scaffoldGroupNode("biz_root", "", rootLabel, "folder")
	var crudChildren []map[string]any
	var reportChildren []map[string]any
	reportGroupID := "reports_group"

	for _, row := range enriched.PlannedStructure {
		module := strings.TrimSpace(row.Module)
		if module == "" {
			continue
		}
		tableHint := row.TableNameHint
		if tableHint == "" {
			tableHint = slugTableName(module)
		}
		nodeID := slugNodeID(module)
		switch row.TypeForm {
		case 5:
			reportChildren = append(reportChildren, scaffoldReportNode(nodeID, reportGroupID, module, tableHint))
		case 2:
			crudChildren = append(crudChildren, scaffoldMasterDetailNode(nodeID, "biz_root", module, tableHint))
		default:
			if isMasterDetailModuleLabel(module) {
				crudChildren = append(crudChildren, scaffoldMasterDetailNode(nodeID, "biz_root", module, tableHint))
			} else {
				crudChildren = append(crudChildren, scaffoldCrudNode(nodeID, "biz_root", module, tableHint))
			}
		}
	}

	children := append([]map[string]any{}, crudChildren...)
	if len(reportChildren) > 0 {
		reportGroup := scaffoldGroupNode(reportGroupID, "biz_root", "Báo cáo", "chart")
		reportGroup["children"] = reportChildren
		children = append(children, reportGroup)
	}
	root["children"] = children

	menu := []any{root}
	RepairMenuTreeInPlace(menu)
	applyGreenfieldCSMRulesToTree(menu)
	return wrapMenuPayload(menu)
}

func extractGreenfieldRootTitle(userMessage string) string {
	msg := strings.TrimSpace(userMessage)
	if msg == "" {
		return ""
	}
	for _, prefix := range []string{"tạo menu", "tao menu", "thiết kế menu", "thiet ke menu", "build menu", "design menu"} {
		if idx := strings.Index(strings.ToLower(msg), prefix); idx >= 0 {
			rest := strings.TrimSpace(msg[idx+len(prefix):])
			if rest != "" {
				return truncateStr(rest, 60)
			}
		}
	}
	return ""
}

func scaffoldGroupNode(id, parentID, label, icon string) map[string]any {
	return map[string]any{
		"id": id, "parentId": parentID, "label": label,
		"label_en": label, "label_zh": label,
		"icon": icon, "type_form": 0,
	}
}

func scaffoldCrudNode(id, parentID, label, tableName string) map[string]any {
	node := scaffoldGroupNode(id, parentID, label, "MenuOutlined")
	node["type_form"] = 1
	node["table_name"] = tableName
	node["row_type_edit"] = 0
	node["table"] = defaultTableFieldsForModule(label, tableName)
	node["trigger"] = buildGridCrudTriggers()
	applyGreenfieldCSMRules(node)
	return node
}

func scaffoldMasterDetailNode(id, parentID, label, tableName string) map[string]any {
	node := scaffoldGroupNode(id, parentID, label, "FileTextOutlined")
	node["type_form"] = 2
	node["table_name"] = tableName
	node["row_type_edit"] = 0
	masterFields := []map[string]any{
		pkField("id"), field("order_no", "Số phiếu", "ed"), dateField("order_date", "Ngày"),
	}
	if isSalesModuleLabel(label) {
		masterFields = append(masterFields, comboField("customer_id", "Khách hàng", "m_customers", "id", "customer_name"))
	} else if isPurchaseModuleLabel(label) {
		masterFields = append(masterFields, comboField("supplier_id", "Nhà cung cấp", "m_suppliers", "id", "supplier_name"))
	}
	masterFields = append(masterFields,
		numberField("total_amount", "Tổng tiền", 2),
		statusField("status", "Trạng thái", []map[string]string{
			{"value": "draft", "label": "Nháp"}, {"value": "posted", "label": "Đã ghi sổ"},
		}),
		field("note", "Ghi chú", "ed"),
	)
	node["table"] = masterFields
	node["trigger"] = buildMasterDetailTriggers()
	detailTab := scaffoldGroupNode(id+"_chi_tiet", id, "Chi tiết", "TableOutlined")
	detailTab["type_form"] = 1
	detailTab["table_name"] = "chi_tiet"
	detailTab["m_show"] = false
	detailTab["field_root"] = "order_id"
	detailTab["table"] = buildOrderDetailLineFields()
	detailTab["trigger"] = map[string]any{"update": triggerMDLineUpdate}
	applyGreenfieldCSMRules(detailTab)
	node["children"] = []any{detailTab}
	applyGreenfieldCSMRules(node)
	return node
}

func scaffoldReportNode(id, parentID, label, reportName string) map[string]any {
	node := scaffoldGroupNode(id, parentID, label, "BarChartOutlined")
	node["type_form"] = 5
	node["report_name"] = reportName
	node["table"] = []map[string]any{dateField("from_date", "Từ ngày"), dateField("to_date", "Đến ngày")}
	node["trigger"] = buildReportTriggers()
	applyGreenfieldCSMRules(node)
	return node
}

func defaultTableFieldsForModule(label, tableName string) []map[string]any {
	lower := strings.ToLower(label)
	tn := strings.ToLower(tableName)
	fields := []map[string]any{pkField("id")}
	switch {
	case strings.Contains(lower, "sản phẩm") || strings.Contains(tn, "product"):
		fields = append(fields, field("product_code", "Mã SP", "ed"), field("product_name", "Tên sản phẩm", "ed"),
			field("unit", "ĐVT", "ed"), field("price", "Giá bán", "ed"))
	case strings.Contains(lower, "khách") && !strings.Contains(lower, "công nợ"):
		fields = append(fields, field("customer_code", "Mã KH", "ed"), field("customer_name", "Tên khách hàng", "ed"),
			field("phone", "Điện thoại", "ed"), field("address", "Địa chỉ", "ed"))
	case strings.Contains(lower, "nhà cung") || strings.Contains(lower, "cung cấp"):
		fields = append(fields, field("supplier_code", "Mã NCC", "ed"), field("supplier_name", "Tên NCC", "ed"),
			field("phone", "Điện thoại", "ed"))
	case strings.Contains(lower, "bán") || strings.Contains(lower, "xuất"):
		fields = append(fields, field("order_no", "Số phiếu", "ed"), dateField("order_date", "Ngày"),
			comboField("customer_id", "Khách hàng", "m_customers", "id", "customer_name"),
			numberField("total_amount", "Tổng tiền", 2))
	case strings.Contains(lower, "mua") || strings.Contains(lower, "nhập"):
		fields = append(fields, field("order_no", "Số phiếu", "ed"), dateField("order_date", "Ngày"),
			comboField("supplier_id", "NCC", "m_suppliers", "id", "supplier_name"),
			numberField("total_amount", "Tổng tiền", 2))
	case strings.Contains(lower, "tồn") || strings.Contains(lower, "kho"):
		fields = append(fields, comboField("product_id", "Mã SP", "m_products", "id", "product_code"),
			field("product_name", "Tên SP", "ed"), numberField("qty_on_hand", "Tồn", 0),
			comboField("warehouse_id", "Kho", "m_warehouses", "id", "warehouse_name"))
	case strings.Contains(lower, "công nợ"):
		fields = append(fields, field("partner_name", "Đối tượng", "ed"), numberField("amount", "Số tiền", 2),
			dateField("due_date", "Hạn thanh toán"),
			statusField("status", "Trạng thái", []map[string]string{
				{"value": "open", "label": "Còn nợ"}, {"value": "paid", "label": "Đã thanh toán"},
			}))
	default:
		fields = append(fields, field("code", "Mã", "ed"), field("name", "Tên", "ed"), field("note", "Ghi chú", "ed"))
	}
	return fields
}

func buildOrderDetailLineFields() []map[string]any {
	return []map[string]any{
		pkField("id"),
		comboField("product_id", "Mã SP", "m_products", "id", "product_code"),
		field("product_name", "Tên SP", "ed"),
		numberField("so_luong", "Số lượng", 0),
		numberField("don_gia", "Đơn giá", 2),
		numberField("thanh_tien", "Thành tiền", 2),
	}
}

func pkField(name string) map[string]any {
	f := field(name, "ID", "ed")
	f["f_pkid"] = 1
	return f
}

func field(name, header, types string) map[string]any {
	return map[string]any{
		"f_name": name, "f_header": header, "f_types": types,
		"f_header_en": header, "f_header_zh": header,
	}
}

func dateField(name, header string) map[string]any {
	f := field(name, header, "dt")
	return f
}

func numberField(name, header string, _ int) map[string]any {
	return field(name, header, "ed")
}

func comboField(name, header, table, keyField, displayField string) map[string]any {
	f := field(name, header, "cbo")
	f["f_cbo_query"] = "SELECT " + keyField + " AS value, " + displayField + " AS label FROM " + table
	return f
}

func statusField(name, header string, options []map[string]string) map[string]any {
	f := field(name, header, "cbo")
	var opts []map[string]string
	for _, o := range options {
		opts = append(opts, map[string]string{"value": o["value"], "label": o["label"]})
	}
	f["f_options"] = opts
	return f
}

const (
	triggerLoadDB         = "(seft, db) => { return null; }"
	triggerGridBeforeSave = "(seft, data, bang) => { if (!data) return false; return data; }"
	triggerGridUpdate     = "(seft, data, bang) => { if (!data) return data; return data; }"
	triggerMDBeforeSave   = "(seft, data, bang) => { if (!data) return false; const lines = Array.isArray(data.chi_tiet) ? data.chi_tiet : []; let total = 0; for (const row of lines) { const qty = Number(row.so_luong) || 0; const price = Number(row.don_gia) || 0; row.thanh_tien = qty * price; total += row.thanh_tien; } data.tong_tien = total; data.total_amount = total; return data; }"
	triggerMDLineUpdate   = "(seft, data, bang) => { if (!data) return data; const qty = Number(data.so_luong) || 0; const price = Number(data.don_gia) || 0; data.thanh_tien = qty * price; return data; }"
	triggerReportDB       = "(seft, db) => { return []; }"
	triggerReportFilter   = "(seft, db) => { return null; }"
)

func buildGridCrudTriggers() map[string]any {
	return map[string]any{
		"load_db": triggerLoadDB, "beforeSave": triggerGridBeforeSave, "update": triggerGridUpdate,
	}
}

func buildMasterDetailTriggers() map[string]any {
	return map[string]any{"beforeSave": triggerMDBeforeSave, "update": triggerGridUpdate}
}

func buildReportTriggers() map[string]any {
	return map[string]any{"report_db": triggerReportDB, "filter": triggerReportFilter}
}

func applyGreenfieldCSMRulesToTree(menu []any) {
	for _, item := range menu {
		if m, ok := item.(map[string]any); ok {
			applyGreenfieldCSMRules(m)
		}
	}
}

func applyGreenfieldCSMRules(node map[string]any) {
	if node == nil {
		return
	}
	typeForm := intFromAny(node["type_form"])
	if typeForm != 1 && typeForm != 2 && typeForm != 5 {
		if children, ok := node["children"].([]any); ok {
			for _, c := range children {
				if m, ok := c.(map[string]any); ok {
					applyGreenfieldCSMRules(m)
				}
			}
		}
		return
	}
	if label, _ := node["label"].(string); label != "" {
		if _, ok := node["label_en"]; !ok {
			node["label_en"] = label
		}
		if _, ok := node["label_zh"]; !ok {
			node["label_zh"] = label
		}
	}
	upgradeMinimalTriggers(node, typeForm)
	if children, ok := node["children"].([]any); ok {
		for _, c := range children {
			if m, ok := c.(map[string]any); ok {
				applyGreenfieldCSMRules(m)
			}
		}
	}
}

func upgradeMinimalTriggers(node map[string]any, typeForm int) {
	tr, ok := node["trigger"].(map[string]any)
	if !ok || tr == nil {
		tr = map[string]any{}
	}
	switch typeForm {
	case 1:
		if tr["load_db"] == nil {
			tr["load_db"] = triggerLoadDB
		}
		if tr["beforeSave"] == nil {
			tr["beforeSave"] = triggerGridBeforeSave
		}
		if tr["update"] == nil {
			tr["update"] = triggerGridUpdate
		}
	case 2:
		if tr["beforeSave"] == nil {
			tr["beforeSave"] = triggerMDBeforeSave
		}
		if tr["update"] == nil {
			tr["update"] = triggerGridUpdate
		}
	case 5:
		if tr["report_db"] == nil {
			tr["report_db"] = triggerReportDB
		}
		if tr["filter"] == nil {
			tr["filter"] = triggerReportFilter
		}
	}
	node["trigger"] = tr
}

func isMasterDetailModuleLabel(label string) bool {
	lower := strings.ToLower(label)
	return strings.Contains(lower, "phiếu") || strings.Contains(lower, "phieu") ||
		strings.Contains(lower, "đơn hàng") || strings.Contains(lower, "don hang") ||
		strings.Contains(lower, "hóa đơn") || strings.Contains(lower, "hoa don")
}

func isSalesModuleLabel(label string) bool {
	lower := strings.ToLower(label)
	return strings.Contains(lower, "bán") || strings.Contains(lower, "ban") || strings.Contains(lower, "xuất")
}

func isPurchaseModuleLabel(label string) bool {
	lower := strings.ToLower(label)
	return strings.Contains(lower, "mua") || strings.Contains(lower, "nhập") || strings.Contains(lower, "nhap")
}

func isNoiseReportModuleLabel(label string) bool {
	lower := strings.ToLower(label)
	return len(lower) < 4 || strings.Contains(lower, "node") || strings.Contains(lower, "module")
}

func slugNodeID(label string) string {
	s := slugTableName(label)
	if strings.HasPrefix(s, "m_") {
		return s[2:]
	}
	return s
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9\s]+`)

func slugTableName(label string) string {
	raw := strings.ToLower(strings.TrimSpace(label))
	raw = strings.ReplaceAll(raw, "đ", "d")
	t := transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)
	raw, _, _ = transform.String(t, raw)
	raw = slugNonAlnum.ReplaceAllString(raw, " ")
	raw = strings.Join(strings.Fields(raw), "_")
	if raw == "" {
		raw = "module"
	}
	if !strings.HasPrefix(raw, "m_") && !strings.HasPrefix(raw, "rpt_") {
		raw = "m_" + raw
	}
	return raw
}

func parseMenuRoots(menuJSON string) []any {
	normalized := NormalizeMenuDraftJson(menuJSON)
	if normalized == "" {
		return nil
	}
	var parsed map[string]any
	if json.Unmarshal([]byte(normalized), &parsed) != nil {
		return nil
	}
	menu, _ := parsed["menu"].([]any)
	return menu
}

func collectEnrichableMenuLeaves(roots []any) []map[string]any {
	var leaves []map[string]any
	var walk func(map[string]any)
	walk = func(node map[string]any) {
		children, _ := node["children"].([]any)
		typeForm := intFromAny(node["type_form"])
		if len(children) == 0 && (typeForm == 1 || typeForm == 2 || typeForm == 5) {
			leaves = append(leaves, node)
			return
		}
		for _, c := range children {
			if m, ok := c.(map[string]any); ok {
				walk(m)
			}
		}
	}
	for _, r := range roots {
		if m, ok := r.(map[string]any); ok {
			walk(m)
		}
	}
	return leaves
}

func applyDeterministicModuleI18n(node map[string]any) {
	label := stringFromAny(node["label"])
	if label == "" {
		return
	}
	if stringFromAny(node["label_en"]) == "" {
		node["label_en"] = label
	}
	if stringFromAny(node["label_zh"]) == "" {
		node["label_zh"] = label
	}
	if table, ok := node["table"].([]any); ok {
		for _, item := range table {
			if f, ok := item.(map[string]any); ok {
				hdr := stringFromAny(f["f_header"])
				if hdr != "" {
					if stringFromAny(f["f_header_en"]) == "" {
						f["f_header_en"] = hdr
					}
					if stringFromAny(f["f_header_zh"]) == "" {
						f["f_header_zh"] = hdr
					}
				}
			}
		}
	}
}
