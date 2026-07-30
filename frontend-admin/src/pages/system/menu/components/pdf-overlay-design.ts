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
  quotation?: {
    recipientLabel?: string;
    recipientToken?: string;
    recipientSample?: string;
    addressLabel?: string;
    addressToken?: string;
    addressSample?: string;
    contactLabel?: string;
    contactToken?: string;
    contactSample?: string;
    quotationNoLabel?: string;
    quotationNoToken?: string;
    quotationNoSample?: string;
    dateLabel?: string;
    dateToken?: string;
    dateSample?: string;
    validUntilLabel?: string;
    validUntilToken?: string;
    validUntilSample?: string;
    salesLabel?: string;
    salesToken?: string;
    salesSample?: string;
    amountWordsLabel?: string;
    amountWordsToken?: string;
    noteTitle?: string;
    paymentTitle?: string;
    bankTitle?: string;
    buyerLabel?: string;
    sellerLabel?: string;
  };
  intro?: string;
  header: Array<{ label: string; token: string; sampleValue: string }>;
  table?: { headers: string[]; fields: string[]; widths: number[]; grouped?: boolean };
  sections: Array<{ id: string; title: string; lines: string[] }>;
  totals: Array<{ label: string; token: string; value: string }>;
  signatures: Array<{ label: string; token: string; value: string }>;
  notes?: string[];
  paymentTerms?: string[];
  footer: string[];
  sampleData?: Record<string, any>;
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

function findLineByHints(lines: string[], hints: string[]): string {
  for (const raw of lines) {
    const line = sanitizeDisplayLine(raw);
    if (!line) continue;
    const lower = normalizeText(line);
    if (hints.some((hint) => lower.includes(normalizeText(hint)))) {
      return line;
    }
  }
  return "";
}

function extractInlineLabeledValue(line: string, label: string): string {
  const text = sanitizeDisplayLine(line);
  if (!text) return "";
  const normalizedLabel = normalizeText(label);
  const parts = text.split(/\s{2,}|\t+/).map((part) => sanitizeDisplayLine(part)).filter(Boolean);
  const candidates = parts.length > 0 ? parts : [text];
  for (const part of candidates) {
    const lower = normalizeText(part);
    if (!lower.includes(normalizedLabel)) continue;
    const idx = part.indexOf(":");
    if (idx >= 0) {
      const value = sanitizeDisplayLine(part.slice(idx + 1));
      if (value) return value;
    }
    const labelIndex = lower.indexOf(normalizedLabel);
    if (labelIndex >= 0) {
      const raw = sanitizeDisplayLine(part.slice(labelIndex + label.length));
      if (raw) return raw.replace(/^[:\-\s]+/, "").trim();
    }
  }
  return "";
}

