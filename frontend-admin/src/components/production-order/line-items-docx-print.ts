import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule from "docxtemplater-image-module-free";

function isDataUrl(url: string): boolean {
  return typeof url === "string" && url.startsWith("data:");
}

type FetchDocxResult = {
  buffer: ArrayBuffer;
  contentType: string;
  status: number;
  url: string;
};

function getBackendOriginHint(): string {
  const envBase = String((import.meta as any)?.env?.VITE_API_BASE_URL || "").trim();
  if (envBase) {
    try {
      return new URL(envBase).origin;
    } catch {
      // ignore invalid env
    }
  }
  return "";
}

function buildTemplateCandidates(src: string, appIdHint?: string): string[] {
  const out: string[] = [];
  const push = (u: string) => {
    if (!u) return;
    if (!out.includes(u)) out.push(u);
  };

  push(src);
  const plainSrc = src.split("?")[0];
  const isReportsDocx = /^\/reports\/.+\.docx$/i.test(plainSrc);
  const isAppImagesDocx = /^\/app_images\/.+\.docx$/i.test(plainSrc);

  if (isReportsDocx) {
    const baseName = plainSrc.split("/").pop() || "";
    if (baseName) {
      if (appIdHint) push(`/app_images/${appIdHint}/${baseName}`);
      push(`/app_images/uploads/${baseName}`);
    }
  }

  const backendOrigin = getBackendOriginHint();
  if (backendOrigin && /^\//.test(plainSrc) && (isReportsDocx || isAppImagesDocx)) {
    push(`${backendOrigin}${plainSrc}`);
    if (isReportsDocx) {
      const baseName = plainSrc.split("/").pop() || "";
      if (baseName) {
        if (appIdHint) push(`${backendOrigin}/app_images/${appIdHint}/${baseName}`);
        push(`${backendOrigin}/app_images/uploads/${baseName}`);
      }
    }
  }

  return out;
}

export type DocxExternalTargetCheck = {
  target: string;
  ok: boolean;
  status?: number;
  reason?: string;
};

export type DocxTemplateProbeResult = {
  ok: boolean;
  message?: string;
  url: string;
  status: number;
  contentType: string;
  payloadHint?: string;
  externalTargets: string[];
  externalTargetChecks: DocxExternalTargetCheck[];
};

function sniffPayloadHint(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer.slice(0, Math.min(buffer.byteLength, 220)));
    const text = new TextDecoder().decode(bytes).trim().toLowerCase();
    if (!text) return "";
    if (text.startsWith("<!doctype html") || text.startsWith("<html")) return "HTML response";
    if (text.startsWith("%pdf-")) return "PDF response";
    if (text.startsWith("{") || text.startsWith("[")) return "JSON response";
    return "unknown non-docx payload";
  } catch {
    return "";
  }
}

async function fetchArrayBuffer(src: string): Promise<FetchDocxResult> {
  if (isDataUrl(src)) {
    const res = await fetch(src);
    return {
      buffer: await res.arrayBuffer(),
      contentType: String(res.headers.get("content-type") || "").toLowerCase(),
      status: Number(res.status || 0),
      url: src,
    };
  }
  const candidates = buildTemplateCandidates(src);
  let firstOkNonZip: FetchDocxResult | null = null;
  let lastErr: any = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`Failed to fetch DOCX template: ${res.status}`);
        continue;
      }
      const result: FetchDocxResult = {
        buffer: await res.arrayBuffer(),
        contentType: String(res.headers.get("content-type") || "").toLowerCase(),
        status: Number(res.status || 0),
        url: String(res.url || candidate),
      };
      if (looksLikeZip(result.buffer)) return result;
      if (!firstOkNonZip) firstOkNonZip = result;
    } catch (err: any) {
      lastErr = err;
    }
  }

  if (firstOkNonZip) return firstOkNonZip;
  if (lastErr) throw lastErr;
  throw new Error("Failed to fetch DOCX template");
}

function looksLikeZip(buffer: ArrayBuffer): boolean {
  if (!buffer || buffer.byteLength < 4) return false;
  const bytes = new Uint8Array(buffer, 0, 4);
  // ZIP signatures: PK\x03\x04 (normal), PK\x05\x06 (empty archive), PK\x07\x08 (spanned)
  return bytes[0] === 0x50 && bytes[1] === 0x4b && (
    (bytes[2] === 0x03 && bytes[3] === 0x04)
    || (bytes[2] === 0x05 && bytes[3] === 0x06)
    || (bytes[2] === 0x07 && bytes[3] === 0x08)
  );
}

function assertDocxBuffer(result: FetchDocxResult, templateUrl: string): void {
  const { buffer, contentType, status, url } = result;
  if (!looksLikeZip(buffer)) {
    const hint = sniffPayloadHint(buffer);
    const suffix = [
      `url=${url || templateUrl}`,
      `status=${status || 0}`,
      contentType ? `content-type=${contentType}` : "",
      hint ? `payload=${hint}` : "",
    ].filter(Boolean).join(", ");
    throw new Error(
      `Template DOCX không hợp lệ hoặc không phải file .docx: ${templateUrl}. `
      + `Chi tiết: ${suffix}. `
      + "Hãy kiểm tra lại template_url/report_name và đảm bảo endpoint trả về DOCX thật.",
    );
  }
}

