import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";

export function isValidAppToken(token: string, expectedAppId?: string): boolean {
  if (!token || typeof token !== "string") return false;
  try {
    const decoded = csmDecrypt(token);
    if (!decoded || typeof decoded !== "string") return false;
    const parts = decoded.split("_____");
    if (parts.length !== 4) return false;
    const [appId, principal, role, flag] = parts;
    if (expectedAppId && appId !== expectedAppId) return false;
    if (!appId.trim() || !principal.trim() || !role.trim()) return false;
    if (!(flag === "0" || flag === "1")) return false;
    return true;
  } catch {
    return false;
  }
}

export default isValidAppToken;
