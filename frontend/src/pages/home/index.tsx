import { BasicContent } from "#src/components";
import { andWhere, getTableData } from "#src/components/csm-grid/CsmApi";
import * as CsmApi from "#src/components/csm-grid/CsmApi";
import { csmDecrypt } from "#src/components/csm-grid/CsmCrypto";
import { useAppStore } from "#src/store/app";
import { useUserStore } from "#src/store/user";
import { usePreferences } from "#src/hooks";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export default function Home() {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const user = useUserStore();
	const appId = useAppStore(state => state.currentAppId);
	const preferences = usePreferences();
	const { isDark, themeColorPrimary } = preferences;
	const [autoCode, setAutoCode] = useState<string | undefined>(undefined);

	if (typeof window !== "undefined") {
		window.csmApi = {
			...window.csmApi,
			...CsmApi,
		};
		// Expose theme preferences for dynamic code
		(window as any).csmTheme = {
			isDark,
			themeColorPrimary,
			getBackgroundColor: () => isDark ? '#141414' : '#ffffff',
			getTextColor: () => isDark ? '#ffffff' : '#000000',
			getSecondaryTextColor: () => isDark ? '#8c8c8c' : '#666666',
			getBorderColor: () => isDark ? '#303030' : '#f0f0f0',
			getCardBackground: () => isDark ? '#1f1f1f' : '#ffffff',
		};
	}

	useEffect(() => {
		if (typeof window !== "undefined") {
			window.csmCurrentUser = JSON.parse(JSON.stringify(user));
		}
	}, [user]);

	// Sync theme preferences to window
	useEffect(() => {
		if (typeof window !== "undefined") {
			(window as any).csmTheme = {
				isDark,
				themeColorPrimary,
				getBackgroundColor: () => isDark ? '#141414' : '#ffffff',
				getTextColor: () => isDark ? '#ffffff' : '#000000',
				getSecondaryTextColor: () => isDark ? '#8c8c8c' : '#666666',
				getBorderColor: () => isDark ? '#303030' : '#f0f0f0',
				getCardBackground: () => isDark ? '#1f1f1f' : '#ffffff',
			};
		}
	}, [isDark, themeColorPrimary]);

	useEffect(() => {
		let cancelled = false;
		async function loadAutoCode() {
			try {
				// Lấy app_id từ thông tin user đã đăng nhập, không phải từ AppStore
				const userAppId = user.app_id || appId;
				const broadcastAppId = "broadcast_" + userAppId;
				
				const primaryWhere = andWhere([
					{ field: "p_name", type: "eq", value: broadcastAppId },
					{ field: "p_type", type: "eq", value: 0 },
				]);

				const sourceAppId = "csm"; // sys_autos is stored under app_id=csm

				let res = await getTableData<any>({
					app_id: sourceAppId,
					obj_name: "sys_autos",
					where: primaryWhere,
					take: 1,
				});
				let rows = (res as any)?.rows || (res as any)?.data || [];

				// Fallback: try without p_name in case records are shared
				if (!rows?.length) {
					const fallbackWhere = andWhere([
						{ field: "p_type", type: "eq", value:0 },
					]);
					res = await getTableData<any>({ app_id: sourceAppId, obj_name: "sys_autos", where: fallbackWhere, take: 5 });
					rows = (res as any)?.rows || (res as any)?.data || [];
				}

				const picked = Array.isArray(rows)
					? (rows.find((r: any) => r?.p_name === broadcastAppId) || rows[0])
					: undefined;
				const pCode = picked?.p_code || "";
				const decrypted = pCode ? csmDecrypt(pCode) : "";

				if (!cancelled) {
					if (decrypted && decrypted.trim()) {
						setAutoCode(decrypted);
					} else {
						setAutoCode("");
					}
				}
			} catch (err: any) {
				if (!cancelled) {
					const msg = err?.message || String(err);
					console.error("❌ [Home] Error fetching auto_code:", msg);
					setAutoCode("");
				}
			}
		}
		loadAutoCode();
		return () => {
			cancelled = true;
		};
	}, [user.app_id, appId]);

	const seft = useMemo(() => {
		return {
			appId: user.app_id || appId || "csm",
			user: window.csmCurrentUser || user,
			t,
			navigate,
			...CsmApi,
		};
	}, [user, appId, t, navigate]);

	useEffect(() => {
		// Only execute when autoCode has been successfully loaded from API
		if (autoCode === undefined) {
			return; // Still fetching from API
		}
		
		if (!autoCode || !autoCode.trim()) {
			return; // Empty code, nothing to execute
		}

		try {
			const fn = new Function("seft", `try{\n${autoCode}\n} catch (sca_err) {console.error(sca_err); alert(sca_err);}`);
			// Defer execution to avoid blocking initial route render
			setTimeout(() => {
				try {
					fn(seft);
				} catch (err: any) {
					const msg = err?.message || String(err);
					console.error("❌ [Home] Error executing auto_code:", msg);
				}
			}, 0);
		} catch (error: any) {
			const msg = error?.message || String(error);
			console.error("❌ [Home] Error creating function:", msg);
		}
	}, [autoCode, seft]);

	return (
		<BasicContent key={i18n.language}>
			<div id="broadcast-auto-root" style={{ width: "100%", minHeight: "400px" }}>
				{autoCode === undefined ? (
					<div style={{ textAlign: "center", padding: "40px" }}>
						<p>Loading...</p>
					</div>
				) : autoCode === "" ? (
					<div style={{ textAlign: "center", padding: "40px" }}>
						<p>{t("system.broadcast.no_auto_code", "Chua cau hinh auto_code cho trang nay.")}</p>
					</div>
				) : null}
			</div>
		</BasicContent>
	);
}
