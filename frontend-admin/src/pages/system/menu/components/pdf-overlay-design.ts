export type PdfOverlayPlanItemLike = {
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  align?: "L" | "C" | "R" | string;
  fontSize?: number;
  fontName?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  opacity?: number;
  rotate?: number;
  text?: string;
};

export type PdfOverlayFieldLike = {
  f_name?: string;
  f_header?: string;
  f_header_en?: string;
  f_header_zh?: string;
};

export type PdfLayoutLike = {
  docTitle?: string;
  docSubtitle?: string;
  headerLines?: string[];
  tableColumnHeaders?: string[];
  signatureLabels?: string[];
  orderedLines?: string[];
  sections?: Array<{ title?: string; lines?: string[] }>;
  showPrice?: boolean;
  pageWidth?: number;
  pageHeight?: number;
};

export type PdfReportDesignSpec = {
  title: string;
  layoutKind: "dynamic-pdf-template" | "quotation-grouped-table";
  pageWidth?: number;
  pageHeight?: number;
  coordinateUnit?: "pt" | "mm";
  coordinateOrigin?: "bottom-left" | "top-left";
  company?: { name?: string; address?: string; taxCode?: string; website?: string };
  intro?: string;
  header: Array<{ label: string; token: string; sampleValue: string }>;
  table?: { headers: string[]; fields: string[]; widths: number[]; grouped?: boolean };
  sections: Array<{ id: string; title: string; lines: string[] }>;
  totals: Array<{ label: string; token: string; value: string }>;
  signatures: Array<{ label: string; token: string; value: string }>;
  notes?: string[];
  paymentTerms?: string[];
  footer: string[];
  overlaySummary: Array<{ page: number; x: number; y: number; text: string }>;
  overlayItems?: Array<{
    page: number;
    x: number;
    y: number;
    width?: number;
    align?: "L" | "C" | "R";
    fontSize?: number;
    fontName?: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    text: string;
  }>;
};

function normalizeText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeTokenName(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "");
}