function buildQuotationSemanticShape(lines: string[], signatureLabels: string[] = []) {
  const recipientLine = findLineByHints(lines, ["kính gửi", "kinh gui"]);
  const addressLine = findLineByHints(lines, ["địa chỉ", "dia chi", "address"]);
  const contactLine = findLineByHints(lines, ["người liên hệ", "nguoi lien he", "contact"]);
  const salesLine = findLineByHints(lines, ["nvkd", "sales", "nhân viên kinh doanh", "nhan vien kinh doanh"]);
  const quotationNoLine = findLineByHints(lines, ["số:", "so:", "quotation no"]);
  const dateLine = findLineByHints(lines, ["ngày:", "ngay:", "date"]);
  const validUntilLine = findLineByHints(lines, ["hiệu lực đến", "hieu luc den", "valid until"]);
  const amountWordsLine = findLineByHints(lines, ["bằng chữ", "bang chu"]);
  const bankLine = findLineByHints(lines, ["tài khoản", "tai khoan", "ngân hàng", "ngan hang", "số tk", "so tk"]);
  const buyerLabel = signatureLabels.find((line) => /bên mua|ben mua|khách hàng|khach hang/i.test(line)) || "ĐẠI DIỆN BÊN MUA";
  const sellerLabel = signatureLabels.find((line) => /bên bán|ben ban/i.test(line)) || "ĐẠI DIỆN BÊN BÁN";

  return {
    recipientLabel: "Kính gửi",
    recipientToken: "client.company",
    recipientSample: extractInlineLabeledValue(recipientLine, "Kính gửi") || recipientLine,
    addressLabel: "Địa chỉ",
    addressToken: "client.address",
    addressSample: extractInlineLabeledValue(addressLine, "Địa chỉ") || addressLine,
    contactLabel: "Người liên hệ",
    contactToken: "client.contact",
    contactSample: extractInlineLabeledValue(contactLine, "Người liên hệ") || contactLine,
    quotationNoLabel: "Số",
    quotationNoToken: "quotation_no",
    quotationNoSample: extractInlineLabeledValue(quotationNoLine, "Số") || extractInlineLabeledValue(quotationNoLine, "So") || "",
    dateLabel: "Ngày",
    dateToken: "date",
    dateSample: extractInlineLabeledValue(dateLine, "Ngày") || extractInlineLabeledValue(dateLine, "Ngay") || "",
    validUntilLabel: "Hiệu lực đến",
    validUntilToken: "valid_until",
    validUntilSample: extractInlineLabeledValue(validUntilLine, "Hiệu lực đến") || extractInlineLabeledValue(validUntilLine, "Hieu luc den") || "",
    salesLabel: "NVKD",
    salesToken: "sales.name",
    salesSample: extractInlineLabeledValue(salesLine, "NVKD") || salesLine,
    amountWordsLabel: "Bằng chữ",
    amountWordsToken: "amount_words",
    noteTitle: "Ghi chú",
    paymentTitle: "Phương thức thanh toán",
    bankTitle: bankLine ? "Thông tin tài khoản nhận đơn đặt hàng" : "Thông tin thanh toán",
    buyerLabel,
    sellerLabel,
  };
}

function buildQuotationSemanticHeader(quotation: NonNullable<PdfReportDesignSpec["quotation"]>): Array<{ label: string; token: string; sampleValue: string }> {
  const out = [
    { label: quotation.recipientLabel || "Kính gửi", token: quotation.recipientToken || "client.company", sampleValue: quotation.recipientSample || "" },
    { label: quotation.addressLabel || "Địa chỉ", token: quotation.addressToken || "client.address", sampleValue: quotation.addressSample || "" },
    { label: quotation.contactLabel || "Người liên hệ", token: quotation.contactToken || "client.contact", sampleValue: quotation.contactSample || "" },
    { label: quotation.quotationNoLabel || "Số", token: quotation.quotationNoToken || "quotation_no", sampleValue: quotation.quotationNoSample || "" },
    { label: quotation.dateLabel || "Ngày", token: quotation.dateToken || "date", sampleValue: quotation.dateSample || "" },
    { label: quotation.validUntilLabel || "Hiệu lực đến", token: quotation.validUntilToken || "valid_until", sampleValue: quotation.validUntilSample || "" },
    { label: quotation.salesLabel || "NVKD", token: quotation.salesToken || "sales.name", sampleValue: quotation.salesSample || "" },
  ];
  return out.filter((item) => item.sampleValue || item.token);
}

