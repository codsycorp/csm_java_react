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
import {
  applyPdfLayoutToSeedTrigger,
  buildPdfLayoutSpec,
  formatLayoutSpecForPrompt,
  groupPdfTextIntoLineBoxes,
  groupPdfTextIntoLines,
  inferDocKindFromLayout,
  type PdfLayoutExtractConfig,
  type PdfLayoutSpec,
} from "./line-items-pdf-layout";

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
  pdfLayout?: PdfLayoutSpec;
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
  const layoutBlock = opts.pdfLayout
    ? [
      "## PDF_LAYOUT_SPEC (bắt buộc khớp — thứ tự block, tiêu đề, nhãn chữ ký, cột bảng)",
      formatLayoutSpecForPrompt(opts.pdfLayout),
      "",
      "Quy tắc khớp layout:",
      "- doc-title = docTitle trong spec (UPPERCASE như PDF).",
      "- Không dùng PDF làm nền; phải tạo lại template HTML/CSS standalone giống mẫu PDF về bố cục, logo, khung bảng, chữ ký.",
      "- Giữ utils.buildCompanyHdr / buildItemsTableHtml / buildTotalsHtml — KHÔNG viết lại bảng HTML tay.",
      "- tableGridLikely=true => giữ border-collapse và border 1px solid cho toàn bộ bảng dữ liệu; không được bỏ khung bảng.",
      "- showPrice=false nếu spec.showPrice=false (ẩn cột đơn giá/thành tiền).",
      "- signatureLabels → thay nhãn trong sig-box .lbl cho đúng PDF.",
      "- headerLines → map nhãn hdr (Kính gửi, Số, Ngày…) giữ field order.* như seed.",
      "- Logo phải lấy từ utils.buildCompanyHdr(cfg) hoặc cfg.logo_url/f_logo; nếu sample có logo ở header thì phải thể hiện tương đương trong HTML template.",
      "- Bảng và khung phải là HTML/CSS thật, không phải background image PDF.",
      "- Chỉ sửa CSS nhỏ trong <style> nếu cần (font-size, margin) — không đổi cấu trúc utils.",
      "",
    ]
    : [];

  const taskLines = opts.hasSeedTemplate
    ? [
      "## Nhiệm vụ",
      `Chỉnh sửa mẫu trong [ACTIVE_EDITOR] cho trigger_key "${opts.triggerKey}".`,
      "Mẫu đã được patch sơ bộ theo PDF_LAYOUT_SPEC — chỉ tinh chỉnh phần còn lệch (tiêu đề, nhãn hdr, chữ ký, intro).",
      "Return TOÀN BỘ function body — bắt buộc `return` HTML kết thúc `</html>`.",
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
    "1. return chuỗi HTML đầy đủ: <!DOCTYPE html>...<div class=\"page\">...</div>.",
    "2. CSS inline trong <style> trong <head> (Times New Roman, bảng border, .page width ~780px).",
    "3. Header công ty: utils.buildCompanyHdr(cfg) — KHÔNG hardcode tên công ty.",
    "4. Bảng sản phẩm: utils.buildItemsTableHtml(groups, calc, utils, utils.printTableOpts || {...}).",
    "5. Tổng tiền (nếu PDF có): utils.buildTotalsHtml(calc, utils).",
    "6. Ô dữ liệu động: order.{field} ?? '' — field header có sẵn: " + fieldList,
    "7. Cột dòng hàng: " + (colList || "ten_sp, don_vi, chieu_rong, chieu_dai, so_tam, khoi_luong, don_gia, thanh_tien"),
    "8. Ghi chú và nhãn động phải lấy từ cfg/fields hiện tại của menu, không hardcode vào bộ tên cố định.",
    "9. PXK: utils.printTableOpts showPrice:false, hideColumns nếu cần.",
    "10. Code NGẮN GỌN: dùng utils.buildCompanyHdr / buildItemsTableHtml / buildTotalsHtml — KHÔNG nhét CSS dài; return phải có <!DOCTYPE html> hoặc template literal kết thúc </html>.",
    "",
    ...layoutBlock,
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
  pdfLayout: PdfLayoutSpec;
  pdfLineBoxes: Array<{ text: string; x: number; y: number; page: number }>;
};

