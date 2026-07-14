export type PdfOverlayPlanItemLike = {
  page?: number;
  x?: number;
  y?: number;
  fontSize?: number;
  fontName?: string;
  color?: string;
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
  signatureLabels?: string[];
  orderedLines?: string[];
  sections?: Array<{ title?: string; lines?: string[] }>;
  showPrice?: boolean;
  pageWidth?: number;
  pageHeight?: number;
};

export type PdfReportDesignSpec = {
  title: string;
  layoutKind: "pdf-overlay";
  header: Array<{ label: string; token: string; sampleValue: string }>;
  sections: Array<{ id: string; title: string; lines: string[] }>;
  totals: Array<{ label: string; token: string; value: string }>;
  signatures: Array<{ label: string; token: string; value: string }>;
  footer: string[];
  overlaySummary: Array<{ page: number; x: number; y: number; text: string }>;
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

  const headerSource = (Array.isArray(layout?.headerLines) && layout.headerLines.length > 0
    ? layout.headerLines
    : candidateLines.slice(0, 6));
  const header = headerSource
    .slice(0, 8)
    .map((line, index) => ({
      label: sanitizeDisplayLine(String(line || "")) || `Thông tin ${index + 1}`,
      token: `hdr_${index + 1}`,
      sampleValue: resolvePdfOverlayText(line, context),
    }));

  const sections = (Array.isArray(layout?.sections) && layout.sections.length > 0
    ? layout.sections
    : [{ title: "Nội dung mẫu", lines: candidateLines.slice(0, 8) }])
    .slice(0, 4)
    .map((section, index) => ({
      id: `section_${index + 1}`,
      title: String(section?.title || `Phần ${index + 1}`).trim() || `Phần ${index + 1}`,
      lines: Array.isArray(section?.lines)
        ? section.lines.map((line) => resolvePdfOverlayText(line, context)).filter(Boolean)
        : (index === 0 ? candidateLines.slice(0, 6).map((line) => resolvePdfOverlayText(line, context)).filter(Boolean) : []),
    }));

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

  return {
    title,
    layoutKind: "pdf-overlay",
    header,
    sections,
    totals,
    signatures,
    footer,
    overlaySummary,
  };
}
