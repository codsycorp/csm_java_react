import PizZip from "pizzip";

export interface DocxTemplateBlueprint {
  title: string;
  subtitle?: string;
  headerLines: string[];
  tableHeaders: string[];
  tableRowPlaceholders: string[];
  signatureLabels: string[];
  noteLines: string[];
}

function xmlEscape(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paragraph(text: string, opts?: { bold?: boolean; sz?: number; center?: boolean }): string {
  const runs = `
    <w:r>
      ${opts?.bold ? "<w:rPr><w:b/></w:rPr>" : ""}
      <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
    </w:r>
  `;
  return `
    <w:p>
      ${opts?.center ? "<w:pPr><w:jc w:val=\"center\"/></w:pPr>" : ""}
      ${opts?.sz ? `<w:r><w:rPr><w:sz w:val="${opts.sz}"/></w:rPr><w:t></w:t></w:r>` : ""}
      ${runs}
    </w:p>
  `;
}

function tableCell(text: string, center = false, bold = false): string {
  return `
    <w:tc>
      <w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>
      <w:p>
        ${center ? "<w:pPr><w:jc w:val=\"center\"/></w:pPr>" : ""}
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

function buildTableXml(blueprint: DocxTemplateBlueprint): string {
  if (!blueprint.tableHeaders.length) return "";
  const headerRow = tableRow(blueprint.tableHeaders.map((h) => tableCell(h, true, true)));
  const rowCells = blueprint.tableHeaders.map((_, idx) => {
    const token = blueprint.tableRowPlaceholders[idx] || "";
    return tableCell(token, idx === 0);
  });
  const valueRow = tableRow(rowCells);
  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="0" w:type="auto"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:left w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:bottom w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:right w:val="single" w:sz="8" w:space="0" w:color="auto"/>
          <w:insideH w:val="single" w:sz="6" w:space="0" w:color="auto"/>
          <w:insideV w:val="single" w:sz="6" w:space="0" w:color="auto"/>
        </w:tblBorders>
      </w:tblPr>
      ${headerRow}
      ${valueRow}
    </w:tbl>
  `;
}

export function createDocxTemplateBuffer(blueprint: DocxTemplateBlueprint): ArrayBuffer {
  const zip = new PizZip();
  const now = new Date().toISOString();

  const documentBody = [
    paragraph(blueprint.title || "TEMPLATE", { bold: true, sz: 32, center: true }),
    blueprint.subtitle ? paragraph(blueprint.subtitle, { center: true }) : "",
    paragraph(""),
    ...blueprint.headerLines.map((l) => paragraph(l)),
    paragraph(""),
    buildTableXml(blueprint),
    paragraph(""),
    ...blueprint.noteLines.map((l) => paragraph(l)),
    paragraph(""),
    ...blueprint.signatureLabels.map((l) => paragraph(l, { bold: true })),
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
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>
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
    <w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`);
  word?.file("settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
  word?.file("webSettings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:webSettings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>`);
  word?.file("fontTable.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:font w:name="Times New Roman"/>
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
