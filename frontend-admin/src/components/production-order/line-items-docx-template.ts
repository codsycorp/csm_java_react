import PizZip from "pizzip";

export interface DocxTemplateBlueprint {
  title: string;
  subtitle?: string;
  headerLines: string[];
  tableHeaders: string[];
  tableRowPlaceholders: string[];
  signatureLabels: string[];
  noteLines: string[];
  pageSizeTwip?: { width: number; height: number };
  pageMarginsTwip?: { top: number; right: number; bottom: number; left: number };
  baseFontName?: string;
  baseFontSizeHalfPt?: number;
  tableColWidthsTwip?: number[];
  titleAlign?: "left" | "center" | "right";
  headerAlign?: "left" | "center" | "right";
}

function xmlEscape(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(text: string, opts?: { bold?: boolean; sz?: number; align?: "left" | "center" | "right"; fontName?: string }): string {
  const align = opts?.align || "left";
  const jc = align === "center" ? "center" : (align === "right" ? "right" : "left");
  const runPrParts: string[] = [];
  if (opts?.bold) runPrParts.push("<w:b/>");
  if (opts?.sz) runPrParts.push(`<w:sz w:val="${opts.sz}"/>`);
  if (opts?.fontName) {
    runPrParts.push(`<w:rFonts w:ascii="${xmlEscape(opts.fontName)}" w:hAnsi="${xmlEscape(opts.fontName)}" w:eastAsia="${xmlEscape(opts.fontName)}"/>`);
  }
  const runPr = runPrParts.length ? `<w:rPr>${runPrParts.join("")}</w:rPr>` : "";
  return `
    <w:p>
      <w:pPr>
        <w:jc w:val="${jc}"/>
        <w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        ${runPr}
        <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
      </w:r>
    </w:p>
  `;
}

function tableCell(text: string, widthTwip: number, center = false, bold = false): string {
  return `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${widthTwip}" w:type="dxa"/>
      </w:tcPr>
      <w:p>
        <w:pPr>
          ${center ? "<w:jc w:val=\"center\"/>" : "<w:jc w:val=\"left\"/>"}
          <w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/>
        </w:pPr>
        <w:r>
          ${bold ? "<w:rPr><w:b/></w:rPr>" : ""}
          <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
        </w:r>
      </w:p>
    </w:tc>
  `;
}

function tableRow(cells: string[]): string {
  return `<w:tr>${cells.join("")}</w:tr>`;
}

function deriveColumnWidths(blueprint: DocxTemplateBlueprint, contentWidthTwip: number): number[] {
  const count = Math.max(1, blueprint.tableHeaders.length);
  const custom = Array.isArray(blueprint.tableColWidthsTwip)
    ? blueprint.tableColWidthsTwip.filter((w) => Number.isFinite(w) && w > 0)
    : [];
  if (custom.length >= count) {
    const trimmed = custom.slice(0, count);
    const sum = trimmed.reduce((acc, v) => acc + v, 0);
    if (sum > 0) {
      const scaled = trimmed.map((v) => Math.max(360, Math.floor((v / sum) * contentWidthTwip)));
      const fixedSum = scaled.reduce((acc, v) => acc + v, 0);
      const delta = contentWidthTwip - fixedSum;
      scaled[scaled.length - 1] += delta;
      return scaled;
    }
  }

  const weights = blueprint.tableHeaders.map((h, idx) => {
    const labelLen = String(h || "").trim().length;
    if (idx === 0) return 1.0;
    return Math.max(1.2, Math.min(4.8, labelLen / 4));
  });
  const weightSum = weights.reduce((acc, v) => acc + v, 0) || count;
  const widths = weights.map((w) => Math.max(360, Math.floor((w / weightSum) * contentWidthTwip)));
  const fixedSum = widths.reduce((acc, v) => acc + v, 0);
  const delta = contentWidthTwip - fixedSum;
  widths[widths.length - 1] += delta;
  return widths;
}

function buildTableXml(blueprint: DocxTemplateBlueprint, contentWidthTwip: number): string {
  if (!blueprint.tableHeaders.length) return "";
  const colWidths = deriveColumnWidths(blueprint, contentWidthTwip);
  const headerRow = tableRow(blueprint.tableHeaders.map((h, idx) => tableCell(h, colWidths[idx], true, true)));
  const rowCells = blueprint.tableHeaders.map((_, idx) => {
    const token = blueprint.tableRowPlaceholders[idx] || "";
    return tableCell(token, colWidths[idx], idx === 0);
  });
  const valueRow = tableRow(rowCells);
  const gridXml = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="${contentWidthTwip}" w:type="dxa"/>
        <w:tblLayout w:type="fixed"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${gridXml}</w:tblGrid>
      ${headerRow}
      ${valueRow}
    </w:tbl>
  `;
}

export function createDocxTemplateBuffer(blueprint: DocxTemplateBlueprint): ArrayBuffer {
  const zip = new PizZip();
  const now = new Date().toISOString();
  const pageSize = blueprint.pageSizeTwip || { width: 11906, height: 16838 };
  const pageMargins = blueprint.pageMarginsTwip || { top: 1134, right: 1134, bottom: 1134, left: 1134 };
  const contentWidthTwip = Math.max(1440, pageSize.width - pageMargins.left - pageMargins.right);
  const baseFontName = blueprint.baseFontName || "Times New Roman";
  const baseFontSizeHalfPt = Number(blueprint.baseFontSizeHalfPt || 24);

  const documentBody = [
    paragraph(blueprint.title || "TEMPLATE", {
      bold: true,
      sz: 32,
      align: blueprint.titleAlign || "center",
      fontName: baseFontName,
    }),
    blueprint.subtitle
      ? paragraph(blueprint.subtitle, {
        align: blueprint.titleAlign || "center",
        fontName: baseFontName,
      })
      : "",
    paragraph(""),
    ...blueprint.headerLines.map((l) => paragraph(l, { align: blueprint.headerAlign || "left", fontName: baseFontName })),
    paragraph(""),
    buildTableXml(blueprint, contentWidthTwip),
    paragraph(""),
    ...blueprint.noteLines.map((l) => paragraph(l, { fontName: baseFontName })),
    paragraph(""),
    ...blueprint.signatureLabels.map((l) => paragraph(l, { bold: true, fontName: baseFontName })),
  ].join("\n");

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/word/webSettings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  zip.folder("_rels")?.file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  zip.folder("docProps")?.file("core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(blueprint.title || "DOCX Template")}</dc:title>
  <dc:creator>CSM Local AI</dc:creator>
  <cp:lastModifiedBy>CSM Local AI</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
  zip.folder("docProps")?.file("app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CSM</Application>
</Properties>`);

  const word = zip.folder("word");
  word?.file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
  <w:body>
    ${documentBody}
    <w:sectPr>
      <w:pgSz w:w="${pageSize.width}" w:h="${pageSize.height}"/>
      <w:pgMar w:top="${pageMargins.top}" w:right="${pageMargins.right}" w:bottom="${pageMargins.bottom}" w:left="${pageMargins.left}" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`);

  word?.folder("_rels")?.file("document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/webSettings" Target="webSettings.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
</Relationships>`);

  word?.file("styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:qFormat/>
    <w:rPr><w:rFonts w:ascii="${xmlEscape(baseFontName)}" w:hAnsi="${xmlEscape(baseFontName)}" w:eastAsia="${xmlEscape(baseFontName)}"/><w:sz w:val="${baseFontSizeHalfPt}"/></w:rPr>
  </w:style>
</w:styles>`);
  word?.file("settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
  word?.file("webSettings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
  word?.file("fontTable.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="${xmlEscape(baseFontName)}"/>
</w:fonts>`);

  return zip.generate({ type: "arraybuffer", compression: "DEFLATE" }) as ArrayBuffer;
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}
