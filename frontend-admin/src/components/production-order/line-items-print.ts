/**
 * In / xuất PDF từ HTML trigger — dùng iframe để giữ CSS và tránh PDF trắng.
 */
import html2pdf from "html2pdf.js";
import type { LiPrintPdfOptions } from "./types";

export interface PrintHtmlResult {
  ok: boolean;
  message?: string;
}

const DEFAULT_PDF_OPTIONS: Required<Pick<
  LiPrintPdfOptions,
  "format" | "orientation" | "unit" | "canvas_scale" | "use_cors" | "allow_taint" | "wait_for_fonts" | "preview_width_px"
>> & {
  margin_mm: [number, number, number, number];
  pagebreak_mode: string[];
} = {
  format: "a4",
  orientation: "portrait",
  unit: "mm",
  margin_mm: [0, 0, 0, 0],
  canvas_scale: 2,
  use_cors: true,
  allow_taint: true,
  pagebreak_mode: ["css", "legacy"],
  wait_for_fonts: true,
  preview_width_px: 794,
};

function normalizePdfOptions(opts?: LiPrintPdfOptions) {
  const marginRaw = Array.isArray(opts?.margin_mm) ? opts?.margin_mm : DEFAULT_PDF_OPTIONS.margin_mm;
  const margin = [
    Number(marginRaw?.[0] ?? 0),
    Number(marginRaw?.[1] ?? 0),
    Number(marginRaw?.[2] ?? 0),
    Number(marginRaw?.[3] ?? 0),
  ] as [number, number, number, number];
  return {
    format: String(opts?.format || DEFAULT_PDF_OPTIONS.format),
    orientation: opts?.orientation || DEFAULT_PDF_OPTIONS.orientation,
    unit: opts?.unit || DEFAULT_PDF_OPTIONS.unit,
    margin,
    canvasScale: Number(opts?.canvas_scale ?? DEFAULT_PDF_OPTIONS.canvas_scale),
    windowWidthPx: Number(opts?.window_width_px ?? 0),
    useCORS: opts?.use_cors ?? DEFAULT_PDF_OPTIONS.use_cors,
    allowTaint: opts?.allow_taint ?? DEFAULT_PDF_OPTIONS.allow_taint,
    pagebreakMode: Array.isArray(opts?.pagebreak_mode) && opts?.pagebreak_mode.length
      ? opts.pagebreak_mode
      : DEFAULT_PDF_OPTIONS.pagebreak_mode,
    waitForFonts: opts?.wait_for_fonts ?? DEFAULT_PDF_OPTIONS.wait_for_fonts,
    previewWidthPx: Number(opts?.preview_width_px ?? DEFAULT_PDF_OPTIONS.preview_width_px),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PRINT_PAGEBREAK_STYLE = [
  ".pdf-page-break{break-before:page;page-break-before:always;height:0}",
  ".no-page-break{break-inside:avoid;page-break-inside:avoid}",
  "[data-page-break=\"before\"]{break-before:page;page-break-before:always}",
  "[data-page-break=\"after\"]{break-after:page;page-break-after:always}",
].join("\n");

/**
 * Đồng bộ HTML xem trước với engine export PDF: thêm cùng CSS page-break/avoid
 * để preview trong modal và file PDF có hành vi ngắt trang giống nhau.
 */
export function normalizePreviewHtml(html: string): string {
  const src = String(html ?? "");
  if (!src.trim()) return src;
  if (src.includes("id=\"csm-print-pagebreak-style\"")) return src;

  const styleTag = `<style id="csm-print-pagebreak-style">${PRINT_PAGEBREAK_STYLE}</style>`;
  if (/<\/head>/i.test(src)) {
    return src.replace(/<\/head>/i, `${styleTag}</head>`);
  }
  if (/<body[^>]*>/i.test(src)) {
    return src.replace(/<body([^>]*)>/i, `<body$1>${styleTag}`);
  }
  return `${styleTag}${src}`;
}

/** Phát hiện HTML lỗi từ evalPrintTemplate. */
export function validatePrintHtml(html: string): PrintHtmlResult {
  const text = String(html ?? "").trim();
  if (!text) return { ok: false, message: "Mẫu in trả về HTML rỗng." };
  if (/Lỗi render template/i.test(text)) {
    const m = text.match(/Lỗi render template:\s*([^<]+)/i);
    return { ok: false, message: m?.[1]?.trim() || "Lỗi render template." };
  }
  return { ok: true };
}

function waitForImages(doc: Document | null | undefined): Promise<void> {
  if (!doc) return Promise.resolve();
  const images = Array.from(doc.images ?? []);
  if (images.length === 0) return Promise.resolve();
  return Promise.all(
    images.map(
      img => img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

function waitForFonts(doc: Document | null | undefined): Promise<void> {
  const fonts = (doc as any)?.fonts;
  if (!fonts?.ready) return Promise.resolve();
  return Promise.resolve(fonts.ready).then(() => undefined).catch(() => undefined);
}

async function exportFromMountedTarget(
  target: HTMLElement,
  doc: Document | null | undefined,
  fileName: string,
  normalized: ReturnType<typeof normalizePdfOptions>,
): Promise<void> {
  const docEl = doc?.documentElement;
  const renderWidth = normalized.windowWidthPx > 0 ? normalized.windowWidthPx : normalized.previewWidthPx;
  const fullWidth = Math.max(
    target.scrollWidth || 0,
    target.offsetWidth || 0,
    docEl?.scrollWidth || 0,
    renderWidth,
  );
  const canvasWidth = Math.max(renderWidth, fullWidth);

  await (html2pdf as any)()
    .set({
      margin: normalized.margin,
      filename: fileName || "document.pdf",
      html2canvas: {
        scale: normalized.canvasScale,
        useCORS: normalized.useCORS,
        allowTaint: normalized.allowTaint,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: canvasWidth,
        width: canvasWidth,
        onclone: (clonedDoc: Document) => {
          const cHtml = clonedDoc.documentElement;
          const cBody = clonedDoc.body;
          if (cHtml) {
            cHtml.style.width = `${canvasWidth}px`;
            cHtml.style.maxWidth = `${canvasWidth}px`;
          }
          if (cBody) {
            cBody.style.width = `${canvasWidth}px`;
            cBody.style.maxWidth = `${canvasWidth}px`;
            cBody.style.margin = "0";
            cBody.style.padding = "0";
            cBody.style.overflow = "visible";
          }
        },
      },
      jsPDF: {
        unit: normalized.unit,
        format: normalized.format,
        orientation: normalized.orientation,
      },
      pagebreak: {
        mode: normalized.pagebreakMode,
        before: ".pdf-page-break,[data-page-break='before']",
        after: "[data-page-break='after']",
        avoid: ".no-page-break",
      },
    })
    .from(target)
    .save();
}

/** Mount HTML vào iframe ẩn, trả về body để html2pdf xuất toàn bộ tài liệu (nhiều trang). */
export async function mountPrintIframe(html: string, opts?: LiPrintPdfOptions): Promise<{
  iframe: HTMLIFrameElement;
  target: HTMLElement;
  cleanup: () => void;
}> {
  const normalized = normalizePdfOptions(opts);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "csm-print");
  iframe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    `width:${Math.max(320, normalized.previewWidthPx)}px`,
    "height:1200px",
    "border:0",
    "opacity:0",
    "pointer-events:none",
    "z-index:99999",
  ].join(";");
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("Không tải được iframe in"));
    iframe.srcdoc = html;
    setTimeout(() => resolve(), 8000);
  });

  await sleep(50);
  const doc = iframe.contentDocument;
  if (doc && !doc.getElementById("csm-print-pagebreak-style")) {
    const style = doc.createElement("style");
    style.id = "csm-print-pagebreak-style";
    style.textContent = PRINT_PAGEBREAK_STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }
  if (normalized.waitForFonts) {
    await Promise.all([waitForFonts(doc ?? undefined), waitForImages(doc ?? undefined)]);
  } else {
    await waitForImages(doc ?? undefined);
  }

  const target = doc?.body as HTMLElement | null;
  if (!target) {
    cleanup();
    throw new Error("Không tìm thấy nội dung body trong mẫu HTML.");
  }

  return { iframe, target, cleanup };
}

