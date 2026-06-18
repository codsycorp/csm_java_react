/**
 * Import PDF/ảnh mẫu → sinh trigger in (HTML) qua AI, theo chuẩn printTemplates / defaultConfig.
 */
import { AI_TIMEOUT_MS } from "#src/api/ai";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
import { request } from "#src/utils";
import type { LiColumnDef } from "./types";
import { PHUSON_PANEL_CONFIG } from "./defaultConfig";

export type PrintDocKind = "bao_gia" | "lenh_sx" | "pxk" | "custom";

const REFERENCE_TRIGGER_SNIPPET = `
// Mẫu tham chiếu (rút gọn) — trigger phải return HTML đầy đủ:
const cfg = utils.settings || {};
const companyHdr = utils.buildCompanyHdr(cfg);
const items = utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || { showPrice: true, showGroupSubtotal: true });
const totals = utils.buildTotalsHtml(calc, utils);
return \`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>/* CSS khớp PDF mẫu */</style></head>
<body><div class="page">\${companyHdr}
<div class="doc-title">TIÊU ĐỀ</div>
\${items}\${totals}
</div></body></html>\`;
`.trim();

export function buildPrintImportPrompt(opts: {
  docKind: PrintDocKind;
  triggerKey: string;
  tableFields: string[];
  lineColumns: LiColumnDef[];
  sampleNote?: string;
  pdfText?: string;
  hasSeedTemplate?: boolean;
}): string {
  const kindHints: Record<PrintDocKind, string> = {
    bao_gia: "Báo giá — có bảng giá, tổng A/B/C/D, ghi chú, thanh toán, chữ ký 2 bên.",
    lenh_sx: "Lệnh SX nội bộ — có bảng giá, tổng, block điều kiện giao hàng 1-10, chữ ký GD + NV.",
    pxk: "LSX kiêm PXK — KHÔNG hiện đơn giá/thành tiền; dùng printTableOpts showPrice:false; 5 chữ ký.",
    custom: "Chứng từ tuỳ chỉnh — bám layout PDF mẫu.",
  };

  const fieldList = opts.tableFields.filter(Boolean).join(", ") || "ngay, khach_hang, so_bao_gia, nvkd…";
  const colList = (opts.lineColumns ?? []).map(c => c.name).filter(Boolean).join(", ");
  const pdfTextBlock = opts.pdfText?.trim()
    ? ["## Text trích từ PDF mẫu (layout / nhãn trường)", opts.pdfText.trim().slice(0, 6000), ""]
    : [];

  const taskLines = opts.hasSeedTemplate
    ? [
      "## Nhiệm vụ",
      `Chỉnh sửa mẫu Phú Sơn trong [ACTIVE_EDITOR] cho trigger_key "${opts.triggerKey}".`,
      "Giữ utils.buildCompanyHdr / buildItemsTableHtml / buildTotalsHtml; chỉ đổi tiêu đề, bố cục, ghi chú theo PDF/ghi chú.",
      "Return TOÀN BỘ function body sau khi sửa — bắt buộc có return `<!DOCTYPE html>...` kết thúc `</html>`.",
      `Loại chứng từ: ${kindHints[opts.docKind]}`,
      opts.sampleNote ? `Ghi chú người dùng: ${opts.sampleNote}` : "",
    ]
    : [
      "## Nhiệm vụ",
      `Sinh function body JavaScript cho trigger_key "${opts.triggerKey}" khớp layout file PDF/ảnh mẫu.`,
      `Loại chứng từ: ${kindHints[opts.docKind]}`,
      opts.sampleNote ? `Ghi chú người dùng: ${opts.sampleNote}` : "",
    ];

  return [
    "Bạn là chuyên gia sinh trigger in PDF cho hệ thống CSM Line Items (type_form=7).",
    "",
    ...taskLines,
    "",
    "## Chữ ký bắt buộc",
    "(order, groups, calc, utils) => string — CHỈ trả về body function (không bọc function(...){}), không markdown.",
    "",
    "## Quy tắc kỹ thuật",
    "1. return chuỗi HTML đầy đủ: <!DOCTYPE html>...<div class=\"page\">...</div>",
    "2. CSS inline trong <style> trong <head> (Times New Roman, bảng border, .page width ~780px).",
    "3. Header công ty: utils.buildCompanyHdr(cfg) — KHÔNG hardcode tên công ty.",
    "4. Bảng sản phẩm: utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || {...}).",
    "5. Tổng tiền (nếu PDF có): utils.buildTotalsHtml(calc, utils).",
    "6. Ô dữ liệu động: order.{field} ?? '' — field header có sẵn: " + fieldList,
    "7. Cột dòng hàng: " + (colList || "ten_sp, don_vi, chieu_rong, chieu_dai, so_tam, khoi_luong, don_gia, thanh_tien"),
    "8. Ghi chú cố định: utils.parseNoteLines(cfg.ghi_chu_*, defaultArray) hoặc cfg từ pm_cai_dat.",
    "9. PXK: utils.printTableOpts showPrice:false, hideColumns nếu cần.",
    "10. Code NGẮN GỌN: dùng utils.buildCompanyHdr / buildItemsTableHtml / buildTotalsHtml — KHÔNG nhét CSS dài; return phải có <!DOCTYPE html> hoặc template literal kết thúc </html>.",
    "",
    ...pdfTextBlock,
    "## Tham chiếu code",
    REFERENCE_TRIGGER_SNIPPET,
    "",
    "Chỉ trả về code JavaScript của function body, không giải thích.",
  ].filter(Boolean).join("\n");
}

