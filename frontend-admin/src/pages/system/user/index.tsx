import { useTabsStore } from "#src/store";
import AdminPage from "../admin";

/**
 * User management page - delegates to AdminPage for dynamic grid rendering.
 * Always pass menuId="user" so AdminPage can detect isSystemUserRoute=true
 * and apply correct table (csm_accounts for dev, csm_group_members for admin).
 * Also forward menuData/m_configs from the current tab to preserve props stability.
 */
export default function User() {
	const openTabs = useTabsStore(state => state.openTabs);
	const tabData = openTabs.get("/system/user") as any;
	return (
		<AdminPage
			menuId="user"
			menuData={tabData?.menuData || { path: "/system/user", id: "user" }}
			m_configs={tabData?.m_configs || tabData?.menuData}
		/>
	);
}
