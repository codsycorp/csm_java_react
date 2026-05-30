// Frontend crypto helpers mirroring backend RecordManager.csm_encrypt/csm_decrypt
// Uses Base64 then character translation with PHONE and WRITEBY constants

const PHONE = "0937.528.839";
const WRITEBY = "base._co.osa";
const UTF8_DECODER = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;

function strtr(str: string, from: string, to: string): string {
  if (from.length !== to.length)
    return str;
  const map: Record<string, string> = {};
  for (let i = 0; i < from.length; i++)
    map[from[i]] = to[i];
  let out = "";
  for (let i = 0; i < str.length; i++)
    out += map[str[i]] ?? str[i];
  return out;
}

function looksLikePlainComboJson(text: string): boolean {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") return false;
    return Array.isArray((parsed as any).query)
      || Array.isArray((parsed as any).options)
      || Boolean((parsed as any).cascadeFrom);
  } catch {
    return false;
  }
}

export function csmEncrypt(d_code: string): string {
  if (!d_code) return "";
  // Browser environment
  const base64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(d_code)))
    : d_code;
  return strtr(base64, PHONE + WRITEBY, WRITEBY + PHONE);
}

export function csmDecrypt(e_code: string): string {
	try {
		if (!e_code) return "";

		// Fast path for already-plain HTML/text to avoid unnecessary decode cost.
		if (/<[a-z][\s\S]*>/i.test(e_code)) return e_code;
		if (/[%]/.test(e_code)) {
			try {
				return decodeURIComponent(e_code);
			} catch {
				// keep original path below
			}
		}
		
		const swapped = strtr(e_code, WRITEBY + PHONE, PHONE + WRITEBY);

		// f_cbo_query is sometimes stored with strtr-only obfuscation (plain JSON after swap).
		if (looksLikePlainComboJson(swapped)) {
			return swapped;
		}

		function padBase64(s: string): string {
			const rem = s.length % 4;
			return rem ? s + "=".repeat(4 - rem) : s;
		}

		if (typeof atob === "function") {
			try {
				const padded = padBase64(swapped);
				const binary = atob(padded);
				
				try {
					if (UTF8_DECODER) {
						const bytes = new Uint8Array(binary.length);
						for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
						return UTF8_DECODER.decode(bytes);
					}
					return binary;
				} catch (decodeErr) {
					try {
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						const decoded = decodeURIComponent(escape(binary));
						return decoded;
					} catch (escapeErr) {
						return binary;
					}
				}
			} catch (atobErr) {
				// atob failed, return swapped string as-is
			}
		}
		return swapped;
	} catch (err) {
		return e_code;
	}
}

export default { csmEncrypt, csmDecrypt };
