import AdminPage from "../admin";

/**
 * User management page - delegates to AdminPage for dynamic grid rendering
 * AdminPage will load menu config from backend based on menuId="user"
 */
export default function User() {
	return <AdminPage />;
}