function inferQuotationTableHeaders(lines: string[]): string[] {
  const joined = normalizeText((lines || []).join(" "));
  const defaultHeaders = [
    "TT",
    "Tên sản phẩm/Quy cách",
    "Đơn vị",
    "Chiều rộng",
    "Chiều dài",
    "Số tấm",
    "Khối lượng",
    "Đơn giá (VNĐ)",
    "Thành tiền (VNĐ)",
  ];
  const hasCoreHints = [
    "tt",
    "don vi",
    "chieu rong",
    "chieu dai",
    "so tam",
    "khoi luong",
    "don gia",
    "thanh tien",
  ].filter((hint) => joined.includes(hint)).length;
  if (hasCoreHints >= 4) return defaultHeaders;
  return [];
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
  designSpec?: Partial<PdfReportDesignSpec> | null,
): Record<string, any> {
  const headerHints = Array.isArray(layout?.headerLines) ? layout.headerLines : [];
  const signatureHints = Array.isArray(layout?.signatureLabels) ? layout.signatureLabels : [];
  const sampleData = designSpec && typeof designSpec === "object" && designSpec.sampleData && typeof designSpec.sampleData === "object"
    ? designSpec.sampleData
    : {};
  const quotation = designSpec && typeof designSpec === "object" && designSpec.quotation && typeof designSpec.quotation === "object"
    ? designSpec.quotation
    : undefined;
  const company = designSpec && typeof designSpec === "object" && designSpec.company && typeof designSpec.company === "object"
    ? designSpec.company
    : undefined;

  const context: Record<string, any> = {
    reportNo: "BC-001",
    reportDate: new Date().toLocaleDateString("vi-VN"),
    clientName: "Công ty ABC",
    customerName: "Công ty ABC",
    companyName: "Công ty ABC",
    companyAddress: "Số 123 đường Nguyễn Văn Linh",
    contactName: "Nguyễn Văn An",
    contactPhone: "0909 123 456",
    quotation_no: "090626.01",
    date: new Date().toLocaleDateString("vi-VN"),
    valid_until: new Date(Date.now() + 5 * 86400000).toLocaleDateString("vi-VN"),
    amount_words: "Một trăm mười bảy triệu, không trăm ba mươi tám nghìn, một trăm bảy mươi đồng ./.",
    bank_info: "Tên TK: Công ty TNHH Công Nghệ Công Nghiệp Phú Sơn. Số TK: 7999989399 mở tại MB Bank - CN Hai Bà Trưng",
    tongCong: "1.250.000",
    tong_cong: "1.250.000",
    totalAmount: "1.250.000",
    ghi_chu: "Ghi chú mẫu",
    notes: "Ghi chú mẫu",
    title: layout?.docTitle || "BÁO CÁO",
    subtitle: layout?.docSubtitle || "",
    client: {
      company: "Công ty ABC",
      address: "Số 123 đường Nguyễn Văn Linh",
      contact: "Nguyễn Văn An - 0909 123 456",
    },
    sales: {
      name: "Mr Long - 0978349917",
    },
    signature: {
      buyer_label: "ĐẠI DIỆN BÊN MUA",
      seller_label: "ĐẠI DIỆN BÊN BÁN",
    },
  };

  Object.assign(context, sampleData || {});

  if (company) {
    context.company = {
      ...(context.company && typeof context.company === "object" ? context.company : {}),
      ...company,
    };
  }
  if (quotation) {
    if (quotation.recipientSample) {
      context.client = {
        ...(context.client && typeof context.client === "object" ? context.client : {}),
        company: context.client?.company ?? quotation.recipientSample,
      };
      context.clientName = context.clientName || quotation.recipientSample;
      context.customerName = context.customerName || quotation.recipientSample;
    }
    if (quotation.addressSample) {
      context.client = {
        ...(context.client && typeof context.client === "object" ? context.client : {}),
        address: context.client?.address ?? quotation.addressSample,
      };
      context.companyAddress = context.companyAddress || quotation.addressSample;
    }
    if (quotation.contactSample) {
      context.client = {
        ...(context.client && typeof context.client === "object" ? context.client : {}),
        contact: context.client?.contact ?? quotation.contactSample,
      };
      context.contactName = context.contactName || quotation.contactSample;
    }
    if (quotation.quotationNoSample) context.quotation_no = context.quotation_no || quotation.quotationNoSample;
    if (quotation.dateSample) context.date = context.date || quotation.dateSample;
    if (quotation.validUntilSample) context.valid_until = context.valid_until || quotation.validUntilSample;
    if (quotation.salesSample) {
      context.sales = {
        ...(context.sales && typeof context.sales === "object" ? context.sales : {}),
        name: context.sales?.name ?? quotation.salesSample,
      };
    }
  }

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

function tokenizeQuotationOverlayText(text: string): string {
  const line = sanitizeDisplayLine(text);
  if (!line) return "";
  const normalized = normalizeText(line);

  if (normalized.startsWith("kinh gui")) {
    return "Kính gửi: {client.company}";
  }
  if (normalized.startsWith("dia chi") && normalized.includes("hieu luc den")) {
    return "Địa chỉ: {client.address} Hiệu lực đến: {valid_until}";
  }
  if (normalized.startsWith("dia chi")) {
    return "Địa chỉ: {client.address}";
  }
  if ((normalized.includes("so:") || normalized.includes(" so ")) && normalized.includes("ngay")) {
    return "Số:{quotation_no} Ngày: {date}";
  }
  if (normalized.startsWith("nguoi lien he") && normalized.includes("nvkd")) {
    return "Người liên hệ: {client.contact} NVKD: {sales.name}";
  }
  if (normalized.startsWith("nguoi lien he")) {
    return "Người liên hệ: {client.contact}";
  }
  if (normalized.startsWith("nvkd")) {
    return "NVKD: {sales.name}";
  }
  if (normalized.startsWith("bang chu")) {
    return "Bằng chữ: {amount_words}";
  }
  return line;
}

export function buildPdfReportDesignSpec(
  layout: PdfLayoutLike | undefined,
  overlayItems: PdfOverlayPlanItemLike[] = [],
  fields: PdfOverlayFieldLike[] = [],
  sampleLines: string[] = [],
  sampleData?: Record<string, any>,
): PdfReportDesignSpec {
  const context = buildPdfOverlayPreviewContext(fields, layout, sampleData ? { sampleData } : undefined);
  const title = String(layout?.docTitle || "BÁO CÁO").trim() || "BÁO CÁO";
  const candidateLines = collectDesignCandidateLines(layout, overlayItems, sampleLines);
  const allLines = [...(layout?.orderedLines || []), ...sampleLines, ...candidateLines];
  const allText = [title, ...allLines].join("\n").toLowerCase();
  const inferredQuoteHeaders = inferQuotationTableHeaders(allLines);
  const layoutHeaders = (Array.isArray(layout?.tableColumnHeaders) ? layout.tableColumnHeaders : [])
    .map((item) => sanitizeDisplayLine(String(item || "")))
    .filter(Boolean)
    .slice(0, 10);
  const effectiveTableHeaders = layoutHeaders.length > 0 ? layoutHeaders : inferredQuoteHeaders;
  const hasTable = effectiveTableHeaders.length >= 4;
  const hasQuoteKeyword = /bảng báo giá|bao gia|quotation|xác nhận đơn hàng|don hang/.test(allText);
  const hasMoneyKeyword = /đơn giá|thành tiền|vat|tong gia tri|tong cong/.test(allText);
  const hasGroupKeyword = /cộng nhóm|nhóm|group/i.test(allText);
  const hasQuotationHeaderSignals = /kính gửi|kinh gui|hiệu lực đến|hieu luc den|nvkd|nguoi lien he/.test(allText);
  const isQuotationLike = Boolean(
    hasQuoteKeyword
    && hasMoneyKeyword
    && (hasGroupKeyword || hasQuotationHeaderSignals || hasTable),
  );
  const quotation = isQuotationLike
    ? buildQuotationSemanticShape(allLines, Array.isArray(layout?.signatureLabels) ? layout.signatureLabels : [])
    : undefined;

  const headerSource = (Array.isArray(layout?.headerLines) && layout.headerLines.length > 0
    ? layout.headerLines
    : candidateLines.slice(0, 6));
  const header = quotation
    ? buildQuotationSemanticHeader(quotation)
    : headerSource
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

  const tableHeaders = effectiveTableHeaders;
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
      rawText: sanitizeDisplayLine(String(item?.text || "")),
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
      text: "",
    }))
    .map((item) => {
      const text = isQuotationLike
        ? tokenizeQuotationOverlayText(item.rawText)
        : item.rawText;
      return {
        ...item,
        text: sanitizeDisplayLine(text || item.rawText),
      };
    })
    .filter((item) => item.text)
    .map(({ rawText: _rawText, ...item }) => item);

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
    quotation,
    intro: isQuotationLike ? introLine : undefined,
    header,
    table,
    sections,
    totals,
    signatures,
    notes: isQuotationLike ? notes : undefined,
    paymentTerms: isQuotationLike ? paymentTerms : undefined,
    footer,
    sampleData: sampleData && typeof sampleData === "object" ? sampleData : undefined,
    overlaySummary,
    overlayItems: overlayItemsFull,
  };
}