export function extractCodeFromAiResponse(raw: string): string {
  let text = String(raw ?? "").trim();
  const fenced = text.match(/```(?:javascript|js)?\n([\s\S]+?)\n```/i);
  if (fenced?.[1]) text = fenced[1].trim();
  if (text.startsWith("function") || text.includes("function(")) {
    const bodyMatch = text.match(/function\s*\([^)]*\)\s*\{([\s\S]*)\}\s*;?\s*$/);
    if (bodyMatch?.[1]) text = bodyMatch[1].trim();
  }
  return text;
}

/** Kiểm tra body trigger in có vẻ hoàn chỉnh (tránh false negative khi model viết HTML hoa/thường khác). */
export function isValidPrintTriggerCode(code: string): boolean {
  const c = String(code ?? "").trim();
  if (!/\breturn\b/i.test(c)) return false;
  return /html|<!doctype|buildItemsTableHtml|buildCompanyHdr|<\/html>/i.test(c);
}

export async function fileToPreviewDataUrls(file: File, maxPages = 2): Promise<string[]> {
  const sample = await readPrintSampleFile(file, maxPages);
  return sample.previewUrls;
}

export type PrintSampleRead = {
  previewUrls: string[];
  pdfText: string;
};

/** Đọc PDF/ảnh mẫu: preview + text layer (PDF digital) cho AI local. */
export async function readPrintSampleFile(file: File, maxPages = 2): Promise<PrintSampleRead> {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    return { previewUrls: [await readFileAsDataUrl(file)], pdfText: "" };
  }
  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return pdfToSampleRead(file, maxPages);
  }
  throw new Error("Chỉ hỗ trợ file PDF hoặc ảnh (PNG/JPG/WebP).");
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Không đọc được file"));
    reader.readAsDataURL(file);
  });
}

async function pdfToSampleRead(file: File, maxPages: number): Promise<PrintSampleRead> {
  const pdfjs = await import("pdfjs-dist");
  const version = (pdfjs as any).version || "4.10.38";
  (pdfjs as any).GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const urls: string[] = [];
  const textParts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas không khả dụng");
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL("image/png"));

    try {
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: { str?: string }) => String(item?.str ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (pageText) {
        textParts.push(`--- Trang ${i} ---\n${pageText}`);
      }
    } catch {
      // PDF scan — không có text layer
    }
  }
  return { previewUrls: urls, pdfText: textParts.join("\n\n").trim() };
}

export function suggestPrintConfig(docKind: PrintDocKind, triggerKey: string) {
  const base = {
    trigger_key: triggerKey,
    filename_expr: "`document.pdf`",
  };
  switch (docKind) {
    case "bao_gia":
      return {
        ...base,
        label: "Xuất Báo giá",
        filename_expr: "`BaoGia_${order.so_bao_gia || 'draft'}.pdf`",
        print_table: { showPrice: true, showGroupSubtotal: true },
      };
    case "lenh_sx":
      return {
        ...base,
        label: "Xuất Lệnh SX nội bộ",
        filename_expr: "`LenhSX_${order.so_lenh || 'draft'}.pdf`",
        print_table: { showPrice: true, showGroupSubtotal: true },
      };
    case "pxk":
      return {
        ...base,
        label: "Xuất Lệnh SX + PXK",
        filename_expr: "`LenhSX_PXK_${order.so_lenh || 'draft'}.pdf`",
        print_table: {
          showPrice: false,
          showGroupSubtotal: false,
          hideColumns: ["chieu_rong", "don_gia", "thanh_tien"],
        },
      };
    default:
      return { ...base, label: "Xuất PDF", print_table: { showPrice: true, showGroupSubtotal: true } };
  }
}