function toDisplayText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.map((item) => toDisplayText(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resolveObjectPath(source: Record<string, any> | undefined, path: string): unknown {
  if (!source || !path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let current: any = source;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function sanitizeDisplayLine(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLabelValueLine(line: string): { label: string; value: string } {
  const text = sanitizeDisplayLine(line);
  if (!text) return { label: "", value: "" };
  const idx = text.indexOf(":");
  if (idx <= 0 || idx > 60) return { label: text, value: "" };
  const label = sanitizeDisplayLine(text.slice(0, idx));
  const value = sanitizeDisplayLine(text.slice(idx + 1));
  return { label, value };
}

function deriveCompanyInfo(lines: string[]): { name?: string; address?: string; taxCode?: string; website?: string } | undefined {
  const source = (Array.isArray(lines) ? lines : []).map((line) => sanitizeDisplayLine(line)).filter(Boolean);
  if (!source.length) return undefined;

  const name = source.find((line) => /c[oô]ng ty|company/i.test(line));
  const address = source.find((line) => /địa chỉ|dia chi|address/i.test(line));
  const taxLine = source.find((line) => /\bmst\b|tax/i.test(line));
  const website = source.find((line) => /https?:\/\//i.test(line));

  const taxCode = (() => {
    const raw = String(taxLine || "");
    const m = raw.match(/(\d{10,14})/);
    return m?.[1] || "";
  })();

  const out = {
    name: name || undefined,
    address: address ? address.replace(/^\s*(địa chỉ|dia chi|address)\s*:\s*/i, "") : undefined,
    taxCode: taxCode || undefined,
    website: website || undefined,
  };

  return out.name || out.address || out.taxCode || out.website ? out : undefined;
}

function pickSectionLines(lines: string[], hints: string[], max = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = sanitizeDisplayLine(line);
    if (!normalized) continue;
    const lower = normalizeText(normalized);
    if (!hints.some((hint) => lower.includes(hint))) continue;
    const key = lower;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function collectDesignCandidateLines(
  layout: PdfLayoutLike | undefined,
  overlayItems: PdfOverlayPlanItemLike[] = [],
  sampleLines: string[] = [],
): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  const pushLine = (value: unknown) => {
    const normalized = sanitizeDisplayLine(String(value || ""));
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    collected.push(normalized);
  };

  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  for (const section of sections) {
    if (Array.isArray(section?.lines)) {
      section.lines.forEach((line) => pushLine(line));
    }
  }

  const headerLines = Array.isArray(layout?.headerLines) ? layout.headerLines : [];
  headerLines.forEach((line) => pushLine(line));

  const orderedLines = Array.isArray(layout?.orderedLines) ? layout.orderedLines : [];
  orderedLines.forEach((line) => pushLine(line));

  (Array.isArray(sampleLines) ? sampleLines : []).forEach((line) => pushLine(line));
  (Array.isArray(overlayItems) ? overlayItems : []).forEach((item) => pushLine(item?.text));

  return collected.slice(0, 16);
}

function fallbackValueForToken(token: string, fields: PdfOverlayFieldLike[]): string {
  const normalizedToken = normalizeTokenName(token);
  const fieldMeta = fields.find((field) => normalizeTokenName(field.f_name || "") === normalizedToken);
  if (fieldMeta) {
    const candidates = [fieldMeta.f_header, fieldMeta.f_header_en, fieldMeta.f_header_zh, fieldMeta.f_name]
      .filter(Boolean)
      .map((item) => String(item).trim());
    if (candidates.length) return candidates[0];
  }

  if (normalizedToken.includes("company") || normalizedToken.includes("congty") || normalizedToken.includes("client")) {
    return "Công ty ABC";
  }
  if (normalizedToken.includes("name") || normalizedToken.includes("ten")) {
    return "Nguyễn Văn An";
  }
  if (normalizedToken.includes("date") || normalizedToken.includes("ngay")) {
    return new Date().toLocaleDateString("vi-VN");
  }
  if (normalizedToken.includes("address") || normalizedToken.includes("diachi")) {
    return "Số 123 đường Nguyễn Văn Linh";
  }
  if (normalizedToken.includes("phone") || normalizedToken.includes("sdt") || normalizedToken.includes("mobile")) {
    return "0909 123 456";
  }
  if (normalizedToken.includes("qty") || normalizedToken.includes("quantity") || normalizedToken.includes("soluong")) {
    return "12";
  }
  if (normalizedToken.includes("price") || normalizedToken.includes("amount") || normalizedToken.includes("tong") || normalizedToken.includes("tien")) {
    return "1.250.000";
  }
  if (normalizedToken.includes("note") || normalizedToken.includes("ghichu")) {
    return "Ghi chú mẫu";
  }
  if (normalizedToken.includes("report") || normalizedToken.includes("so") || normalizedToken.includes("code")) {
    return "BC-001";
  }
  return token;
}

export function buildPdfOverlayPreviewContext(
  fields: PdfOverlayFieldLike[] = [],
  layout?: PdfLayoutLike,
): Record<string, any> {
  const headerHints = Array.isArray(layout?.headerLines) ? layout.headerLines : [];
  const signatureHints = Array.isArray(layout?.signatureLabels) ? layout.signatureLabels : [];

  const context: Record<string, any> = {
    reportNo: "BC-001",
    reportDate: new Date().toLocaleDateString("vi-VN"),
    clientName: "Công ty ABC",
    customerName: "Công ty ABC",
    companyName: "Công ty ABC",
    companyAddress: "Số 123 đường Nguyễn Văn Linh",
    contactName: "Nguyễn Văn An",
    contactPhone: "0909 123 456",
    tongCong: "1.250.000",
    tong_cong: "1.250.000",
    totalAmount: "1.250.000",
    ghi_chu: "Ghi chú mẫu",
    notes: "Ghi chú mẫu",
    title: layout?.docTitle || "BÁO CÁO",
    subtitle: layout?.docSubtitle || "",
  };

  for (const field of fields) {
    const name = String(field?.f_name || "").trim();
    if (!name) continue;
    context[name] = fallbackValueForToken(name, fields);
    context[normalizeTokenName(name)] = context[name];
  }

  for (let index = 0; index < Math.min(headerHints.length, 6); index += 1) {
    const token = `hdr_${index + 1}`;
    context[token] = headerHints[index] || `Thông tin ${index + 1}`;
  }

  for (let index = 0; index < Math.min(signatureHints.length, 6); index += 1) {
    const token = `sig_${index + 1}`;
    context[token] = signatureHints[index] || `Chữ ký ${index + 1}`;
  }

  return context;
}

export function resolvePdfOverlayText(text: string | undefined, context: Record<string, any> = {}): string {
  const raw = String(text || "");
  if (!raw) return "";
  return raw.replace(/\{([^{}]+)\}/g, (_match, token) => {
    const key = String(token || "").trim();
    if (!key) return "";
    const direct = context[key];
    if (direct != null) return toDisplayText(direct);
    const nestedValue = resolveObjectPath(context, key);
    if (nestedValue != null) return toDisplayText(nestedValue);
    const normalizedKey = normalizeTokenName(key);
    if (normalizedKey && context[normalizedKey] != null) return toDisplayText(context[normalizedKey]);
    return `{${key}}`;
  });
}

export function buildPdfReportDesignSpec(
  layout: PdfLayoutLike | undefined,
  overlayItems: PdfOverlayPlanItemLike[] = [],
  fields: PdfOverlayFieldLike[] = [],
  sampleLines: string[] = [],
): PdfReportDesignSpec {
  const context = buildPdfOverlayPreviewContext(fields, layout);
  const title = String(layout?.docTitle || "BÁO CÁO").trim() || "BÁO CÁO";
  const candidateLines = collectDesignCandidateLines(layout, overlayItems, sampleLines);
  const allLines = [...(layout?.orderedLines || []), ...sampleLines, ...candidateLines];
  const allText = [title, ...allLines].join("\n").toLowerCase();
  const hasTable = Array.isArray(layout?.tableColumnHeaders) && (layout?.tableColumnHeaders || []).length >= 4;
  const hasQuoteKeyword = /bảng báo giá|bao gia|quotation|xác nhận đơn hàng|don hang/.test(allText);
  const hasMoneyKeyword = /đơn giá|thành tiền|vat|tong gia tri|tong cong/.test(allText);
  const hasGroupKeyword = /cộng nhóm|nhóm|group/i.test(allText);
  const isQuotationLike = Boolean(hasTable && hasQuoteKeyword && hasMoneyKeyword && hasGroupKeyword);

  const headerSource = (Array.isArray(layout?.headerLines) && layout.headerLines.length > 0
    ? layout.headerLines
    : candidateLines.slice(0, 6));
  const header = headerSource
    .slice(0, 8)
    .map((line, index) => {
      const parsed = splitLabelValueLine(String(line || ""));
      const label = parsed.label || `Thông tin ${index + 1}`;
      const token = `hdr_${index + 1}`;
      const sampleValue = parsed.value || resolvePdfOverlayText(`{${token}}`, context);
      return {
        label,
        token,
        sampleValue: sanitizeDisplayLine(sampleValue),
      };
    });

  const headerKeySet = new Set(
    header
      .map((item) => normalizeText(`${item.label} ${item.sampleValue}`))
      .filter(Boolean),
  );
  const sectionCandidates = candidateLines.filter((line) => {
    const key = normalizeText(line);
    if (!key) return false;
    return !headerKeySet.has(key) && key !== normalizeText(title);
  });

  const sections = (Array.isArray(layout?.sections) && layout.sections.length > 0
    ? layout.sections
    : [{ title: "Nội dung mẫu", lines: sectionCandidates.slice(0, 8) }])
    .slice(0, 4)
    .map((section, index) => ({
      id: `section_${index + 1}`,
      title: String(section?.title || `Phần ${index + 1}`).trim() || `Phần ${index + 1}`,
      lines: Array.isArray(section?.lines)
        ? section.lines.map((line) => resolvePdfOverlayText(line, context)).filter(Boolean)
        : (index === 0 ? sectionCandidates.slice(0, 6).map((line) => resolvePdfOverlayText(line, context)).filter(Boolean) : []),
    }));

  const tableHeaders = (Array.isArray(layout?.tableColumnHeaders) ? layout.tableColumnHeaders : [])
    .map((item: string) => sanitizeDisplayLine(String(item || "")))
    .filter(Boolean)
    .slice(0, 10);
  const table = tableHeaders.length > 0
    ? {
      headers: tableHeaders,
      fields: tableHeaders.map((header: string, index: number) => {
        if (index === 0) return "__index";
        const normalizedHeader = normalizeTokenName(header);
        const matched = fields.find((field) => {
          const candidates = [field.f_name, field.f_header, field.f_header_en, field.f_header_zh]
            .filter(Boolean)
            .map((value) => normalizeTokenName(String(value || "")));
          return candidates.includes(normalizedHeader) || candidates.some((value) => value && normalizedHeader.includes(value));
        });
        return String(matched?.f_name || `col_${index + 1}`).trim();
      }),
      widths: tableHeaders.map((_header: string, index: number) => (index === 0 ? 8 : Math.max(14, Math.round(182 / Math.max(tableHeaders.length - 1, 1))))),
      grouped: isQuotationLike,
    }
    : undefined;

  const totals = [
    { label: "Tổng cộng", token: "tong_cong", value: resolvePdfOverlayText("{tong_cong}", context) },
    { label: "Ghi chú", token: "ghi_chu", value: resolvePdfOverlayText("{ghi_chu}", context) },
  ].filter((item) => item.value);

  const signatures = (Array.isArray(layout?.signatureLabels) ? layout.signatureLabels : [])
    .slice(0, 6)
    .map((label, index) => ({
      label: String(label || "").trim() || `Chữ ký ${index + 1}`,
      token: `sig_${index + 1}`,
      value: resolvePdfOverlayText(label, context),
    }));

  const footer = (Array.isArray(layout?.orderedLines) ? layout.orderedLines : candidateLines)
    .slice(0, 6)
    .map((line) => resolvePdfOverlayText(line, context))
    .filter(Boolean);

  const overlaySummary = (Array.isArray(overlayItems) ? overlayItems : [])
    .slice(0, 16)
    .map((item) => ({
      page: Number(item?.page || 1),
      x: Number(item?.x || 0),
      y: Number(item?.y || 0),
      text: resolvePdfOverlayText(item?.text, context),
    }))
    .filter((item) => item.text);

  const overlayItemsFull = (Array.isArray(overlayItems) ? overlayItems : [])
    .map((item) => ({
      page: Number(item?.page || 1),
      x: Number(item?.x || 0),
      y: Number(item?.y || 0),
      width: Number(item?.width || 0) || undefined,
      align: (["L", "C", "R"].includes(String(item?.align || "").toUpperCase())
        ? String(item?.align || "").toUpperCase()
        : "L") as "L" | "C" | "R",
      fontSize: Number(item?.fontSize || 11),
      fontName: String(item?.fontName || "Arial").trim() || "Arial",
      color: String(item?.color || "#000000").trim() || "#000000",
      bold: Boolean(item?.bold),
      italic: Boolean(item?.italic),
      text: sanitizeDisplayLine(String(item?.text || "")),
    }))
    .filter((item) => item.text);

  const companyInfo = deriveCompanyInfo([...(layout?.headerLines || []), ...(layout?.orderedLines || []), ...sampleLines]);
  const introLine = pickSectionLines(allLines, ["cam on", "quy khach", "noi dung nhu sau"], 1)[0];
  const notes = pickSectionLines(allLines, ["ghi chu", "dung sai", "bao gom", "chua bao gom", "vat"], 8);
  const paymentTerms = pickSectionLines(allLines, ["thanh toan", "lan 1", "lan 2", "dat coc", "chuyen khoan"], 6);

  return {
    title,
    layoutKind: isQuotationLike ? "quotation-grouped-table" : "dynamic-pdf-template",
    pageWidth: Number(layout?.pageWidth || 0) || undefined,
    pageHeight: Number(layout?.pageHeight || 0) || undefined,
    coordinateUnit: "pt",
    coordinateOrigin: "bottom-left",
    company: isQuotationLike ? companyInfo : undefined,
    intro: isQuotationLike ? introLine : undefined,
    header,
    table,
    sections,
    totals,
    signatures,
    notes: isQuotationLike ? notes : undefined,
    paymentTerms: isQuotationLike ? paymentTerms : undefined,
    footer,
    overlaySummary,
    overlayItems: overlayItemsFull,
  };
}
