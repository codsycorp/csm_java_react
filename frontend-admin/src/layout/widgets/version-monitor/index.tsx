import { Button, Space } from "antd";
import { createElement, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface AppVersionMonitorProps {
	// 轮训时间，单位：分钟，默认 1 分钟
	checkUpdatesInterval?: number
	// 检查更新的地址（默认 import.meta.env.BASE_URL — cùng thư mục deploy với index.html）
	checkUpdateUrl?: string
}

const VERSION_DISMISS_KEY = "csm_app_version_dismissed";

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
	const timer = useRef<ReturnType<typeof setInterval>>();
	const consecutiveFailures = useRef(0);
	const cooldownUntil = useRef(0);
	const probeBase = resolveProbeBase(checkUpdateUrl);

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
			message: t("widgets.versionMonitorTitle"),
			description: t("widgets.versionMonitorContent"),
			duration: 0,
			btn: (() => {
				return createElement(
					Space,
					{ size: 12 },
					[
						createElement(
							Button,
							{
								onClick() {
									sessionStorage.setItem(VERSION_DISMISS_KEY, versionTag);
									lastVersionTag.current = versionTag;
									window.$notification?.destroy();
								},
								key: "cancel",
							},
							t("widgets.versionMonitorCancel"),
						),
						createElement(
							Button,
							{
								type: "primary",
								onClick() {
									sessionStorage.removeItem(VERSION_DISMISS_KEY);
									lastVersionTag.current = currentVersionTag.current;
									location.reload();
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

			const fallbackController = new AbortController();
			const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 5000);

			const fallbackResponse = await fetch(buildProbeUrl("fversion"), {
				cache: "no-store",
				method: "HEAD",
				signal: fallbackController.signal,
			});
			clearTimeout(fallbackTimeoutId);

			if (fallbackResponse.ok) {
				consecutiveFailures.current = 0;
				return fallbackResponse.headers.get("etag") || fallbackResponse.headers.get("last-modified");
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
		const versionTag = await getVersionTag();
		if (!versionTag) {
			return;
		}

		if (lastVersionTag.current === versionTag) {
			return;
		}

		if (sessionStorage.getItem(VERSION_DISMISS_KEY) === versionTag) {
			lastVersionTag.current = versionTag;
			return;
		}

		clearInterval(timer.current);
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
		start();
		document.addEventListener("visibilitychange", handleVisibilitychange);

		return () => {
			stop();
			document.removeEventListener("visibilitychange", handleVisibilitychange);
		};
	}, []);
	return null;
}
