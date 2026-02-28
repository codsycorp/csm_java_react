import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidAppToken(token: string, expectedAppId?: string): boolean {
  if (!token || typeof token !== "string") return false;
  try {
    const decoded = csmDecrypt(token);
    if (!decoded || typeof decoded !== "string") return false;
    const parts = decoded.split("_____");
    if (parts.length !== 4) return false;
    const [appId, email1, email2, flag] = parts;
    if (expectedAppId && appId !== expectedAppId) return false;
    if (!isValidEmail(email1) || !isValidEmail(email2)) return false;
    if (!(flag === "0" || flag === "1")) return false;
    return true;
  } catch {
    return false;
  }
}

export default isValidAppToken;
