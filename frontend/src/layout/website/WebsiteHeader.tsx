import type { ButtonProps } from "antd";
import { Button, Dropdown, theme } from "antd";
import { MenuFoldOutlined, LoginOutlined, UserOutlined, SettingOutlined } from "@ant-design/icons";
import { Preferences } from "#src/layout/widgets/preferences";
import { NotificationContainer } from "#src/layout/widgets/notification/notification-container";
import { useTranslation } from "react-i18next";

import { useUserStore, useAuthStore } from "#src/store";
import { FullscreenButton } from "#src/layout/layout-header/components/fullscreen-button";
import { LanguageButton } from "#src/layout/layout-header/components/language-button";
import { ThemeButton } from "#src/layout/layout-header/components/theme-button";
import styles from "./websiteLayout.module.css";
import logo from "#src/assets/svg/logo.svg?url";

function LogoEffect() {
	return (
		<div className={styles.logo_quay}>
			{/* Sóng ánh sáng lan toả */}
			<span className={`${styles.lightWave} ${styles.wave1}`}></span>
			<span className={`${styles.lightWave} ${styles.wave2}`}></span>
			<span className={`${styles.lightWave} ${styles.wave3}`}></span>
			{/* 2 vòng border đứt quay nghịch chiều */}
			<span className={`${styles.dashedBorder} ${styles.border1}`}></span>
			<span className={`${styles.dashedBorder} ${styles.border2}`}></span>
			{/* Logo cố định */}
			<span className={styles.logo_center}>
				<img src={logo} alt="logo" style={{ width: 32, height: 32, borderRadius: "50%" }} />
			</span>
		</div>
	);
}

interface WebsiteHeaderProps {
	isMobile: boolean;
	onMobileMenuClick: () => void;
	children?: React.ReactNode;
}

const buttonProps: ButtonProps = {
	size: "large",
	className: "px-[11px]",
};

export default function WebsiteHeader({ isMobile, onMobileMenuClick, children }: WebsiteHeaderProps) {
	const { t } = useTranslation();
	// const navigate = useNavigate();
	// Đăng nhập dựa vào userId từ useUserStore
	const { userId } = useUserStore();
	const isLoggedIn = !!userId;

	const {
		token: { colorBgContainer },
	} = theme.useToken();

	// User menu for logged in users
	const userMenuItems = [
		{
			key: "website",
			label: t("website.menu.goToWebsite", "Vào Website"),
			icon: <UserOutlined />,
			onClick: () => {
				// Chuyển sang website mode và đi tới trang chủ website
				window.sessionStorage.removeItem("forceAdminMode");  // Clear any previous setting
				window.sessionStorage.setItem("forceAdminMode", "false");
				// Use navigate instead of window.location to avoid full reload
				window.location.href = "/?t=" + Date.now();  // Add timestamp to force fresh load
			},
		},
		{
			key: "admin",
			label: t("website.menu.goToAdmin", "Vào Admin"),
			icon: <SettingOutlined />,
			onClick: () => {
				// Bật admin mode và tới admin home
				window.sessionStorage.removeItem("forceAdminMode");  // Clear any previous setting
				window.sessionStorage.setItem("forceAdminMode", "true");
				window.location.href = (import.meta.env.VITE_BASE_HOME_PATH || "/home") + "?t=" + Date.now();
			},
		},
		{
			key: "logout",
			label: t("website.menu.logout", "Đăng xuất"),
			icon: <LoginOutlined />,
			onClick: () => {
				window.sessionStorage.removeItem("forceAdminMode");  // Clear on logout
				useAuthStore.getState().logout();
				window.location.reload();
			},
		},
	];

	return (
		<header className={styles.websiteHeader}>
			<div className={styles.headerContent}>
				<div className={styles.logoSection}>
					<LogoEffect />
				</div>
				{!isMobile && (
					<div className={styles.desktopMenu}>
						{children}
					</div>
				)}
				<div className="flex items-center gap-1">
					<Preferences {...buttonProps} key="preferences" />
					<ThemeButton {...buttonProps} />
					{/* Chỉ hiển thị LanguageButton trên desktop */}
					{!isMobile && <LanguageButton {...buttonProps} />}
					<FullscreenButton {...buttonProps} target={document.documentElement} />
										{isLoggedIn ? (
											<Dropdown
												menu={{ items: userMenuItems }}
												placement="bottomRight"
												trigger={["click"]}
											>
												<Button
													{...buttonProps}
													type="text"
													icon={<UserOutlined />}
													className={styles.actionButton}
												>
													{t("website.menu.account", "Tài khoản")}
												</Button>
											</Dropdown>
										) : (
											<a
												{...buttonProps}
												href="/login"
												className={`${styles.actionButton} ${styles.loginButton}`}
												style={{ display: "inline-block", lineHeight: "32px", padding: "0 12px" }}
											>
												<LoginOutlined style={{ marginRight: 6 }} />
												{t("website.menu.login", "Đăng nhập")}
											</a>
										)}
					{isMobile && (
						<Button
							type="text"
							icon={<MenuFoldOutlined />}
							onClick={onMobileMenuClick}
							className={styles.mobileMenuButton}
						/>
					)}
				</div>
			</div>
		</header>
	);
}
