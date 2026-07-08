import { Button, Space } from "antd";
import { createElement, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface AppVersionMonitorProps {
	// 轮训时间，单位：分钟，默认 1 分钟
	checkUpdatesInterval?: number
	// 检查更新的地址（默认 import.meta.env.BASE_URL — cùng thư mục deploy với index.html）
	checkUpdateUrl?: string
}

const VERSION_ACCEPTED_KEY = "csm_app_version_accepted";
const VERSION_SNOOZE_VERSION_KEY = "csm_app_version_snooze_version";
const VERSION_SNOOZE_UNTIL_KEY = "csm_app_version_snooze_until";
const VERSION_MONITOR_ACTIVE_KEY = "__csm_app_version_monitor_active__";
const VERSION_NOTICE_KEY = "csm_app_version_notice";
const VERSION_REFRESH_TARGET_KEY = "csm_app_version_refresh_target";
const VERSION_REFRESH_AT_KEY = "csm_app_version_refresh_at";
const VERSION_SUPPRESS_UNTIL_KEY = "csm_app_version_suppress_until";
const VERSION_REFRESH_SUPPRESS_MS = 10 * 60 * 1000;
const VERSION_REMIND_LATER_MS = 30 * 60 * 1000;

declare const __APP_INFO__: { buildVersion?: string; lastBuildTime?: string };

function getEmbeddedBuildVersion(): string | null {
	try {
		if (typeof __APP_INFO__ !== "undefined") {
			return __APP_INFO__.buildVersion || __APP_INFO__.lastBuildTime || null;
		}
	}
	catch {
		// ignore
	}
	return null;
}

function resolveProbeBase(checkUpdateUrl?: string): string {
	const base = checkUpdateUrl ?? import.meta.env.BASE_URL ?? import.meta.env.VITE_BASE_URL ?? "/";
	const normalized = String(base).trim() || "/";
	return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function AppVersionMonitor({ checkUpdatesInterval = 1, checkUpdateUrl }: AppVersionMonitorProps) {
	let isCheckingUpdates = false;
	const { t } = useTranslation();
	const currentVersionTag = useRef("");
	const lastVersionTag = useRef("");
	const hasOwnership = useRef(false);
	const timer = useRef<ReturnType<typeof setInterval>>();
	const consecutiveFailures = useRef(0);
	const cooldownUntil = useRef(0);
	const probeBase = resolveProbeBase(checkUpdateUrl);

	function getAcceptedVersion(): string | null {
		try {
			const local = localStorage.getItem(VERSION_ACCEPTED_KEY);
			if (local) return local;
		} catch {
			// ignore
		}
		try {
			return sessionStorage.getItem(VERSION_ACCEPTED_KEY);
		} catch {
			return null;
		}
	}

	function setAcceptedVersion(versionTag: string) {
		try {
			localStorage.setItem(VERSION_ACCEPTED_KEY, versionTag);
		} catch {
			// ignore
		}
		try {
			sessionStorage.setItem(VERSION_ACCEPTED_KEY, versionTag);
		} catch {
			// ignore
		}
	}

	function getSnoozeVersion(): string {
		try {
			return String(sessionStorage.getItem(VERSION_SNOOZE_VERSION_KEY) || "").trim();
		} catch {
			return "";
		}
	}

	function getSnoozeUntil(): number {
		try {
			const raw = sessionStorage.getItem(VERSION_SNOOZE_UNTIL_KEY);
			const until = Number(raw || "0");
			return Number.isFinite(until) ? until : 0;
		} catch {
			return 0;
		}
	}

	function snoozeVersion(versionTag: string) {
		try {
			sessionStorage.setItem(VERSION_SNOOZE_VERSION_KEY, versionTag);
			sessionStorage.setItem(VERSION_SNOOZE_UNTIL_KEY, String(Date.now() + VERSION_REMIND_LATER_MS));
		} catch {
			// ignore
		}
	}

	function clearSnooze() {
		try {
			sessionStorage.removeItem(VERSION_SNOOZE_VERSION_KEY);
		} catch {
			// ignore
		}
		try {
			sessionStorage.removeItem(VERSION_SNOOZE_UNTIL_KEY);
		} catch {
			// ignore
		}
	}

	function isVersionSnoozed(versionTag: string): boolean {
		const snoozeVersionTag = getSnoozeVersion();
		if (!snoozeVersionTag || snoozeVersionTag !== versionTag) return false;
		return getSnoozeUntil() > Date.now();
	}

	function getRefreshTargetVersion(): string | null {
		try {
			return sessionStorage.getItem(VERSION_REFRESH_TARGET_KEY);
		} catch {
			return null;
		}
	}

	function setRefreshTargetVersion(versionTag: string) {
		try {
			sessionStorage.setItem(VERSION_REFRESH_TARGET_KEY, versionTag);
			sessionStorage.setItem(VERSION_REFRESH_AT_KEY, String(Date.now()));
			sessionStorage.setItem(VERSION_SUPPRESS_UNTIL_KEY, String(Date.now() + VERSION_REFRESH_SUPPRESS_MS));
		} catch {
			// ignore
		}
	}

	function isTemporarilySuppressed(): boolean {
		try {
			const untilRaw = sessionStorage.getItem(VERSION_SUPPRESS_UNTIL_KEY);
			const until = Number(untilRaw || "0");
			return Number.isFinite(until) && until > Date.now();
		} catch {
			return false;
		}
	}

	async function hardReloadToVersion(versionTag: string) {
		setRefreshTargetVersion(versionTag);

		try {
			if ("caches" in window) {
				const keys = await caches.keys();
				await Promise.all(keys.map((key) => caches.delete(key)));
			}
		} catch {
			// ignore cache cleanup failures
		}

		try {
			if ("serviceWorker" in navigator) {
				const regs = await navigator.serviceWorker.getRegistrations();
				await Promise.all(regs.map((reg) => reg.unregister()));
			}
		} catch {
			// ignore SW cleanup failures
		}

		location.reload();
	}

	function buildProbeUrl(path: string) {
		try {
			const normalizedBase = probeBase;
			const base = /^https?:\/\//i.test(normalizedBase)
				? normalizedBase
				: `${location.origin}${normalizedBase.startsWith("/") ? "" : "/"}${normalizedBase}`;
			const cleanBase = base.endsWith("/") ? base : `${base}/`;
			return new URL(path.replace(/^\//, ""), cleanBase).toString();
		}
		catch {
			return `${location.origin}/${path.replace(/^\//, "")}`;
		}
	}

	function handleNotice(versionTag: string) {
		currentVersionTag.current = versionTag;
		window.$notification?.open({
			key: VERSION_NOTICE_KEY,
			message: t("widgets.versionMonitorTitle"),
			description: t("widgets.versionMonitorContent"),
			duration: 0,
			onClose: () => {
				snoozeVersion(versionTag);
			},
			btn: (() => {
				return createElement(
					Space,
					{ size: 12 },
					[
						createElement(
							Button,
							{
								onClick() {
									snoozeVersion(versionTag);
									window.$notification?.destroy(VERSION_NOTICE_KEY);
								},
								key: "cancel",
							},
							t("widgets.versionMonitorCancel"),
						),
						createElement(
							Button,
							{
								type: "primary",
								async onClick() {
									const acceptedVersion = currentVersionTag.current;
									setAcceptedVersion(acceptedVersion);
									clearSnooze();
									lastVersionTag.current = acceptedVersion;
									window.$notification?.destroy(VERSION_NOTICE_KEY);
									await hardReloadToVersion(acceptedVersion);
								},
								key: "ok",
							},
							t("widgets.versionMonitorConfirm"),
						),
					],
				);
			})(),
		});
	}

	async function getVersionTag() {
		try {
			if (
				location.hostname === "localhost"
				|| location.hostname === "127.0.0.1"
			) {
				return null;
			}

			if (typeof navigator !== "undefined" && navigator.onLine === false) {
				return null;
			}

			if (cooldownUntil.current > Date.now()) {
				return null;
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 5000);

			const response = await fetch(buildProbeUrl("version.json"), {
				cache: "no-store",
				method: "GET",
				signal: controller.signal,
			});
			clearTimeout(timeoutId);

			if (response.ok) {
				const data = await response.json();
				consecutiveFailures.current = 0;
				return data.version || null;
			}

			return null;
		}
		catch (error) {
			consecutiveFailures.current += 1;
			if (consecutiveFailures.current >= 3) {
				cooldownUntil.current = Date.now() + 5 * 60 * 1000;
			}
			if (import.meta.env.DEV) {
				console.warn("Failed to fetch version tag:", error);
			}
			return null;
		}
	}

	async function checkForUpdates() {
		if (isTemporarilySuppressed()) {
			return;
		}

		const versionTag = await getVersionTag();
		if (!versionTag) {
			return;
		}

		if (getRefreshTargetVersion() === versionTag) {
			lastVersionTag.current = versionTag;
			setAcceptedVersion(versionTag);
			clearSnooze();
			return;
		}

		if (lastVersionTag.current === versionTag) {
			return;
		}

		if (getAcceptedVersion() === versionTag) {
			lastVersionTag.current = versionTag;
			return;
		}

		if (isVersionSnoozed(versionTag)) {
			return;
		}

		handleNotice(versionTag);
	}

	function handleVisibilitychange() {
		if (document.hidden) {
			stop();
		}
		else {
			if (!isCheckingUpdates) {
				isCheckingUpdates = true;
				checkForUpdates().finally(() => {
					isCheckingUpdates = false;
					start();
				});
			}
		}
	}

	async function start() {
		if (checkUpdatesInterval <= 0) {
			return;
		}

		if (!lastVersionTag.current) {
			const embedded = getEmbeddedBuildVersion();
			if (embedded) {
				lastVersionTag.current = embedded;
			}
			else {
				const serverVersion = await getVersionTag();
				if (serverVersion) {
					lastVersionTag.current = serverVersion;
				}
			}
		}

		timer.current = setInterval(
			checkForUpdates,
			checkUpdatesInterval * 60 * 1000,
		);
	}

	function stop() {
		clearInterval(timer.current);
		timer.current = undefined;
	}

	useEffect(() => {
		const g = window as any;
		if (g[VERSION_MONITOR_ACTIVE_KEY]) {
			return;
		}
		g[VERSION_MONITOR_ACTIVE_KEY] = true;
		hasOwnership.current = true;

		start();
		document.addEventListener("visibilitychange", handleVisibilitychange);

		return () => {
			if (hasOwnership.current) {
				delete g[VERSION_MONITOR_ACTIVE_KEY];
			}
			stop();
			window.$notification?.destroy(VERSION_NOTICE_KEY);
			document.removeEventListener("visibilitychange", handleVisibilitychange);
		};
	}, []);
	return null;
}
