/**
 * Trích layout có cấu trúc từ PDF (vị trí text) → khớp trigger in với mẫu.
 */
import type { PrintDocKind } from "./line-items-print-import";

export interface PdfLayoutSpec {
  pages: number;
  docTitle?: string;
  docSubtitle?: string;
  headerLines: string[];
  tableColumnHeaders: string[];
  showPrice: boolean;
  showGroupSubtotal: boolean;
  sections: Array<{ kind: string; title: string; preview: string }>;
  signatureLabels: string[];
  /** Dòng text theo thứ tự từ trên xuống (tối đa ~120) — gửi AI/Go */
  orderedLines: string[];
}

type PositionedText = { text: string; x: number; y: number; page: number };

const SECTION_MARKERS: Array<{ kind: string; patterns: RegExp[] }> = [
  { kind: "notes", patterns: [/^ghi chú/i, /^lưu ý/i] },
  { kind: "payment", patterns: [/^phương thức thanh toán/i, /^thanh toán/i] },
  { kind: "delivery", patterns: [/^điều kiện giao hàng/i, /^\*\* điều kiện/i] },
  { kind: "intro", patterns: [/^cảm ơn quý khách/i] },
  { kind: "receive", patterns: [/^bên nhận hàng/i, /^người nhận hàng/i] },
];

const SIG_PATTERNS = [
  /đại diện bên mua/i, /đại diện bên bán/i,
  /giám đốc phê duyệt/i, /người yêu cầu sản xuất/i,
  /người nhận hàng/i, /thủ kho/i, /người giao hàng/i, /người lập phiếu/i,
];

const TABLE_HDR_HINTS = [
  "tt", "tên", "quy cách", "đơn vị", "chiều", "rộng", "dài", "số tấm", "khối lượng",
  "đơn giá", "thành tiền", "stt",
];

function roundY(y: number): number {
  return Math.round(y / 4) * 4;
}

/** Gom text items pdf.js theo dòng (y) rồi xếp x. */
export function groupPdfTextIntoLines(items: Array<{ str?: string; transform?: number[] }>, page: number): string[] {
  const buckets = new Map<number, PositionedText[]>();
  for (const item of items) {
    const text = String(item?.str ?? "").trim();
    if (!text) continue;
    const t = item.transform ?? [];
    const x = Number(t[4] ?? 0);
    const y = roundY(Number(t[5] ?? 0));
    const list = buckets.get(y) ?? [];
    list.push({ text, x, y, page });
    buckets.set(y, list);
  }
  const ys = [...buckets.keys()].sort((a, b) => b - a);
  const lines: string[] = [];
  for (const y of ys) {
    const parts = (buckets.get(y) ?? []).sort((a, b) => a.x - b.x).map(p => p.text);
    const line = parts.join(" ").replace(/\s+/g, " ").trim();
    if (line) lines.push(line);
  }
  return lines;
}

function pickDocTitle(lines: string[]): string | undefined {
  for (const line of lines.slice(0, 25)) {
    const t = line.trim();
    if (t.length < 8 || t.length > 120) continue;
    const upper = t.toUpperCase();
    if (
      /BÁO GIÁ|LỆNH SẢN XUẤT|PHIẾU XUẤT|XÁC NHẬN ĐƠN HÀNG|PXK|KIÊM/.test(upper)
      && upper === t.toUpperCase()
    ) {
      return t;
    }
  }
  return undefined;
}

function pickTableHeaders(lines: string[]): string[] {
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hits = TABLE_HDR_HINTS.filter(h => lower.includes(h));
    if (hits.length >= 4) {
      return line.split(/\s{2,}|\t/).map(s => s.trim()).filter(Boolean);
    }
    if (hits.length >= 3 && /tt|stt/i.test(line)) {
      return line.split(/\s+/).filter(w => w.length > 0);
    }
  }
  return [];
}

function detectSections(lines: string[]): PdfLayoutSpec["sections"] {
  const out: PdfLayoutSpec["sections"] = [];
  for (const line of lines) {
    for (const { kind, patterns } of SECTION_MARKERS) {
      if (patterns.some(p => p.test(line.trim()))) {
        out.push({ kind, title: line.trim().slice(0, 120), preview: line.trim() });
        break;
      }
    }
  }
  return out;
}

function detectSignatures(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    for (const p of SIG_PATTERNS) {
      if (p.test(line)) {
        const label = line.trim().slice(0, 80);
        if (!seen.has(label)) {
          seen.add(label);
          out.push(label);
        }
      }
    }
  }
  return out;
}