/** Trigger mẫu Phú Sơn có sẵn — dùng khi không gọi AI. */
export function getBuiltinPrintTriggerBody(docKind: PrintDocKind): string | undefined {
  const t = PHUSON_PANEL_CONFIG.trigger;
  if (docKind === "bao_gia") return t?.print_bao_gia;
  if (docKind === "lenh_sx") return t?.print_lenh_sx;
  if (docKind === "pxk") return t?.print_pxk;
  return undefined;
}

export async function generatePrintTriggerFromSample(opts: {
  appId?: string;
  docKind: PrintDocKind;
  triggerKey: string;
  tableFields: string[];
  lineColumns: LiColumnDef[];
  sampleImages: string[];
  sampleNote?: string;
  pdfText?: string;
  editorMetadata?: Record<string, unknown>;
}): Promise<string> {
  if (!opts.sampleImages.length) {
    throw new Error("Chưa có ảnh mẫu từ PDF.");
  }

  const seedBody = getBuiltinPrintTriggerBody(opts.docKind);
  const prompt = buildPrintImportPrompt({
    ...opts,
    hasSeedTemplate: Boolean(seedBody),
  });

  const pdfHint = opts.pdfText?.trim()
    ? `Đã trích text từ PDF (${opts.pdfText.length} ký tự) — dùng làm layout reference.`
    : "PDF không có text layer (scan) — dựa vào mẫu Phú Sơn + ghi chú người dùng.";

  const response = await request.post("ai-code-stream", {
    json: {
      appId: String(opts.appId || "line_items_print").trim() || "line_items_print",
      message: `${prompt}\n\n(${pdfHint} Ảnh preview ${opts.sampleImages.length} trang — model text không nhìn ảnh.)`,
      currentCode: seedBody ?? "",
      flowType: "code_editor",
      taskType: "code_assistant",
      language: "javascript",
      contextType: "code",
      responseMode: "edit",
      editorMetadata: {
        ...(opts.editorMetadata || {}),
        source: "LineItemsPdfImport",
        docKind: opts.docKind,
        triggerKey: opts.triggerKey,
        samplePages: opts.sampleImages.length,
      },
    },
    timeout: AI_TIMEOUT_MS,
    throwHttpErrors: false,
  });

  if (!response.ok || !response.body) {
    throw new Error("Không gọi được AI (ai-code-stream). Kiểm tra cấu hình AI server.");
  }

  let fullResponse = "";
  let completed = false;

  await consumeSseStream(response, {
    onEvent: async (evt) => {
      let payload: Record<string, unknown> | null = null;
      try {
        payload = typeof evt.payload === "object" && evt.payload
          ? evt.payload as Record<string, unknown>
          : JSON.parse(evt.data);
      } catch {
        return;
      }
      if (!payload) return;
      const result = dispatchAiCodeStreamEvent(payload, fullResponse, {
        onChunk: (_c, acc) => { fullResponse = acc; },
        onComplete: (p) => {
          if (typeof p.fullResponse === "string") fullResponse = p.fullResponse;
          completed = true;
        },
        onError: (msg) => { throw new Error(msg || "AI lỗi"); },
      });
      fullResponse = result.accumulated;
      if (result.completed) completed = true;
    },
  });

  if (!completed && !fullResponse.trim()) {
    throw new Error("AI không trả về trigger. Thử lại hoặc dùng mẫu Phú Sơn có sẵn.");
  }

  const code = extractCodeFromAiResponse(fullResponse);
  if (!isValidPrintTriggerCode(code)) {
    throw new Error(
      "AI trả về code không hợp lệ (thiếu return HTML — thường do server 8GB cắt output). "
      + "Dùng「Áp mẫu Phú Sơn」hoặc sửa tay.",
    );
  }
  return code;
}
