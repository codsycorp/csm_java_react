import logo from "#src/assets/svg/logo.svg?url";
import { Typography } from "antd";
import { clsx } from "clsx";

import { useNavigate } from "react-router";
import { usePermissionStore } from "#src/store";

const { Title } = Typography;

export interface LogoProps {
	sidebarCollapsed: boolean
	className?: string
}

/** Tìm f_logo / f_title đầu tiên có giá trị trong cây menu */
function findBrandFromMenus(menus: any[]): { f_logo?: string; f_title?: string } {
	for (const m of menus) {
		if (m.f_logo || m.f_title) return { f_logo: m.f_logo, f_title: m.f_title };
		if (m.children?.length) {
			const found = findBrandFromMenus(m.children);
			if (found.f_logo || found.f_title) return found;
		}
	}
	return {};
}

/** Lấy brand từ window.__APP_CONFIG__ (SSR-injected) nếu có */
function getSSRBrand(): { f_logo?: string; f_title?: string } {
	try {
		const cfg = (window as any).__APP_CONFIG__;
		if (cfg && (cfg.f_logo || cfg.f_title)) return { f_logo: cfg.f_logo || undefined, f_title: cfg.f_title || undefined };
	} catch {}
	return {};
}

function normalizeHomePath(rawPath: string | undefined): string {
	const text = String(rawPath || "").trim();
	if (!text) return "/";
	if (text.startsWith("http://") || text.startsWith("https://")) return "/";
	return text.startsWith("/") ? text : `/${text}`;
}

/**
 * @zh 高度 48px
 * @en The height is 48px
 */
export function Logo({ sidebarCollapsed, className }: LogoProps) {
	const navigate = useNavigate();
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);

	// Priority: 1. SSR-injected window.__APP_CONFIG__  2. apiWholeMenus  3. static fallback
	const ssrBrand = getSSRBrand();
	const menuBrand = ssrBrand.f_logo || ssrBrand.f_title ? {} : findBrandFromMenus(apiWholeMenus);
	const brand = { ...menuBrand, ...ssrBrand };

	const logoSrc = brand.f_logo || logo;
	const appTitle = brand.f_title || import.meta.env.VITE_GLOB_APP_SHORT_NAME;

	return (
		<div
			// 和 header 高度保持一致
			className={clsx("h-12 flex items-center justify-center gap-2 cursor-pointer", className)}
			onClick={() => navigate(normalizeHomePath(import.meta.env.VITE_BASE_HOME_PATH))}
		>
			<img
				src={logoSrc}
				alt="logo"
				width={32}
				height={32}
			/>

			<Title level={1} className={clsx("!text-sm !m-0", { hidden: sidebarCollapsed })} ellipsis={true}>
				{appTitle}
			</Title>

		</div>
	);
}
