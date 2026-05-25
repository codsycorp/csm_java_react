package net.phanmemmottrieu.service;

import org.springframework.stereotype.Service;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Local Translation Service - Xử lý dịch cục bộ không cần gọi API
 * Giảm chi phí Gemini 2.5 Pro từ 1 triệu VND xuống <20% bằng cách:
 * 1. Áp dụng templates/mẫu dịch phổ biến
 * 2. Cache translations đã xử lý
 * 3. Quy tắc heuristic cho dịch đơn giản
 */
@Service
public class LocalTranslationService {

    // Translation templates: Vietnamese patterns → English/Chinese templates
    private static final Map<String, TranslationTemplate> VI_TEMPLATES = new HashMap<>();
    static {
        // Danh mục patterns
        add("Danh mục", "Categories", "类别");
        add("Quản lý", "Management", "管理");
        add("Báo cáo", "Report", "报表");
        add("Xuất", "Export/Issue", "导出/出票");
        add("Nhập", "Import/Input", "导入/输入");
        add("Tồn", "Stock/Inventory", "库存");
        add("Thu chi", "Revenue/Expense", "收支");
        add("Công nợ", "Receivables/Payables", "应收应付");
        add("Hoàn", "Refund/Return", "退货/退票");
        add("Bán", "Sales", "销售");
        add("Mua", "Purchase", "采购");
        add("Nhân viên", "Employees", "员工");
        add("Phòng ban", "Departments", "部门");
        add("Khách hàng", "Customers", "客户");
        add("Nhà cung cấp", "Suppliers", "供应商");
        add("Kho", "Warehouse", "仓库");
        add("Sản phẩm", "Products", "商品");
        add("Hàng hóa", "Goods/Products", "商品");
        add("Vật tư", "Materials", "材料");
        add("Giá", "Price", "价格");
        add("Hóa đơn", "Invoice", "发票");
        add("Chứng từ", "Document/Voucher", "凭证");
        add("Phiếu", "Slip/Ticket", "单");
        add("Lô hàng", "Batch/Shipment", "批次");
        add("Doanh số", "Sales/Revenue", "销售额");
        add("Tỷ lệ", "Ratio/Rate", "比率");
        add("Định mức", "Quota/Standard", "定额");
        add("Nguyên vật liệu", "Raw Materials", "原材料");
        add("Phụ liệu", "Accessories", "辅料");
        add("Thành phẩm", "Finished Products", "成品");
        add("Nháy", "Flash Sale", "闪购");
        add("Khuyến mại", "Promotion", "促销");
        add("Chiết khấu", "Discount", "折扣");
        add("Hạng", "Rank/Level", "等级");
        add("Loại", "Type/Category", "类型");
        add("Nhóm", "Group", "组");
        add("Tour", "Tour", "旅游");
        add("Visa", "Visa", "签证");
        add("Vé máy bay", "Air Tickets", "机票");
        add("Hành khách", "Passengers", "乘客");
        add("Tuyến đường", "Route", "路线");
        add("Hãng hàng không", "Airlines", "航空公司");
        add("Sân bay", "Airport", "机场");
        // NPL / inventory domain
        add("Nguyên liệu", "Materials", "原材料");
        add("NPL", "Materials", "原材料");
        add("Tồn kho", "Inventory", "库存");
        add("Xuất NPL", "Material Issue", "原材料出库");
        add("Nhập NPL", "Material Receipt", "原材料入库");
        add("Thành phẩm", "Finished Products", "成品");
        add("Nguyên phụ liệu", "Raw & Auxiliary Materials", "原辅料");
        add("Báo cáo", "Report", "报表");
        add("Theo", "By", "按");
        add("ĐVT", "UOM", "单位");
        add("Mã", "Code", "编码");
        add("Tên", "Name", "名称");
        add("Số lượng", "Quantity", "数量");
        add("Đơn giá", "Unit Price", "单价");
        add("Thành tiền", "Amount", "金额");
        add("Ngày", "Date", "日期");
        add("Kho", "Warehouse", "仓库");
        add("Pallet", "Pallet", "托盘");
        add("HSD", "Expiry Date", "有效期");
        add("Nhóm", "Group", "组");
        add("Loại", "Type", "类型");
        add("Vị trí", "Location", "位置");
        add("Ghi chú", "Note", "备注");
        add("Từ ngày", "From Date", "起始日期");
        add("Đến ngày", "To Date", "截止日期");
    }

    private static void add(String vi, String en, String zh) {
        VI_TEMPLATES.put(vi.toLowerCase(), new TranslationTemplate(vi, en, zh));
    }

    // Cache translations (key = Vietnamese, value = [English, Chinese])
    private final Map<String, String[]> translationCache = new ConcurrentHashMap<>();

    // Patterns để detect dạng key-value
    private static final Pattern PATTERN_MENU_ITEM = Pattern.compile("^([A-Z0-9]+\\.\\s*)(.+)$");
    private static final Pattern PATTERN_FIELD_HEADER = Pattern.compile("^([A-Za-z_]+)$");

