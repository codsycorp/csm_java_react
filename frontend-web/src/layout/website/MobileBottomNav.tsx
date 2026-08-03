import React from "react";
import styles from "./websiteLayout.module.css";
import { useWebsiteMenu } from "./wu_menu";
import { useUserStore } from "#src/store";
import { useAuthStore } from "#src/store";
import { LoginOutlined, UserOutlined, SettingOutlined } from "@ant-design/icons";
import { Preferences } from "#src/layout/widgets/preferences";
import { Dropdown, Button } from "antd";
import { useTranslation } from "react-i18next";

interface MobileBottomNavProps {
  selectedKey?: string;
}

export default function MobileBottomNav({ selectedKey }: MobileBottomNavProps) {
  const menu = useWebsiteMenu();
  const { t } = useTranslation();
  // Đăng nhập dựa vào userId từ useUserStore
  const { userId } = useUserStore();
  const isLoggedIn = !!userId;

  // Chỉ lấy các mục menu cha
  const parentMenuItems = menu;

  const userMenuItems = [
    {
      key: "logout",
      label: t("website.menu.logout", "Đăng xuất"),
      icon: <LoginOutlined />,
      onClick: () => {
        useAuthStore.getState().logout();
        window.location.href = "/";
      },
    },
    {
      key: "admin",
      label: <a href="/home">{t("website.menu.goToAdmin", "Vào Admin")}</a>,
      icon: <SettingOutlined />,
    },
  ];
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
      {/* Thêm nút Đăng nhập hoặc menu người dùng */}
      {isLoggedIn ? (
        <Dropdown
          menu={{ items: userMenuItems }}
          placement="topCenter"
          arrow
          trigger={["click"]}
        >
          <div className={styles.mobileBottomNavItem}>
            <span className={styles.mobileBottomNavIcon}><UserOutlined /></span>
          </div>
        </Dropdown>
      ) : (
        <a
          href="/login"
          className={styles.mobileBottomNavItem}
        >
          <span className={styles.mobileBottomNavIcon}>
            <LoginOutlined />
          </span>
        </a>
      )}
    </nav>
  );
}
