/**
 * Header in PDF — ưu tiên sys_apps (app_id=csm): app_name + f_logo.
 * pm_cai_dat bổ sung địa chỉ, MST, ghi chú… và có thể override logo/tên nếu nhập.
 */
import { getTableData } from "#src/components/csm-grid/CsmApi";
import { resolveEffectiveUserAppId } from "#src/utils/user-app-id";
import type { UserAppIdInput } from "#src/utils/user-app-id";

const SYS_APPS_DB = "csm";
const SYS_APPS_TABLE = "sys_apps";

function extractRows(res: unknown): Record<string, any>[] {
  if (Array.isArray((res as any)?.rows)) return (res as any).rows;
  if (Array.isArray(res)) return res as Record<string, any>[];
  if (Array.isArray((res as any)?.data)) return (res as any).data;
  return [];
}

/** Tìm dòng sys_apps theo app_id tenant (vd. phuson, tranphong…). */
export async function fetchSysAppRow(tenantAppId?: string): Promise<Record<string, any> | null> {
  const key = String(tenantAppId ?? "").trim();
  if (!key) return null;
  try {
    const res = await getTableData<any>({
      app_id: SYS_APPS_DB,
      obj_name: SYS_APPS_TABLE,
      where: { field: "app_id", type: "eq", value: key },
    });
    const rows = extractRows(res);
    const exact = rows.find(r => String(r?.app_id ?? "").trim() === key);
    return exact ?? rows[0] ?? null;
  } catch {
    return null;
  }
}

export function resolveTenantAppIdForPrint(
  dataAppId?: string,
  user?: UserAppIdInput,
  decrypt?: (s: string) => string,
): string {
  const fromUser = resolveEffectiveUserAppId(user ?? {}, decrypt);
  return String(dataAppId ?? fromUser ?? "csm").trim() || "csm";
}

/**
 * Merge pm_cai_dat + sys_apps → settings cho buildCompanyHdr / trigger in.
 * Tên + logo: sys_apps trước, pm_cai_dat override nếu có giá trị nhập tay.
 */
export function mergePrintCompanySettings(
  pmSettings: Record<string, any> = {},
  sysApp: Record<string, any> | null | undefined,
): Record<string, any> {
  const pm = pmSettings ?? {};
  const sys = sysApp ?? {};
  const pmName = String(pm.ten_cong_ty ?? "").trim();
  const sysName = String(sys.app_name ?? sys.name ?? "").trim();
  const pmLogo = String(pm.logo_url ?? pm.logo ?? "").trim();
  const sysLogo = String(sys.f_logo ?? sys.logo ?? "").trim();
  return {
    ...pm,
    app_name: sysName || pmName,
    ten_cong_ty: pmName || sysName,
    logo_url: pmLogo || sysLogo,
    f_logo: pmLogo || sysLogo,
  };
}

export async function loadPrintCompanySettings(
  dataAppId: string | undefined,
  user?: UserAppIdInput,
  decrypt?: (s: string) => string,
): Promise<Record<string, any>> {
  const tenantAppId = resolveTenantAppIdForPrint(dataAppId, user, decrypt);
  let pmSettings: Record<string, any> = {};
  let sysApp: Record<string, any> | null = null;

  if (dataAppId) {
    try {
      const res = await getTableData<any>({
        app_id: dataAppId,
        obj_name: "pm_cai_dat",
      });
      const rows = extractRows(res);
      if (rows[0]) pmSettings = rows[0];
    } catch { /* optional table */ }
  }

  sysApp = await fetchSysAppRow(tenantAppId);
  return mergePrintCompanySettings(pmSettings, sysApp);
}