    public String translateVietnameseToEnglish(String vietnamese) {
        if (vietnamese == null || vietnamese.isBlank()) {
            return "";
        }

        String vi = vietnamese.trim();
        String lower = vi.toLowerCase();

        // Check cache
        String[] cached = translationCache.get(lower);
        if (cached != null) {
            return cached[0];
        }

        // Try exact template match
        TranslationTemplate template = VI_TEMPLATES.get(lower);
        if (template != null) {
            translationCache.put(lower, new String[]{template.en, template.zh});
            return template.en;
        }

        // Try partial match (contains key phrases)
        for (Map.Entry<String, TranslationTemplate> entry : VI_TEMPLATES.entrySet()) {
            if (lower.contains(entry.getKey())) {
                String result = applyTemplate(vi, entry.getValue(), true);
                if (!result.equals(vi)) {
                    translationCache.put(lower, new String[]{result, ""});
                    return result;
                }
            }
        }

        // Fallback: return Vietnamese as-is (will be handled by Phase 3 AI)
        return "";
    }

    public String translateVietnameseToChinese(String vietnamese) {
        if (vietnamese == null || vietnamese.isBlank()) {
            return "";
        }

        String vi = vietnamese.trim();
        String lower = vi.toLowerCase();

        // Check cache
        String[] cached = translationCache.get(lower);
        if (cached != null && cached.length > 1) {
            return cached[1];
        }

        // Try exact template match
        TranslationTemplate template = VI_TEMPLATES.get(lower);
        if (template != null) {
            translationCache.put(lower, new String[]{template.en, template.zh});
            return template.zh;
        }

        // Try partial match
        for (Map.Entry<String, TranslationTemplate> entry : VI_TEMPLATES.entrySet()) {
            if (lower.contains(entry.getKey())) {
                String result = applyTemplate(vi, entry.getValue(), false);
                if (!result.equals(vi)) {
                    translationCache.put(lower, new String[]{"", result});
                    return result;
                }
            }
        }

        // Fallback
        return "";
    }

    /**
     * Dùng heuristic rules để dịch items (không cần AI)
     * VD: "A.01.a. Danh mục hàng hóa" → EN: "A.01.a. Product Categories", ZH: "A.01.a. 商品类别"
     */
    @SuppressWarnings("unchecked")
    public void enrichMenuItemWithLocalTranslation(Map<String, Object> item) {
        if (item == null) return;

        String label = String.valueOf(item.getOrDefault("label", "")).trim();
        if (label.isBlank()) return;

        // Extract prefix (VD: "A.01.a. " từ "A.01.a. Danh mục")
        String prefix = extractPrefix(label);
        String labelCore = label.substring(prefix.length()).trim();

        // Try translate core part
        String en = translateVietnameseToEnglish(labelCore);
        String zh = translateVietnameseToChinese(labelCore);

        // Build full translations with prefix
        if (!en.isBlank()) {
            item.put("label_en", prefix + en);
        }
        if (!zh.isBlank()) {
            item.put("label_zh", prefix + zh);
        }

        // Process f_header (table field header)
        String fHeader = String.valueOf(item.getOrDefault("f_header", "")).trim();
        if (!fHeader.isBlank()) {
            String fHeaderEn = translateVietnameseToEnglish(fHeader);
            String fHeaderZh = translateVietnameseToChinese(fHeader);
            if (!fHeaderEn.isBlank()) {
                item.put("f_header_en", fHeaderEn);
            }
            if (!fHeaderZh.isBlank()) {
                item.put("f_header_zh", fHeaderZh);
            }
        }

        // Recursively process children
        Object childrenObj = item.get("children");
        if (childrenObj instanceof List) {
            List<Map<String, Object>> children = (List<Map<String, Object>>) childrenObj;
            for (Map<String, Object> child : children) {
                enrichMenuItemWithLocalTranslation(child);
            }
        }
    }

    /**
     * Áp dụng template dịch vào Vietnamese text
     * VD: "Danh mục sản phẩm" + template("Danh mục" → "Categories")
     *     = "Categories sản phẩm" (sau đó "sản phẩm" → "Products")
     */
    private String applyTemplate(String vietnamese, TranslationTemplate template, boolean isEnglish) {
        String vi = vietnamese.toLowerCase();
        String key = template.vi.toLowerCase();
        String replacement = isEnglish ? template.en : template.zh;

        if (vi.contains(key)) {
            // Simple replacement
            return vietnamese.replaceFirst("(?i)" + Pattern.quote(template.vi), replacement);
        }

        return vietnamese; // No match, return original
    }

    /**
     * Extract prefix from menu label
     * VD: "A.01.a. Danh mục" → "A.01.a. "
     */
    private String extractPrefix(String label) {
        java.util.regex.Matcher m = PATTERN_MENU_ITEM.matcher(label);
        if (m.matches()) {
            return m.group(1);
        }
        return "";
    }

    /**
     * Get translation cache stats (for monitoring)
     */
    public Map<String, Object> getCacheStats() {
        Map<String, Object> stats = new HashMap<>();
        stats.put("cachedCount", translationCache.size());
        stats.put("templateCount", VI_TEMPLATES.size());
        return stats;
    }

    /**
     * Clear cache (for testing/reset)
     */
    public void clearCache() {
        translationCache.clear();
    }

    static class TranslationTemplate {
        String vi;
        String en;
        String zh;

        TranslationTemplate(String vi, String en, String zh) {
            this.vi = vi;
            this.en = en;
            this.zh = zh;
        }
    }
}
