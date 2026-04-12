import { Button, Space } from "antd";
import { createElement, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

interface AppVersionMonitorProps {
	// 轮训时间，单位：分钟，默认 1 分钟
	checkUpdatesInterval?: number
	// 检查更新的地址
	checkUpdateUrl?: string
}

export function AppVersionMonitor({ checkUpdatesInterval = 1, checkUpdateUrl = import.meta.env.VITE_BASE_URL ?? "/" }: AppVersionMonitorProps) {
	let isCheckingUpdates = false;
	const { t } = useTranslation();
	const currentVersionTag = useRef("");
	const lastVersionTag = useRef("");
	const timer = useRef<ReturnType<typeof setInterval>>();
	const consecutiveFailures = useRef(0);
	const cooldownUntil = useRef(0);

	function buildProbeUrl(path: string) {
		try {
			const normalizedBase = String(checkUpdateUrl || "/").trim() || "/";
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

	async function getVersionTag(isCache: boolean = false) {
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

			// Check version from a JSON file in the OSS directory
			const response = await fetch(buildProbeUrl("version.json"), {
				cache: !isCache ? "no-cache" : "default",
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

			// Fallback to checking headers if JSON file is not available
			const fallbackResponse = await fetch(buildProbeUrl("fversion"), {
				cache: !isCache ? "no-cache" : "default",
				method: "HEAD",
				signal: fallbackController.signal,
			});
			clearTimeout(fallbackTimeoutId);

			if (fallbackResponse.ok) {
				consecutiveFailures.current = 0;
				return fallbackResponse.headers.get("etag") || fallbackResponse.headers.get("last-modified");
			}
			
			// Silently return null if both methods fail (no need to log error)
			return null;
		}
		catch (error) {
			consecutiveFailures.current += 1;
			if (consecutiveFailures.current >= 3) {
				// Pause probing for a short period to avoid noisy retries after network changes.
				cooldownUntil.current = Date.now() + 5 * 60 * 1000;
			}
			// Only log errors in development mode
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

		if (lastVersionTag.current !== versionTag) {
			clearInterval(timer.current);
			handleNotice(versionTag);
		}
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

		// 首次运行时，获取当前版本号（防止 Nginx 缓存了 index.html）
		if (!lastVersionTag.current) {
			const currentVersionTag = await getVersionTag(true);
			if (!currentVersionTag) {
				return;
			}
			lastVersionTag.current = currentVersionTag;
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
		/* Mounted */
		start();
		document.addEventListener("visibilitychange", handleVisibilitychange);

		/* UnMounted */
		return () => {
			stop();
			document.removeEventListener("visibilitychange", handleVisibilitychange);
		};
	}, []);
	return null;
}
