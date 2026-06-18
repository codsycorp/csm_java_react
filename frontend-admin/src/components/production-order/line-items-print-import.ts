/**
 * Import PDF/ảnh mẫu → sinh trigger in (HTML) qua AI, theo chuẩn printTemplates / defaultConfig.
 */
import { AI_TIMEOUT_MS } from "#src/api/ai";
import { consumeSseStream, dispatchAiCodeStreamEvent } from "#src/api/ai/sse-stream";
import { request } from "#src/utils";
import type { LiColumnDef, ProductGroup } from "./types";
import { PHUSON_PANEL_CONFIG } from "./defaultConfig";
import { evalPrintTemplate, buildPrintUtils } from "./utils";
import { validatePrintHtml } from "./line-items-print";

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

type StructuredTextEdit = {
  startLine: number;
  endLine: number;
  replacement: string;
};

function normalizeTextEdits(raw: unknown): StructuredTextEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: StructuredTextEdit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const startLine = Number((item as any).startLine ?? (item as any).start_line ?? 0);
    const endLine = Number((item as any).endLine ?? (item as any).end_line ?? startLine);
    const replacement = String((item as any).replacement ?? "");
    if (startLine > 0) out.push({ startLine, endLine: endLine || startLine, replacement });
  }
  return out;
}

function applyTextEditsToDraft(baseText: string, textEdits: StructuredTextEdit[]): string {
  if (!textEdits.length) return baseText;
  const lines = baseText.split("\n");
  const sorted = [...textEdits].sort((a, b) => b.startLine - a.startLine);
  for (const edit of sorted) {
    const startIdx = Math.max(0, edit.startLine - 1);
    const endIdx = Math.max(startIdx, edit.endLine);
    const replLines = edit.replacement ? edit.replacement.split("\n") : [];
    lines.splice(startIdx, endIdx - startIdx, ...replLines);
  }
  return lines.join("\n");
}

function looksLikeCompletePrintTrigger(code: string): boolean {
  const c = String(code ?? "").trim().toLowerCase();
  if (!/\breturn\b/.test(c)) return false;
  if (c.includes("</html>")) return true;
  return c.includes("builditemstablehtml") && (c.includes("buildcompanyhdr") || c.includes("<!doctype"));
}

/** Ghép AI output + mẫu Phú Sơn seed — tránh patch cắt cụt từ server/local. */
export function resolvePrintTriggerFromAiResponse(opts: {
  seedBody?: string;
  fullResponse: string;
  completePayload?: Record<string, unknown> | null;
}): string {
  const seed = String(opts.seedBody ?? "").trim();
  let text = extractCodeFromAiResponse(opts.fullResponse);

  const payload = opts.completePayload;
  const payloadCode = typeof payload?.code === "string" ? String(payload.code).trim() : "";
  if (payloadCode && looksLikeCompletePrintTrigger(payloadCode)) {
    text = extractCodeFromAiResponse(payloadCode);
  }

  const edits = normalizeTextEdits(payload?.textEdits ?? payload?.text_edits);
  if (edits.length > 0 && seed) {
    const merged = applyTextEditsToDraft(seed, edits);
    if (looksLikeCompletePrintTrigger(merged)) return extractCodeFromAiResponse(merged);
  }

  if (looksLikeCompletePrintTrigger(text)) return text;
  if (seed && looksLikeCompletePrintTrigger(seed)) return seed;
  return text || seed;
}

const DRY_RUN_ORDER = {
  khach_hang: "Khách hàng mẫu",
  so_bao_gia: "010126.01",
  ngay: "01/01/2026",
  nvkd: "NV mẫu",
  dia_chi_kh: "Hà Nội",
};

const DRY_RUN_GROUPS: ProductGroup[] = [{
  id: "g1",
  spec: "",
  vat_rate: 10,
  items: [{
    key: "i1",
    ten_sp: "Sản phẩm mẫu",
    don_vi: "cái",
    so_luong: 1,
    don_gia: 1000,
    thanh_tien: 1000,
  }],
}];

const DRY_RUN_CALC = {
  totals: { A: 1000, B: 100, C: 1100, D: 1100 },
  groups: { g1: { sum: 1000 } },
};

/** Chạy thử trigger trước khi áp — bắt lỗi runtime (local hay server). */
export function dryRunPrintTriggerBody(
  fnBody: string,
  lineColumns: LiColumnDef[] = [],
): { ok: boolean; message?: string } {
  if (!looksLikeCompletePrintTrigger(fnBody)) {
    return { ok: false, message: "Trigger thiếu return HTML đầy đủ." };
  }
  try {
    const html = evalPrintTemplate(
      fnBody,
      DRY_RUN_ORDER,
      DRY_RUN_GROUPS,
      DRY_RUN_CALC as any,
      buildPrintUtils({}, {
        lineItemsColumns: lineColumns,
        printTableOpts: { showPrice: true, showGroupSubtotal: true },
      }),
    );
    return validatePrintHtml(html);
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) };
  }
}

/** Kiểm tra body trigger in có vẻ hoàn chỉnh (tránh false negative khi model viết HTML hoa/thường khác). */
export function isValidPrintTriggerCode(code: string, lineColumns: LiColumnDef[] = []): boolean {
  return dryRunPrintTriggerBody(code, lineColumns).ok;
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
}): Promise<{ code: string; usedSeedFallback?: boolean }> {
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
  let completePayload: Record<string, unknown> | null = null;

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
          completePayload = p;
          if (typeof p.fullResponse === "string" && p.fullResponse.trim()) {
            fullResponse = p.fullResponse;
          }
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

  const code = resolvePrintTriggerFromAiResponse({
    seedBody,
    fullResponse,
    completePayload,
  });

  const dryRun = dryRunPrintTriggerBody(code, opts.lineColumns);
  if (dryRun.ok) return { code };

  if (seedBody) {
    const seedDry = dryRunPrintTriggerBody(seedBody, opts.lineColumns);
    if (seedDry.ok) {
      return { code: seedBody, usedSeedFallback: true };
    }
  }

  throw new Error(
    dryRun.message
      ? `Trigger in không chạy được: ${dryRun.message}. Dùng「Áp mẫu Phú Sơn」hoặc sửa tay.`
      : "AI trả về code không hợp lệ (thiếu return HTML — thường do server 8GB cắt output). "
        + "Dùng「Áp mẫu Phú Sơn」hoặc sửa tay.",
  );
}
