import { Scrollbar } from "#src/components";

import { theme } from "antd";
import { useContext } from "react";

import { LayoutContext } from "../container-layout/layout-context";
import { Logo, SiderTrigger } from "../widgets";

export interface LayoutSidebarProps {
	children?: React.ReactNode
	computedSidebarWidth: number
}

export default function LayoutSidebar({ children, computedSidebarWidth }: LayoutSidebarProps) {
	const { sidebarCollapsed } = useContext(LayoutContext);
	const {
		token: { colorBgContainer },
	} = theme.useToken();

	return (
		<aside
			style={
				{
					// 一个像素的 border
					width: computedSidebarWidth + 1,
					backgroundColor: colorBgContainer,
					boxShadow: "var(--csm-layout-edge-shadow)",
				}
			}
			className="fixed left-0 top-0 bottom-0 transition-all overflow-y-auto overflow-x-hidden border-r border-r-colorBorderSecondary"
		>
			<Logo sidebarCollapsed={sidebarCollapsed} />
			<div className="overflow-hidden" style={{ height: "calc(100% - 48px - 40px)" }}>
				<Scrollbar>
					{children}
				</Scrollbar>
			</div>
			<SiderTrigger />
		</aside>
	);
}