export async function exportHtmlToPdf(html: string, fileName: string, opts?: LiPrintPdfOptions): Promise<void> {
  const check = validatePrintHtml(html);
  if (!check.ok) throw new Error(check.message);
  const normalized = normalizePdfOptions(opts);

  const { target, iframe, cleanup } = await mountPrintIframe(html, opts);
  try {
    await exportFromMountedTarget(target, iframe.contentDocument, fileName, normalized);
  } finally {
    cleanup();
  }
}

/**
 * Xuất PDF trực tiếp từ iframe preview đang mở để đảm bảo preview == export.
 */
export async function exportPreviewIframeToPdf(
  iframe: HTMLIFrameElement,
  fileName: string,
  opts?: LiPrintPdfOptions,
): Promise<void> {
  const normalized = normalizePdfOptions(opts);
  const doc = iframe?.contentDocument;
  if (!doc) throw new Error("Không truy cập được document của khung xem trước.");
  const target = doc?.body as HTMLElement | null;
  if (!target) throw new Error("Không tìm thấy nội dung xem trước để xuất PDF.");

  if (!doc.getElementById("csm-print-pagebreak-style")) {
    const style = doc.createElement("style");
    style.id = "csm-print-pagebreak-style";
    style.textContent = PRINT_PAGEBREAK_STYLE;
    (doc.head || doc.documentElement).appendChild(style);
  }
  if (normalized.waitForFonts) {
    await Promise.all([waitForFonts(doc), waitForImages(doc)]);
  } else {
    await waitForImages(doc);
  }

  await exportFromMountedTarget(target, doc, fileName, normalized);
}

export function printHtmlInBrowser(html: string): Window | null {
  const check = validatePrintHtml(html);
  if (!check.ok) {
    throw new Error(check.message);
  }
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!win) throw new Error("Trình duyệt chặn cửa sổ in. Cho phép popup rồi thử lại.");
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  const doPrint = () => {
    try {
      win.print();
    } catch { /* user may cancel */ }
  };
  if (win.document.readyState === "complete") {
    setTimeout(doPrint, 300);
  } else {
    win.onload = () => setTimeout(doPrint, 300);
  }
  return win;
}
