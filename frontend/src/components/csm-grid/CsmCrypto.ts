// Frontend crypto helpers mirroring backend RecordManager.csm_encrypt/csm_decrypt
// Uses Base64 then character translation with PHONE and WRITEBY constants

const PHONE = "0937.528.839";
const WRITEBY = "base._co.osa";

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
  // Browser environment
  const base64 = typeof btoa === "function"
    ? btoa(unescape(encodeURIComponent(d_code)))
    : d_code;
  return strtr(base64, PHONE + WRITEBY, WRITEBY + PHONE);
}

export function csmDecrypt(e_code: string): string {
	try {
		console.log("[csmDecrypt] Input (first 100 chars):", e_code.substring(0, 100));
		
		const swapped = strtr(e_code, WRITEBY + PHONE, PHONE + WRITEBY);
		console.log("[csmDecrypt] After strtr swap (first 100 chars):", swapped.substring(0, 100));
		console.log("[csmDecrypt] Input === swapped?", e_code === swapped);

		function padBase64(s: string): string {
			const rem = s.length % 4;
			return rem ? s + "=".repeat(4 - rem) : s;
		}

		if (typeof atob === "function") {
			try {
				const padded = padBase64(swapped);
				console.log("[csmDecrypt] After padding (first 100 chars):", padded.substring(0, 100));
				
				const binary = atob(padded);
				console.log("[csmDecrypt] atob() succeeded, binary length:", binary.length);
				
				try {
					const bytes = new Uint8Array(binary.length);
					for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
					const decoded = new TextDecoder("utf-8").decode(bytes);
					console.log("[csmDecrypt] ✅ UTF-8 decode succeeded, result (first 100 chars):", decoded.substring(0, 100));
					return decoded;
				} catch (decodeErr) {
					console.warn("[csmDecrypt] UTF-8 decode failed, trying escape/decodeURIComponent:", decodeErr);
					try {
						// eslint-disable-next-line @typescript-eslint/ban-ts-comment
						// @ts-ignore
						const decoded = decodeURIComponent(escape(binary));
						console.log("[csmDecrypt] ✅ escape/decodeURIComponent succeeded, result (first 100 chars):", decoded.substring(0, 100));
						return decoded;
					} catch (escapeErr) {
						console.warn("[csmDecrypt] escape/decodeURIComponent failed, returning binary:", escapeErr);
						return binary;
					}
				}
			} catch (atobErr) {
				console.error("[csmDecrypt] ❌ atob() failed:", atobErr);
				console.log("[csmDecrypt] Returning swapped string instead (probably not encrypted)");
			}
		} else {
			console.warn("[csmDecrypt] atob not available, returning swapped");
		}
		return swapped;
	} catch (err) {
		console.error("[csmDecrypt] Unexpected error:", err);
		return e_code;
	}
}

export default { csmEncrypt, csmDecrypt };
