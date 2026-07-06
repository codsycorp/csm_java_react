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

export interface PdfLayoutExtractConfig {
  /** Regex strings để nhận diện dòng header; đọc từ menu JSON (settings.pdf_layout_extract). */
  header_line_patterns?: string[];
  /** Số dòng header tối đa giữ lại. */
  max_header_lines?: number;
  /** Regex strings cho section markers theo kind. */
  section_markers?: Array<{ kind: string; patterns: string[] }>;
  /** Regex strings cho nhãn chữ ký. */
  signature_patterns?: string[];
  /** Hint để phát hiện dòng tiêu đề bảng cột. */
  table_header_hints?: string[];
  /** Hint để xác định có cột giá. */
  price_hints?: string[];
  /** Regex strings để nhận diện tiêu đề chứng từ. */
  doc_title_patterns?: string[];
  /** Regex strings nhận diện loại chứng từ theo key (bao_gia|lenh_sx|pxk). */
  doc_kind_patterns?: Partial<Record<Exclude<PrintDocKind, "custom">, string[]>>;
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

function compileRegexList(patterns?: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns ?? []) {
    const src = String(p ?? "").trim();
    if (!src) continue;
    try {
      out.push(new RegExp(src, "i"));
    } catch {
      // ignore invalid regex from config
    }
  }
  return out;
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

function pickDocTitle(lines: string[], cfg?: PdfLayoutExtractConfig): string | undefined {
  const titlePatterns = compileRegexList(cfg?.doc_title_patterns);
  if (titlePatterns.length) {
    for (const line of lines.slice(0, 30)) {
      const t = line.trim();
      if (!t) continue;
      if (titlePatterns.some(p => p.test(t))) return t;
    }
  }
  for (const line of lines.slice(0, 25)) {
    const t = line.trim();
    if (t.length < 8 || t.length > 120) continue;
    const upper = t.toUpperCase();
    // Generic fallback: pick an emphasized uppercase heading near top.
    if (upper === t.toUpperCase() && t.split(/\s+/).length >= 3) {
      return t;
    }
  }
  return undefined;
}

function pickTableHeaders(lines: string[], cfg?: PdfLayoutExtractConfig): string[] {
  const hints = (cfg?.table_header_hints?.length ? cfg.table_header_hints : TABLE_HDR_HINTS)
    .map(h => String(h || "").toLowerCase())
    .filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hits = hints.filter(h => lower.includes(h));
    if (hits.length >= 4) {
      return line.split(/\s{2,}|\t/).map(s => s.trim()).filter(Boolean);
    }
    if (hits.length >= 3 && /tt|stt/i.test(line)) {
      return line.split(/\s+/).filter(w => w.length > 0);
    }
  }
  return [];
}

function detectSections(lines: string[], cfg?: PdfLayoutExtractConfig): PdfLayoutSpec["sections"] {
  const configured = (cfg?.section_markers ?? []).map(m => ({
    kind: String(m?.kind ?? "").trim(),
    patterns: compileRegexList(m?.patterns),
  })).filter(m => m.kind && m.patterns.length > 0);
  const markers = configured.length ? configured : SECTION_MARKERS;
  const out: PdfLayoutSpec["sections"] = [];
  for (const line of lines) {
    for (const { kind, patterns } of markers) {
      if (patterns.some(p => p.test(line.trim()))) {
        out.push({ kind, title: line.trim().slice(0, 120), preview: line.trim() });
        break;
      }
    }
  }
  return out;
}

