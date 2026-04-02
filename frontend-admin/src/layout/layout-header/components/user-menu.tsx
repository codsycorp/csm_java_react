import type { ButtonProps, MenuProps } from "antd";

import { BasicButton } from "#src/components";
import { UserCircleIcon } from "#src/icons";
import { useAuthStore, useUserStore, usePermissionStore } from "#src/store";
import { cn, isWindowsOs } from "#src/utils";

import { LogoutOutlined } from "@ant-design/icons";
import { useKeyPress } from "ahooks";
import { Avatar, Dropdown } from "antd";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

export function UserMenu({ ...restProps }: ButtonProps) {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const avatar = useUserStore(state => state.avatar);
	const logout = useAuthStore(state => state.logout);

	const onClick: MenuProps["onClick"] = async ({ key }) => {
		if (key === "logout") {
			// Check if currently in admin area
			const currentPath = window.location.pathname;
			const isInAdmin = currentPath.includes("/home") || currentPath.includes("/system") || currentPath.includes("/personal-center");
			
			// Clear permission store NGAY LẬP TỨC để xóa menu
			usePermissionStore.getState().reset();
			
			// Call logout API
			await logout();
			
			// Force reload to login page to completely unmount everything
			const loginUrl = isInAdmin ? "/login?redirect=admin" : "/login";
			window.location.href = loginUrl;
		}
		if (key === "personal-center") {
			navigate("/personal-center/my-profile");
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
		navigate("/personal-center/my-profile");
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