function extractExternalTargetsFromDocx(buffer: ArrayBuffer): string[] {
  try {
    const zip = new PizZip(buffer);
    const files = Object.keys((zip as any)?.files || {});
    const relFiles = files.filter((name) => /\.rels$/i.test(name));
    const out = new Set<string>();
    for (const relName of relFiles) {
      const xml = String(zip.file(relName)?.asText?.() || "");
      if (!xml) continue;
      const re = /<Relationship\b[^>]*\bTarget\s*=\s*"([^"]+)"[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        const target = String(m[1] || "").trim();
        if (!target) continue;
        const isExternal = /\bTargetMode\s*=\s*"External"/i.test(m[0])
          || /^https?:\/\//i.test(target)
          || target.startsWith("/");
        if (isExternal) out.add(target);
      }
    }
    return Array.from(out);
  } catch {
    return [];
  }
}

async function checkExternalTarget(target: string): Promise<DocxExternalTargetCheck> {
  try {
    const res = await fetch(target, {
      method: "GET",
      cache: "no-store",
    });
    if (res.ok) return { target, ok: true, status: Number(res.status || 0) };
    return {
      target,
      ok: false,
      status: Number(res.status || 0),
      reason: `HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      target,
      ok: false,
      reason: String(err?.message || err || "network error"),
    };
  }
}

export async function probeDocxTemplateUrl(
  templateUrl: string,
  options?: { checkExternalTargets?: boolean; appIdHint?: string },
): Promise<DocxTemplateProbeResult> {
  const fetched = await fetchArrayBufferWithCandidates(templateUrl, options?.appIdHint);
  const payloadHint = sniffPayloadHint(fetched.buffer) || undefined;

  if (!looksLikeZip(fetched.buffer)) {
    return {
      ok: false,
      message: `Template không phải DOCX hợp lệ. status=${fetched.status}, content-type=${fetched.contentType || "unknown"}${payloadHint ? `, payload=${payloadHint}` : ""}`,
      url: fetched.url || templateUrl,
      status: fetched.status,
      contentType: fetched.contentType,
      payloadHint,
      externalTargets: [],
      externalTargetChecks: [],
    };
  }

  const externalTargets = extractExternalTargetsFromDocx(fetched.buffer);
  const checks: DocxExternalTargetCheck[] = [];
  if (options?.checkExternalTargets && externalTargets.length > 0) {
    for (const target of externalTargets) {
      checks.push(await checkExternalTarget(target));
    }
  }
  const broken = checks.filter((x) => !x.ok);
  if (broken.length > 0) {
    return {
      ok: false,
      message: `Template DOCX có tài nguyên ngoài lỗi: ${broken.map((b) => `${b.target}(${b.reason || b.status || "error"})`).join(", ")}`,
      url: fetched.url || templateUrl,
      status: fetched.status,
      contentType: fetched.contentType,
      externalTargets,
      externalTargetChecks: checks,
    };
  }

  return {
    ok: true,
    url: fetched.url || templateUrl,
    status: fetched.status,
    contentType: fetched.contentType,
    payloadHint,
    externalTargets,
    externalTargetChecks: checks,
  };
}

async function fetchArrayBufferWithCandidates(src: string, appIdHint?: string): Promise<FetchDocxResult> {
  if (isDataUrl(src)) return fetchArrayBuffer(src);

  const candidates = buildTemplateCandidates(src, appIdHint);
  let firstOkNonZip: FetchDocxResult | null = null;
  let lastErr: any = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`Failed to fetch DOCX template: ${res.status}`);
        continue;
      }
      const result: FetchDocxResult = {
        buffer: await res.arrayBuffer(),
        contentType: String(res.headers.get("content-type") || "").toLowerCase(),
        status: Number(res.status || 0),
        url: String(res.url || candidate),
      };
      if (looksLikeZip(result.buffer)) return result;
      if (!firstOkNonZip) firstOkNonZip = result;
    } catch (err: any) {
      lastErr = err;
    }
  }

  if (firstOkNonZip) return firstOkNonZip;
  if (lastErr) throw lastErr;
  throw new Error("Failed to fetch DOCX template");
}

export async function renderDocxTemplateToArrayBuffer(templateUrl: string, data: Record<string, any>): Promise<ArrayBuffer> {
  const contentResult = await fetchArrayBuffer(templateUrl);
  assertDocxBuffer(contentResult, templateUrl);
  const content = contentResult.buffer;

  const opts: any = {
    centered: false,
    getImage: async (tagValue: string) => {
      const imageResult = await fetchArrayBuffer(tagValue);
      return imageResult.buffer;
    },
    getSize: () => [180, 80],
  };

  const imageModule: any = new ImageModule(opts);
  try {
    const zip = new PizZip(content);

    const doc: any = new Docxtemplater(zip, {
      modules: [imageModule],
      paragraphLoop: true,
      linebreaks: true,
    });

    await doc.renderAsync(data || {});
    return doc.getZip().generate({
      type: "arraybuffer",
      compression: "DEFLATE",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (/end of central directory|zip file/i.test(msg)) {
      throw new Error(
        `Không đọc được template DOCX: ${templateUrl}. `
        + "File trả về không phải ZIP/DOCX hợp lệ (thường do URL sai, trả về HTML/PDF, hoặc file hỏng).",
      );
    }
    throw err;
  }
}

export async function renderDocxTemplateToHtml(templateUrl: string, data: Record<string, any>): Promise<string> {
  const output = await renderDocxTemplateToArrayBuffer(templateUrl, data);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  document.body.appendChild(container);

  try {
    (globalThis as any).process = undefined;
    const { default: docx2html } = await import("docx2html");
    const html = await (docx2html as any)(output, { container });
    return String(html?.toString ? html.toString() : html || "");
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

export function downloadDocx(arrayBuffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".docx") ? fileName : `${fileName.replace(/\.pdf$/i, "")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
