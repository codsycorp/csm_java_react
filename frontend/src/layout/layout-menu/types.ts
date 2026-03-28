/**
 * 菜单项目类型 - Extended with multilingual and data configuration support
 */
export interface MenuItemType {
	/**
	 * 菜单 ID (唯一标志) - Required for Ant Design Menu
	 */
	key: string
	/**
	 * 菜单 ID (alternate field)
	 */
	id?: string
	/**
	 * 菜单项标题
	 */
	label?: React.ReactNode | string
	/**
	 * Multilingual labels
	 */
	label_en?: string // English
	label_zh?: string // Chinese
	/**
	 * Menu names (internal/route names)
	 */
	name?: string // Vietnamese
	name_en?: string // English
	name_zh?: string // Chinese
	/**
	 * 子菜单的菜单项 - Must be array or undefined (not nullable)
	 */
	children?: MenuItemType[]
	/**
	 * Alias for children (nodes from API)
	 */
	nodes?: MenuItemType[]
	/**
	 * 菜单图标
	 */
	icon?: React.ReactNode
	/**
	 * 是否禁用菜单
	 * @default false
	 */
	disabled?: boolean
	/**
	 * Route and component info
	 */
	path?: string
	component?: string
	/**
	 * Data configuration
	 */
	table_name?: string
	report_name?: string
	table?: any[]
	trigger?: Record<string, any>
	config?: string
	crm_config?: Record<string, any> | string
	system_user_modes?: Record<string, any> | string
	/**
	 * Menu configuration
	 */
	type_menu?: number | string // 0=Column, 1=Row
	type_form?: number | string // 1=Table, 2=Master-Detail, 3=Dynamic Link, 4=Dynamic Code, 6=Kanban Board
	row_type_edit?: number | string // 0=Popup, 1=Inline
	/**
	 * Display configuration
	 */
	order?: number
	status?: 0 | 1
	hideInMenu?: number
	keepAlive?: number
	currentActiveMenu?: string
	iframeLink?: string
	externalLink?: string
	/**
	 * Visibility and dev flags
	 */
	m_show?: boolean
	dev?: string | boolean
	/**
	 * Additional configuration fields
	 */
	prefix_pk?: string
	p_width?: number | string
	p_height?: number | string
	orientation?: string
	g_readonly?: boolean
	field_root?: string
	/**
	 * Allow additional properties for API compatibility
	 */
	[key: string]: any
}
