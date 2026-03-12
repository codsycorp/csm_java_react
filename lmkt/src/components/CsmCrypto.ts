/**
 * CSM Crypto Functions - For encrypting/decrypting content in lmkt
 * Mirroring backend RecordManager.csm_encrypt/csm_decrypt
 * Uses Base64 then character translation with PHONE and WRITEBY constants
 */

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

// Expose to window for auto-upload scripts
if (typeof window !== 'undefined') {
	(window as any).csmCrypto = {
		encrypt: csmEncrypt,
		decrypt: csmDecrypt,
		csmEncrypt,
		csmDecrypt
	};
}