function detectSignatures(lines: string[], cfg?: PdfLayoutExtractConfig): string[] {
  const patterns = (() => {
    const configured = compileRegexList(cfg?.signature_patterns);
    return configured.length ? configured : SIG_PATTERNS;
  })();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    for (const p of patterns) {
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

function detectHeaderLabel(lines: string[], fallback: string, pickIndex = 0): string {
  const labels = lines
    .map((line) => {
      const trimmed = String(line || "").trim();
      const idx = trimmed.indexOf(":");
      if (idx < 2) return "";
      const label = trimmed.slice(0, idx).trim();
      if (label.length < 2 || label.length > 60) return "";
      return label;
    })
    .filter(Boolean);
  if (labels[pickIndex]) return labels[pickIndex];
  if (labels[0]) return labels[0];
  return fallback;
}

function toSafeSingleQuoted(text: string): string {
  return String(text ?? "").replace(/'/g, "\\'");
}

function findLabelByOrderField(code: string, fieldName: string): string | undefined {
  const escField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<td[^>]*>\\s*([^:<>{]{2,80})\\s*:\\s*\\$\\{[^}]*order\\.${escField}[^}]*\\}`, "i"),
    new RegExp(`([^\\n\\r:<>{]{2,80})\\s*:\\s*\\$\\{[^}]*order\\.${escField}[^}]*\\}`, "i"),
  ];
  for (const p of patterns) {
    const m = code.match(p);
    const label = String(m?.[1] ?? "").trim();
    if (label) return label;
  }
  return undefined;
}

function extractHeaderLines(lines: string[], cfg?: PdfLayoutExtractConfig): string[] {
  const maxLines = Math.max(1, Number(cfg?.max_header_lines ?? 12));
  const configuredPatterns = compileRegexList(cfg?.header_line_patterns);

  if (configuredPatterns.length) {
    return lines
      .filter(line => configuredPatterns.some(p => p.test(String(line || "").trim())))
      .slice(0, maxLines);
  }

  // Generic fallback (không khóa cứng theo ngôn ngữ): ưu tiên dòng nhãn dạng "X: ..." gần đầu trang.
  return lines
    .slice(0, 40)
    .filter((line) => {
      const t = String(line || "").trim();
      if (!t || t.length < 5 || t.length > 160) return false;
      const colonIdx = t.indexOf(":");
      if (colonIdx > 1 && colonIdx <= 48) return true;
      if (/\b[^\d\s][^:]{0,48}\s[-–]\s/.test(t)) return true;
      if (/\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(t)) return true;
      return false;
    })
    .slice(0, maxLines);
}

export function buildPdfLayoutSpec(
  pageLines: string[][],
  pageCount: number,
  cfg?: PdfLayoutExtractConfig,
): PdfLayoutSpec {
  const orderedLines = pageLines.flat().slice(0, 120);
  const tableColumnHeaders = pickTableHeaders(orderedLines, cfg);
  const hdrLower = tableColumnHeaders.join(" ").toLowerCase();
  const priceHints = (cfg?.price_hints?.length ? cfg.price_hints : ["đơn giá", "thành tiền", "vnđ"])
    .map(h => String(h || "").toLowerCase())
    .filter(Boolean);
  const showPrice = priceHints.some(h => hdrLower.includes(h))
    || orderedLines.some(l => priceHints.some(h => l.toLowerCase().includes(h)));
  const sections = detectSections(orderedLines, cfg);
  const signatureLabels = detectSignatures(orderedLines, cfg);
  const headerLines = extractHeaderLines(orderedLines, cfg);

  let docSubtitle: string | undefined;
  const title = pickDocTitle(orderedLines, cfg);
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

export function inferDocKindFromLayout(
  layout: PdfLayoutSpec,
  cfg?: PdfLayoutExtractConfig,
): PrintDocKind | undefined {
  const blob = layout.orderedLines.join(" ").toLowerCase();

  const kindOrder: Array<Exclude<PrintDocKind, "custom">> = ["pxk", "lenh_sx", "bao_gia"];
  for (const kind of kindOrder) {
    const patterns = compileRegexList(cfg?.doc_kind_patterns?.[kind]);
    if (patterns.length > 0 && patterns.some((p) => p.test(blob))) {
      return kind;
    }
  }

  // Fallback tổng quát: không phụ thuộc ngôn ngữ cụ thể.
  if (!layout.showPrice && layout.signatureLabels.length >= 4) return "pxk";
  if (layout.sections.some((s) => s.kind === "delivery")) return "lenh_sx";
  if (layout.sections.some((s) => s.kind === "payment")) return "bao_gia";

  const title = String(layout.docTitle || "").trim();
  if (title) {
    const hasOrderLike = /\b(order|production|manufacturing|xuat|kho|warehouse|dispatch|delivery)\b/i.test(title);
    if (hasOrderLike && !layout.showPrice) return "pxk";
    if (hasOrderLike) return "lenh_sx";
    if (layout.showPrice) return "bao_gia";
  }

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

  if (docKind === "bao_gia") {
    const contactLabel = detectHeaderLabel(layout.headerLines, "", 0).trim();
    const salesLabel = detectHeaderLabel(layout.headerLines, "", 1).trim();
    const contactFallback = contactLabel || salesLabel;
    const salesFallback = salesLabel || contactLabel;

    const existingContact = findLabelByOrderField(code, "nguoi_lien_he")
      ?? findLabelByOrderField(code, "dien_thoai_lien_he");
    const existingSales = findLabelByOrderField(code, "nvkd");

    if (existingContact && contactFallback) {
      const esc = existingContact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const contactExpr = contactFallback
        ? `\${cfg.header_labels?.contact ?? cfg.header_labels_defaults?.contact ?? '${toSafeSingleQuoted(contactFallback)}'}:`
        : `\${cfg.header_labels?.contact ?? cfg.header_labels_defaults?.contact}:`;
      code = code.replace(new RegExp(`${esc}\\s*:`, "g"), contactExpr);
    }
    if (existingSales && salesFallback) {
      const esc = existingSales.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const salesExpr = salesFallback
        ? `\${cfg.header_labels?.sales ?? cfg.header_labels_defaults?.sales ?? '${toSafeSingleQuoted(salesFallback)}'}:`
        : `\${cfg.header_labels?.sales ?? cfg.header_labels_defaults?.sales}:`;
      code = code.replace(new RegExp(`${esc}\\s*:`, "g"), salesExpr);
    }
  }

  if (layout.pages >= 2 && docKind === "bao_gia") {
    if (!/\.pdf-page-break\s*\{/.test(code)) {
      code = code.replace(
        /\.receive-line\s*\{[^}]*\}/,
        `$&\n.pdf-page-break { break-before: page; page-break-before: always; height: 0; }\n@media print { .pdf-page-break { break-before: page; page-break-before: always; } }`,
      );
    }
    code = code.replace(
      /\$\{totals\}\$\{notes\}\$\{payment\}\$\{sigs\}/,
      "${totals}${((typeof cfg !== 'undefined' && (cfg.page_break_after_totals_bao_gia ?? true)) ? '<div class=\"pdf-page-break\"></div>' : '')}${notes}${payment}${sigs}",
    );
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
