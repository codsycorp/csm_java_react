/**
 * In / xuất PDF từ HTML trigger — dùng iframe để giữ CSS và tránh PDF trắng.
 */
import html2pdf from "html2pdf.js";

export interface PrintHtmlResult {
  ok: boolean;
  message?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

/** Mount HTML vào iframe ẩn, trả về phần tử .page (hoặc body) để html2pdf chụp. */
export async function mountPrintIframe(html: string): Promise<{
  iframe: HTMLIFrameElement;
  target: HTMLElement;
  cleanup: () => void;
}> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "csm-print");
  iframe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:820px",
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
  await waitForImages(doc ?? undefined);

  const target = (doc?.querySelector(".page") ?? doc?.body) as HTMLElement | null;
  if (!target) {
    cleanup();
    throw new Error("Không tìm thấy nội dung in (.page) trong mẫu HTML.");
  }

  return { iframe, target, cleanup };
}

export async function exportHtmlToPdf(html: string, fileName: string): Promise<void> {
  const check = validatePrintHtml(html);
  if (!check.ok) throw new Error(check.message);

  const { target, cleanup } = await mountPrintIframe(html);
  try {
    await (html2pdf as any)()
      .set({
        margin: [8, 8, 8, 8],
        filename: fileName || "document.pdf",
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: target.scrollWidth || 820,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(target)
      .save();
  } finally {
    cleanup();
  }
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
