import type { ButtonProps, MenuProps } from "antd";

import { BasicButton } from "#src/components";
import { UserCircleIcon } from "#src/icons";
import { useAuthStore, useUserStore, usePermissionStore, useTabsStore } from "#src/store";
import { cn, isWindowsOs } from "#src/utils";
import { logoutAndReload } from "#src/utils/app-reset";

import { LogoutOutlined } from "@ant-design/icons";
import { useKeyPress } from "ahooks";
import { Avatar, Dropdown } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function UserMenu({ ...restProps }: ButtonProps) {
	const { addTab, setActiveKey } = useTabsStore();
	const { t } = useTranslation();
	const avatar = useUserStore(state => state.avatar);
	const logout = useAuthStore(state => state.logout);

	const onClick: MenuProps["onClick"] = async ({ key }) => {
		if (key === "logout") {
			// Clear permission store immediately to hide menu during logout transition
			usePermissionStore.getState().reset();
			// Call logout API then hard reset app state + tabs
			await logout();
			logoutAndReload();
		}
		if (key === "personal-center") {
			// Mở tab SPA đúng chuẩn, không đổi URL
			addTab("/personal-center/my-profile", {
				key: "/personal-center/my-profile",
				label: t("common.menu.profile"),
				closable: true,
				draggable: true,
			});
			// Đợi addTab xong mới setActiveKey (bắt buộc dùng setTimeout để tránh trạng thái cũ)
			setTimeout(() => setActiveKey("/personal-center/my-profile"), 0);
		}
	};

	const altView = useMemo(() => isWindowsOs() ? "Alt" : "⌥", [isWindowsOs]);
	const items: MenuProps["items"] = [
		{
			label: t("common.menu.personalCenter"),
			key: "personal-center",
			icon: <UserCircleIcon />,
			extra: `${altView}P`,
		},
		{
			label: t("authority.logout"),
			key: "logout",
			icon: <LogoutOutlined />,
			extra: `${altView}Q`,
		},
	];

	useKeyPress(["alt.P"], () => {
		addTab("/personal-center/my-profile", {
			key: "/personal-center/my-profile",
			label: t("common.menu.profile"),
			closable: true,
			draggable: true,
		});
		setActiveKey("/personal-center/my-profile");
	});

	useKeyPress(["alt.Q"], () => {
		onClick({ key: "logout" } as any);
	});

	return (
		<Dropdown
			menu={{ items, onClick }}
			arrow={false}
			placement="bottomRight"
			trigger={["click"]}
		>
			<BasicButton
				type="text"
				{...restProps}
				className={cn(restProps.className, "rounded-full px-1")}
			>
				<Avatar src={avatar} />
			</BasicButton>
		</Dropdown>
	);
}
