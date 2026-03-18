export interface MenuItemType {
	parentId?: string // 上级菜单 id
	id: string // 菜单 id
	menuType?: 0 | 1 | 2 | 3 // 菜单类型（0 代表菜单、1 代表 iframe、2 代表外链、3 代表按钮）
	name?: string // 菜单名称 (VI)
	name_en?: string // Menu name (EN)
	name_zh?: string // 菜单名称 (ZH)
	label?: string // 菜单标签（用于显示） (VI)
	label_en?: string // Menu label (EN)
	label_zh?: string // 菜单标签 (ZH)
	path?: string // 路由路径
	component?: string // 组件路径
	order?: number // 菜单顺序
	icon?: string // 菜单图标
	m_icons?: string // 菜单图标（备选）
	currentActiveMenu?: string // 激活路径
	iframeLink?: string // iframe 链接
	v_link?: string // 链接地址
	keepAlive?: number // 是否缓存页面
	externalLink?: string // 外链地址
	hideInMenu?: number // 是否在菜单中隐藏
	ignoreAccess?: number // 是否忽略权限
	status?: 1 | 0 // 状态（0 停用、1 启用）
	m_show?: boolean // 是否显示
	createTime?: number
	updateTime?: number
	config?: string // Vue-style JSON config (table/trigger/etc.)
	table_name?: string // 表名称
	table?: any[] // 表字段定义
	nodes?: MenuItemType[] // 子菜单列表
	children?: MenuItemType[] // 子菜单列表（别名）
	trigger?: Record<string, any> // 触发器配置
	type_menu?: number | string // 菜单排列类型（0: 列式, 1: 行式）
	type_form?: number | string // 表格展示类型（1: 表格模式, 2: Master-Detail模式, 3: 动态链接, 4: 动态代码, 5: CRM Workspace）
	row_type_edit?: number | string // 行编辑类型（0: 表单弹窗, 1: 行内编辑）
	dev?: string | boolean // 开发者模式
	prefix_pk?: string // 创建ID时的前缀
	p_width?: number | string // 页面宽度
	p_height?: number | string // 页面高度
	orientation?: string // 打印方向（p: 竖, l: 横）
	report_name?: string // 报告名称
	g_readonly?: boolean // 只读模式
	field_root?: string // Master-Detail 根字段
	auto_code_name?: string // 动态代码模板名称 (p_name from sys_autos where p_type=0)
	dynamic_link_url?: string // 动态链接地址
	crm_config?: Record<string, any> | string // CRM workspace configuration JSON
	[key: string]: any // 允许其他字段
}
