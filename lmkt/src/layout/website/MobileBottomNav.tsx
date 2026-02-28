import React from "react";
import styles from "./websiteLayout.module.css";
import { useWebsiteMenu } from "./wu_menu";
import { Preferences } from "#src/layout/widgets/preferences";
import { useTranslation } from "react-i18next";

interface MobileBottomNavProps {
  selectedKey?: string;
}

export default function MobileBottomNav({ selectedKey }: MobileBottomNavProps) {
  const menu = useWebsiteMenu();
  const { t } = useTranslation();
  // Chỉ lấy các mục menu cha
  const parentMenuItems = menu;
  const isSettingsActive = selectedKey === 'preferences';
  return (
    <nav className={styles.mobileBottomNav}>
      {parentMenuItems.map(item => {
        const isActive = selectedKey === item.path || item.children?.some((child: { path?: string }) => child.path === selectedKey);
        return <a
          key={item.key}
          href={item.path}
          className={`${styles.mobileBottomNavItem} ${isActive ? styles.mobileBottomNavItemActive : ''}`}
        >
          <span className={styles.mobileBottomNavIcon}>{item.icon}</span>
        </a>
      })}
      {/* Thêm nút cài đặt hệ thống */}
      <div className={`${styles.mobileBottomNavItem} ${isSettingsActive ? styles.mobileBottomNavItemActive : ''}`}>
        <Preferences className={styles.mobileBottomNavIcon} />
      </div>
    </nav>
  );
}
