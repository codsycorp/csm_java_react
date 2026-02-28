import type { ButtonProps } from "antd";
import { Button, theme } from "antd";
import { MenuFoldOutlined } from "@ant-design/icons";
import { Preferences } from "#src/layout/widgets/preferences";

import { useUserStore } from "#src/store";
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
	// Đăng nhập dựa vào userId từ useUserStore
	const { userId } = useUserStore();
	const isLoggedIn = !!userId;

	const {
		token: { colorBgContainer },
	} = theme.useToken();

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
