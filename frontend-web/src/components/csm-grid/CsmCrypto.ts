export function csmEncrypt(raw: string): string {
  if (raw == null) return "";
  try {
    return btoa(unescape(encodeURIComponent(String(raw))));
  } catch {
    return String(raw);
  }
}

export function csmDecrypt(raw: string): string {
  if (raw == null) return "";
  try {
    return decodeURIComponent(escape(atob(String(raw))));
  } catch {
    try {
      return decodeURIComponent(String(raw));
    } catch {
      return String(raw);
    }
  }
}