/** Đọc PDF/ảnh mẫu: preview + text layer (PDF digital) cho AI local. */
export async function readPrintSampleFile(
  file: File,
  maxPages = 2,
  layoutCfg?: PdfLayoutExtractConfig,
): Promise<PrintSampleRead> {
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) {
    const emptyLayout = buildPdfLayoutSpec([[]], 1, layoutCfg);
    return { previewUrls: [await readFileAsDataUrl(file)], pdfText: "", pdfLayout: emptyLayout, pdfLineBoxes: [] };
  }
  if (type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return pdfToSampleRead(file, maxPages, layoutCfg);
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

async function pdfToSampleRead(
  file: File,
  maxPages: number,
  layoutCfg?: PdfLayoutExtractConfig,
): Promise<PrintSampleRead> {
  const pdfjs = await import("pdfjs-dist");
  const version = (pdfjs as any).version || "4.10.38";
  (pdfjs as any).GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);
  const urls: string[] = [];
  const textParts: string[] = [];
  const pageLines: string[][] = [];
  const pageLineBoxes: Array<{ text: string; x: number; y: number; page: number }> = [];
  let firstPageWidth = 0;
  let firstPageHeight = 0;

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    if (!firstPageWidth || !firstPageHeight) {
      firstPageWidth = baseViewport.width;
      firstPageHeight = baseViewport.height;
    }
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
      const lines = groupPdfTextIntoLines(textContent.items as any[], i);
      const lineBoxes = groupPdfTextIntoLineBoxes(textContent.items as any[], i);
      pageLines.push(lines);
      pageLineBoxes.push(...lineBoxes);
      const pageText = lines.join("\n");
      if (pageText) {
        textParts.push(`--- Trang ${i} ---\n${pageText}`);
      }
    } catch {
      pageLines.push([]);
    }
  }
  const pdfLayout = buildPdfLayoutSpec(pageLines, pageCount, layoutCfg);
  if (firstPageWidth > 0 && firstPageHeight > 0) {
    pdfLayout.pageWidth = firstPageWidth;
    pdfLayout.pageHeight = firstPageHeight;
  }
  return { previewUrls: urls, pdfText: textParts.join("\n\n").trim(), pdfLayout, pdfLineBoxes: pageLineBoxes };
}

export function suggestPrintConfig(docKind: PrintDocKind, triggerKey: string, layout?: PdfLayoutSpec) {
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
        print_table: {
          showPrice: layout?.showPrice !== false,
          showGroupSubtotal: layout?.showGroupSubtotal !== false,
        },
      };
    case "lenh_sx":
      return {
        ...base,
        label: "Xuất Lệnh SX nội bộ",
        filename_expr: "`LenhSX_${order.so_lenh || 'draft'}.pdf`",
        print_table: {
          showPrice: layout?.showPrice !== false,
          showGroupSubtotal: layout?.showGroupSubtotal !== false,
        },
      };
    case "pxk":
      return {
        ...base,
        label: "Xuất Lệnh SX + PXK",
        filename_expr: "`LenhSX_PXK_${order.so_lenh || 'draft'}.pdf`",
        print_table: {
          showPrice: layout?.showPrice === true,
          showGroupSubtotal: layout?.showGroupSubtotal === true,
          hideColumns: layout?.showPrice ? [] : ["chieu_rong", "don_gia", "thanh_tien"],
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
  pdfLayout?: PdfLayoutSpec;
  editorMetadata?: Record<string, unknown>;
}): Promise<{ code: string; usedSeedFallback?: boolean; usedLayoutPatch?: boolean }> {
  if (!opts.sampleImages.length) {
    throw new Error("Chưa có ảnh mẫu từ PDF.");
  }

  const seedBody = getBuiltinPrintTriggerBody(opts.docKind);
  const layout = opts.pdfLayout;
  const patchedSeed = seedBody && layout
    ? applyPdfLayoutToSeedTrigger(seedBody, layout, opts.docKind)
    : seedBody;
  const editorBase = patchedSeed ?? seedBody ?? "";

  const prompt = buildPrintImportPrompt({
    ...opts,
    hasSeedTemplate: Boolean(editorBase),
    pdfLayout: layout,
  });

  const pdfHint = layout?.docTitle
    ? `Layout PDF: tiêu đề "${layout.docTitle}", ${layout.orderedLines.length} dòng text, showPrice=${layout.showPrice}.`
    : opts.pdfText?.trim()
      ? `Đã trích text từ PDF (${opts.pdfText.length} ký tự).`
      : "PDF scan — dựa PDF_LAYOUT_SPEC + ghi chú.";

  const response = await request.post("ai-code-stream", {
    json: {
      appId: String(opts.appId || "line_items_print").trim() || "line_items_print",
      message: `${prompt}\n\n(${pdfHint})`,
      currentCode: editorBase,
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
        pdfLayout: layout ? formatLayoutSpecForPrompt(layout) : undefined,
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
    seedBody: editorBase || seedBody,
    fullResponse,
    completePayload,
  });

  const dryRun = dryRunPrintTriggerBody(code, opts.lineColumns);
  if (dryRun.ok) {
    return { code, usedLayoutPatch: Boolean(patchedSeed && patchedSeed !== seedBody) };
  }

  if (patchedSeed && patchedSeed !== code) {
    const patchedDry = dryRunPrintTriggerBody(patchedSeed, opts.lineColumns);
    if (patchedDry.ok) {
      return { code: patchedSeed, usedLayoutPatch: true, usedSeedFallback: true };
    }
  }

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