export function buildPdfLayoutSpec(pageLines: string[][], pageCount: number): PdfLayoutSpec {
  const orderedLines = pageLines.flat().slice(0, 120);
  const tableColumnHeaders = pickTableHeaders(orderedLines);
  const hdrLower = tableColumnHeaders.join(" ").toLowerCase();
  const showPrice = /đơn giá|thành tiền|vnđ/.test(hdrLower)
    || orderedLines.some(l => /đơn giá|thành tiền/i.test(l));
  const sections = detectSections(orderedLines);
  const signatureLabels = detectSignatures(orderedLines);
  const headerLines = orderedLines.filter(l =>
    /kính gửi|số:|ngày:|khách hàng|địa chỉ|nv bán|hiệu lực|số lệnh|thời gian gửi/i.test(l),
  ).slice(0, 12);

  let docSubtitle: string | undefined;
  const title = pickDocTitle(orderedLines);
  if (title) {
    const idx = orderedLines.findIndex(l => l.trim() === title);
    if (idx >= 0 && orderedLines[idx + 1] && orderedLines[idx + 1].length < 80) {
      docSubtitle = orderedLines[idx + 1];
    }
  }

  return {
    pages: pageCount,
    docTitle: title,
    docSubtitle,
    headerLines,
    tableColumnHeaders,
    showPrice,
    showGroupSubtotal: showPrice,
    sections,
    signatureLabels,
    orderedLines,
  };
}

export function inferDocKindFromLayout(layout: PdfLayoutSpec): PrintDocKind | undefined {
  const blob = layout.orderedLines.join(" ").toLowerCase();
  if (/phiếu xuất|pxk|kiêm phiếu|xuất kho/.test(blob)) return "pxk";
  if (/lệnh sản xuất nội bộ|lsx nội bộ/.test(blob)) return "lenh_sx";
  if (/báo giá|bảng báo giá/.test(blob)) return "bao_gia";
  return undefined;
}

/** Patch mẫu Phú Sơn theo layout PDF — giữ utils.*, chỉ đổi tiêu đề/nhãn/ẩn giá. */
export function applyPdfLayoutToSeedTrigger(
  seedBody: string,
  layout: PdfLayoutSpec,
  docKind: PrintDocKind,
): string {
  if (!seedBody?.trim()) return seedBody;
  let code = seedBody;

  if (layout.docTitle) {
    const escaped = layout.docTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    code = code.replace(
      /<div class="doc-title">[^<]*<\/div>/,
      `<div class="doc-title">${layout.docTitle.replace(/</g, "&lt;")}</div>`,
    );
    code = code.replace(
      new RegExp(`doc-title">[^<]+<`, "i"),
      `doc-title">${layout.docTitle.replace(/</g, "&lt;")}<`,
    );
    void escaped;
  }

  if (!layout.showPrice && (docKind === "pxk" || !layout.showPrice)) {
    code = code.replace(
      /utils\.printTableOpts\s*\|\|\s*\{[^}]*\}/g,
      "utils.printTableOpts || { showPrice: false, showGroupSubtotal: false }",
    );
    if (!/showPrice:\s*false/.test(code)) {
      code = code.replace(
        /(buildItemsTableHtml\([^)]+,\s*utils\.printTableOpts\s*\|\|\s*)\{[^}]*\}/,
        "$1{ showPrice: false, showGroupSubtotal: false }",
      );
    }
  }

  if (layout.docSubtitle) {
    const sub = layout.docSubtitle.replace(/</g, "&lt;");
    if (!/class="doc-sub"/.test(code)) {
      code = code.replace(
        /(<div class="doc-title">[^<]*<\/div>)/,
        `$1\n<div class="doc-sub">${sub}</div>`,
      );
    } else {
      code = code.replace(/<div class="doc-sub">[^<]*<\/div>/, `<div class="doc-sub">${sub}</div>`);
    }
  }

  if (layout.signatureLabels.length >= 2) {
    const sigs = layout.signatureLabels.slice(0, docKind === "pxk" ? 5 : 2);
    const sigBoxes = sigs.map(lbl => (
      `<div class="sig-box"><div class="lbl">${lbl.replace(/</g, "&lt;")}</div>`
      + `<div class="sub">(ký, ghi rõ họ tên)</div><div class="name"></div></div>`
    )).join("");
    if (docKind === "pxk") {
      const labelsJson = JSON.stringify(sigs);
      code = code.replace(
        /\['Người lập phiếu'[^\]]*\]/,
        labelsJson,
      );
    } else {
      code = code.replace(
        /const sigs = `[\s\S]*?`;/,
        `const sigs = \`<div class="sig-row">${sigBoxes}</div>\`;`,
      );
    }
  }

  if (layout.sections.some(s => s.kind === "intro")) {
    const introLine = layout.sections.find(s => s.kind === "intro")?.preview
      ?? layout.orderedLines.find(l => /^cảm ơn/i.test(l));
    if (introLine) {
      code = code.replace(
        /const introDefault = '[^']*';/,
        `const introDefault = ${JSON.stringify(introLine)};`,
      );
    }
  }

  return code;
}

export function formatLayoutSpecForPrompt(layout: PdfLayoutSpec): string {
  return JSON.stringify({
    docTitle: layout.docTitle,
    docSubtitle: layout.docSubtitle,
    headerLines: layout.headerLines,
    tableColumnHeaders: layout.tableColumnHeaders,
    showPrice: layout.showPrice,
    sections: layout.sections.map(s => ({ kind: s.kind, title: s.title })),
    signatureLabels: layout.signatureLabels,
    orderedLinesPreview: layout.orderedLines.slice(0, 40),
  }, null, 2);
}
