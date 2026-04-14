import React from "react";
import type { MenuProps } from "antd";

import { useCurrentRoute } from "#src/hooks";
import { removeTrailingSlash } from "#src/router/utils";
import { usePermissionStore, useUserStore, useAppStore, useTabsStore } from "#src/store";
import { resolveDevFlag } from "#src/utils/dev-flag";
import { toPermissionBigInt, isSuperPermissionProfile } from "#src/utils/permission-bitfield";

import { getTableData, updateTableData } from "#src/components/csm-grid/CsmApi";
import { csmEncrypt, csmDecrypt } from "#src/components/csm-grid/CsmCrypto";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLayout } from "../hooks";
import { findDeepestFirstItem, findRootMenuByPath, translateMenus, processMenuChildrenVisibility } from "./utils";

/**
 * Logic để xử lý hiển thị menu dựa trên type_menu, type_form, m_show, dev
 * Nếu type_form = 2 (Master-Detail), ẩn menu con (sẽ hiện thành tabs trong grid)
 * Nếu type_menu = 1 (dòng), nhóm 3 menu lại
 */
function autoFixMenu(menus: any[], isDev: boolean = false): any[] {
	// Bước 1: Sắp xếp menu theo tên (DISABLED - giữ order gốc từ API)
	let sorted = [...menus]; // Không sort, giữ order gốc
	// .sort((a, b) => {
	// 	const aLabel = (typeof a.label === 'string' ? a.label : a.name) || "";
	// 	const bLabel = (typeof b.label === 'string' ? b.label : b.name) || "";
	// 	return String(aLabel).localeCompare(String(bLabel));
	// });

	       // Bước 2: Lọc menu dựa vào m_show (nếu không phải dev) và loại bỏ Dynamic Grid
	       if (!isDev) {
		       sorted = sorted.filter(m => m.m_show !== false);
	       }
	       // Loại bỏ menu Dynamic Grid nếu có (theo label hoặc name)
	       sorted = sorted.filter(m => {
		       const label = (typeof m.label === 'string' ? m.label : m.name) || '';
		       return !/dynamic grid/i.test(label);
	       });

	// Bước 3: Xử lý menu con
	const processed = sorted.map(menu => {
		const newMenu = { ...menu };
		
		// Nếu menu không có children, khởi tạo mảng rỗng
		if (!newMenu.children) {
			newMenu.children = [];
		}

		// Xử lý menu con một cách đệ quy
		if (newMenu.children && newMenu.children.length > 0) {
			// Lọc và xử lý menu con
			if (!isDev) {
				newMenu.children = autoFixMenu(
					newMenu.children.filter((m: any) => m.m_show !== false),
					isDev
				);
			} else {
				newMenu.children = autoFixMenu(newMenu.children, isDev);
			}

			// 💡 NOTE: Không xoá children ở đây - để processMenuChildrenVisibility xử lý
			// Vì processMenuChildrenVisibility cần check table_name để quyết định có giữ hay xoá
			// if (Number(newMenu.type_form) === 2) {
			//	 newMenu.children = [];
			// }
		}

		return newMenu;
	});

	// Bước 4: Nhóm menu có type_menu = 1 (kiểu dòng) thành 3 cái một nhóm
	const result: any[] = [];
	let currentGroupId: string | false = false;
	let itemsInGroup = 0;

	processed.forEach((menu) => {
		// Nếu menu có type_menu = 1 (kiểu dòng), thêm vào group
		if (Number(menu.type_menu) === 1) {
			// Nếu chưa có group hoặc group đã có 3 items, tạo group mới
			if (!currentGroupId || itemsInGroup === 3) {
				itemsInGroup = 0;
				const newGroup = {
					...menu,
					id: `${menu.id}_group`,
					children: [menu],
				};
				currentGroupId = newGroup.id;
				result.push(newGroup);
			} else {
				// Thêm vào group hiện tại
				const groupIndex = result.findIndex(item => item.id === currentGroupId);
				if (groupIndex !== -1) {
					result[groupIndex].children.push(menu);
				}
			}
			itemsInGroup++;
		} else {
			// Menu không phải kiểu dòng, thêm bình thường
			currentGroupId = false;
			result.push(menu);
		}
	});

	return result;
}

export function useMenu() {
	const { addTab, setActiveKey } = useTabsStore();
	const wholeMenus = usePermissionStore(state => state.wholeMenus);
	const apiWholeMenus = usePermissionStore(state => state.apiWholeMenus);
	const { isMixedNav, isTwoColumnNav } = useLayout();
	const [rootMenuKey, setRootMenuKey] = useState("");
	const { t, i18n } = useTranslation();
	const appId = useAppStore(state => state.currentAppId);
	
	// Get current language: prefer user preference from backend, fallback to i18n
	// This ensures menu displays in the language selected by the user in system settings
	const currentLanguage = useMemo(() => {
		// Try to get user's language preference from localStorage (set by language selector)
		const savedLanguage = localStorage.getItem('selectedLanguage') as any;
		if (savedLanguage && ['vi', 'en', 'zh'].includes(savedLanguage)) {
			return savedLanguage;
		}
		
		// Fallback to i18n language
		const i18nLang = i18n?.language || 'vi';
		return i18nLang.toLowerCase().startsWith('en') ? 'en' : 
		       i18nLang.toLowerCase().startsWith('zh') ? 'zh' : 'vi';
	}, [i18n?.language]);
	
	// IMPORTANT: Luôn render từ wholeMenus (đã được permission store lọc theo menusPermissions).
	// Không dùng apiWholeMenus để render, vì apiWholeMenus có thể là dữ liệu thô và làm lộ full menu app.
	// apiWholeMenus chỉ dùng làm metadata lookup khi click menu/runtime grid.
	const menusForTranslation = useMemo(() => {
		const sourceMenus = wholeMenus || [];
		if (sourceMenus.length > 0) {
			// Thêm key field, nhưng xoá tất cả fields không cần thiết để không render
			const addKeysAndClean = (menus: any[]): any[] => {
				return menus.map(menu => {
					const cleaned: any = {
						key: menu.path || menu.id || menu.key || "",
						path: menu.path,
						id: menu.id,
						label: menu.label,
						label_vi: menu.label_vi,
						label_en: menu.label_en,
						label_zh: menu.label_zh,
						name: menu.name,
						name_vi: menu.name_vi,
						name_en: menu.name_en,
						name_zh: menu.name_zh,
						icon: menu.icon,
						disabled: menu.disabled,
						children: menu.children,
						// Preserve these for app logic
						table_name: menu.table_name,
						report_name: menu.report_name,
						type_form: menu.type_form,
						auto_code: menu.auto_code,
					};

					if (cleaned.children && cleaned.children.length > 0) {
						cleaned.children = addKeysAndClean(cleaned.children);
					}

					return cleaned;
				});
			};
			const cleanedMenus = addKeysAndClean(sourceMenus);

			// Đảm bảo luôn có menu "Developer" dưới System cho mọi app (frontend-only)
			const ensureSystemDeveloper = (menus: any[]): any[] => {
				const cloned = menus.map(m => ({ ...m }));
				const userState = useUserStore.getState();
				const isDevUser = resolveDevFlag(userState.dev, userState.roles);
				const findByKeyOrId = (items: any[], matcher: (m: any) => boolean): any | null => {
					for (const it of items) {
						if (matcher(it)) return it;
						if (it.children && it.children.length) {
							const found = findByKeyOrId(it.children, matcher);
							if (found) return found;
						}
					}
					return null;
				};

				const systemMenu = findByKeyOrId(cloned, (m) => m.key === '/system' || m.path === '/system' || m.id === 'system');
				// Nếu backend không trả về system menu, nhưng user là dev, chèn system từ wholeMenus
				if (!systemMenu && isDevUser) {
					const fallbackSystem = (wholeMenus || []).find(m => m.key === '/system' || (m as any).path === '/system' || (m as any).id === 'system');
					if (fallbackSystem) {
						cloned.push({ ...fallbackSystem });
					}
				}
				const systemMenuResolved = findByKeyOrId(cloned, (m) => m.key === '/system' || m.path === '/system' || m.id === 'system');
				const targetSystem = systemMenuResolved || systemMenu;
				   // Sau khi chắc chắn có system, thêm Developer cho dev user
				   if (targetSystem && isDevUser) {
					   const hasDeveloper = (targetSystem.children || []).some((c: any) => c.key === '/system/developer' || c.path === '/system/developer');
					   if (!hasDeveloper) {
						   if (!targetSystem.children) targetSystem.children = [];
						   targetSystem.children.push({
							   key: '/system/developer',
							   path: '/system/developer',
							   id: 'system_developer',
							   label: 'common.menu.developer',
							   icon: undefined,
							   children: [],
							   // App logic fields (kept for consistency)
							   table_name: undefined,
							   report_name: undefined,
							   type_form: undefined,
						   });
					   }
				   }

				   // Không thêm menu AutoSetup thủ công ở đây, chỉ lấy từ store/permission.ts (đã kiểm tra môi trường desktop và auto_code)
				return cloned;
			};

			return ensureSystemDeveloper(cleanedMenus);
		}
		return sourceMenus;
	}, [wholeMenus]);
	
	const translatedMenus = useMemo(() => {
		return translateMenus(menusForTranslation, t, currentLanguage);
	}, [menusForTranslation, t, currentLanguage]);

		// Xác định quyền dev/admin từ user store
		const isDev = useUserStore(state => resolveDevFlag(state.dev, state.roles));
		const isAdmin = useUserStore(state => {
			const permissionBits = toPermissionBigInt((state as any).permissionBitfield);
			return !isDev && isSuperPermissionProfile(permissionBits);
		});

	const { pathname } = useCurrentRoute();
	/**
	 * 混合菜单模式下需要拆分 menu 的 items
	 */
	const shouldSplitMenuItems = useMemo(
		() => isMixedNav || isTwoColumnNav,
		[isMixedNav, isTwoColumnNav],
	);

	// Áp dụng logic autoFixMenu vào translatedMenus
	const processedMenus = useMemo(() => {
		// Ẩn hoàn toàn menu hệ thống (/system) chỉ với user không có quyền dev/admin
		const canSeeSystemMenus = isDev || isAdmin;
		const filteredForDev = !canSeeSystemMenus
			? translatedMenus.filter(item => item?.key !== '/system' && item?.path !== '/system' && item?.id !== 'system')
			: translatedMenus;

		const filteredForRole = filteredForDev;

		const result = autoFixMenu(filteredForRole, isDev);
		const preserveMenuIds = (items: any[]): any[] => {
			return items.map(item => {
				const processed = { ...item };
				if (!processed.menuId && item.id) {
					processed.menuId = item.id;
				}
				if (processed.children && processed.children.length > 0) {
					processed.children = preserveMenuIds(processed.children);
				}
				return processed;
			});
		};
		const withPreservedIds = preserveMenuIds(result);
		const finalResult = processMenuChildrenVisibility(withPreservedIds);
		const menuDataMap = new Map<string, any>();
		const cleanupMenuItems = (items: any[]): any[] => {
			return items.map(item => {
				menuDataMap.set(item.key, item);
				const cleaned: any = {
					key: item.key,
					label: item.label,
					id: item.id,
					menuId: item.menuId || item.id,
					path: item.path,
					type_form: item.type_form,
					table_name: item.table_name,
					report_name: item.report_name,
					auto_code_name: item.auto_code_name,
					auto_code: item.auto_code,
					kanban_config: item.kanban_config,
					trigger: item.trigger,
				};
				if (item.icon && typeof item.icon !== 'string') {
					cleaned.icon = item.icon;
				}
				if (item.disabled === true) {
					cleaned.disabled = item.disabled;
				}
				if (item.children && item.children.length > 0) {
					cleaned.children = cleanupMenuItems(item.children);
				}
				return cleaned;
			});
		};
		const cleanedMenus = cleanupMenuItems(finalResult);
		return cleanedMenus;
	}, [translatedMenus, isDev, isAdmin, currentLanguage]);

	/* 混合菜单模式下需要拆分 menu 的 items */
	const splitSideNavItems = useMemo(
		() => {
			const foundMenu = processedMenus.find(item => item?.key === rootMenuKey);
			if (!foundMenu) {
				return [];
			}
			return foundMenu?.children ?? [foundMenu];
		},
		[rootMenuKey, processedMenus],
	);

	/**
	 * 头部菜单
	 */
	const topNavItems = useMemo(() => {
		if (!shouldSplitMenuItems) {
			return processedMenus;
		}
		return processedMenus.map((item) => {
			return {
				...item,
				/* children 为空数组，无法触发 menu 的 onSelect 事件 */
				children: undefined,
			};
		});
	}, [shouldSplitMenuItems, processedMenus]);

	/**
	 * 侧边菜单
	 */
	const sideNavItems = useMemo(() => {
		return shouldSplitMenuItems ? splitSideNavItems : processedMenus;
	}, [shouldSplitMenuItems, splitSideNavItems, processedMenus]);

	// Runtime helpers to execute auto setup scripts (sys_autos.p_code)
	const autoRuntime = useMemo(() => {
		return {
			app_id: appId,
			csm_encrypt: (code: string) => csmEncrypt(code),
			csm_decrypt: (code: string) => csmDecrypt(code),
			csm_obj_tables: (params: any, fn?: (res: any) => void) => {
				getTableData<any>({
					app_id: params?.app_id || appId,
					obj_name: params?.obj_name,
					where: params?.e_where || params?.where,
					take: params?.take,
					lastkey: params?.lastkey,
				})
					.then(res => {
						const rows = (res as any)?.rows ?? (res as any)?.data ?? [];
						fn?.({ success: true, rows, raw: res });
					})
					.catch(error => {
						fn?.({ success: false, error: (error as any)?.message || error });
					});
			},
			csm_obj_updates: (params: any, fn?: (res: any) => void) => {
				if (!params?.obj_name) {
					fn?.({ success: false, error: "Missing obj_name" });
					return;
				}
				updateTableData<any>({
					app_id: params?.app_id || appId,
					obj_name: params?.obj_name,
					command: (params?.command as any) || "update",
					obj_update: params?.obj_update || params?.obj || {},
					pk_fields: params?.pk_fields,
					where: params?.e_where || params?.where,
				} as any)
					.then(res => fn?.(res))
					.catch(error => fn?.({ success: false, error: (error as any)?.message || error }));
			},
		};
	}, [appId]);

	const executeAutoMenuCode = (autoCode: string) => {
		if (!autoCode) return;
		try {
			const runtimeContext = { ...autoRuntime, auto_code: autoCode } as any;
			if (typeof window !== "undefined") {
				const proc: any = (window as any).process;
				if (proc && typeof proc.setMaxListeners === "function") {
					proc.setMaxListeners(0);
				}
			}
			const fn = new Function("seft", `try{\n${autoCode}\n} catch (sca_err) {console.error(sca_err); alert(sca_err);}`);
			fn(runtimeContext);
		} catch (error) {
			alert(error instanceof Error ? error.message : String(error));
		}
	};

	/**
	 * 菜单点击事件处理
	 */
	const handleMenuSelect = (key: string, mode: MenuProps["mode"]) => {
		// Home: luôn dùng 'homepage' làm key
		// SPA: Nếu là các route tĩnh hệ thống thì luôn mở tab
		const staticTabRoutes: Record<string, string> = {
			"/personal-center/my-profile": t("common.menu.profile"),
			"/personal-center/settings": t("common.menu.settings"),
			"/auto-setup": t("common.menu.auto") || "Auto Setup",
			// /system/user, /system/dept, /system/departments, /system/branches
			// KHÔNG được đưa vào đây — phải đi qua fallback dynamic để patch CsmDynamicGrid
			"/system/menu": t("common.menu.menu"),
			"/system/developer": t("common.menu.developer"),
			"/system/broadcast": t("common.menu.broadcast"),
			"/about": t("common.menu.about"),
			"/route-nest/menu1": "Menu 1",
			"/route-nest/menu1/menu1-1": "Menu 1-1",
			"/route-nest/menu1/menu1-2": "Menu 1-2",
			"/route-nest/menu2": "Menu 2",
			"homepage": t("common.menu.home"),
		};
		if (staticTabRoutes[key]) {
			addTab(key, {
				key,
				label: staticTabRoutes[key],
				closable: key !== "homepage",
				draggable: key !== "homepage",
			});
			setActiveKey(key);
			return;
		}
		let normalizedKey = key;
		if (key === "homepage") {
			normalizedKey = "homepage";
			addTab("homepage", {
				key: "homepage",
				label: t("common.menu.home"),
				closable: false,
				draggable: false,
			});
			setActiveKey("homepage");
			return;
		}

				// ĐÃ XOÁ fallback cứng table_name cho /system/user,... Chỉ lấy menuData đúng từ apiWholeMenus/store, quyền dev/admin xử lý ở tầng store/permission.ts
		
		// 💡 Find menu in processedMenus first to get menuId (original ID before autoFixMenu transform)
		const findMenuInProcessedMenus = (menus: any[], targetKey: string): any => {
			for (const menu of menus) {
				if (menu.key === targetKey) {
					return menu;
				}
				if (menu.children && menu.children.length > 0) {
					const found = findMenuInProcessedMenus(menu.children, targetKey);
					if (found) return found;
				}
			}
			return null;
		};
		
		const selectedProcessedMenu = findMenuInProcessedMenus(processedMenus, normalizedKey);
		const menuIdToSearch = selectedProcessedMenu?.menuId || selectedProcessedMenu?.id || normalizedKey;
		const legacyMenuIdFromKey = (() => {
			const m = String(normalizedKey || "").match(/^\/system\/([^/?#]+).*$/);
			return m?.[1] ? String(m[1]) : "";
		})();
		const menuIdSegmentFromKey = (() => {
			const m = String(normalizedKey || "").match(/(?:^|\/)(menu_[A-Za-z0-9_]+)(?:[/?#]|$)/);
			return m?.[1] ? String(m[1]) : "";
		})();
		

		   // Find the menu in API menus (which have table_name, report_name fields)
		   const findMenuInTree = (menus: any[], targetId: string, targetKey?: string): any => {
			   for (const menu of menus) {
				   const menuId = String(menu?.id || "");
				   const menuKey = String(menu?.key || "");
				   const menuPath = String(menu?.path || "");
				   const normalizedTargetId = String(targetId || "");
				   const normalizedTargetKey = String(targetKey || "");
				   if (
					   menuId === normalizedTargetId
					   || menuKey === normalizedTargetKey
					   || menuPath === normalizedTargetKey
					   || (normalizedTargetId && menuPath === `/system/${normalizedTargetId}`)
				   ) {
					   return menu;
				   }
				   if (menu.children && menu.children.length > 0) {
					   const found = findMenuInTree(menu.children, targetId, targetKey);
					   if (found) return found;
				   }
				   if (menu.nodes && menu.nodes.length > 0) {
					   const found = findMenuInTree(menu.nodes, targetId, targetKey);
					   if (found) return found;
				   }
			   }
			   return null;
		   };

		   let selectedApiMenu = (
			   findMenuInTree(apiWholeMenus, String(menuIdToSearch || ""), normalizedKey)
			   || (legacyMenuIdFromKey ? findMenuInTree(apiWholeMenus, legacyMenuIdFromKey, normalizedKey) : null)
			   || (menuIdSegmentFromKey ? findMenuInTree(apiWholeMenus, menuIdSegmentFromKey, normalizedKey) : null)
		   ) as any;
		   if (!selectedApiMenu && selectedProcessedMenu) {
			   selectedApiMenu = selectedProcessedMenu;
		   }

		   // Fallback menu hệ thống: chỉ áp dụng cho nhóm path legacy cần ép m_configs.
		   // Không apply toàn bộ /system/* để tránh ghi đè các submenu hệ thống có config riêng từ API.
		   const legacySystemFallbackPaths = new Set([
			   "/system/user",
			   "/system/dept",
			   "/system/departments",
			   "/system/branches",
			   "/system/role",
			   "/system/roles",
		   ]);
		   if (legacySystemFallbackPaths.has(normalizedKey)) {
			   const userState = useUserStore.getState();
			   const isDev = resolveDevFlag(userState.dev, userState.roles);
			   const systemMenuFallbacks: Record<string, { label: string; table_name: string; type_form: number }> = {
				   "/system/user": { label: t("common.menu.user"), table_name: isDev ? "csm_accounts" : "csm_group_members", type_form: 1 },
				   "/system/dept": { label: t("common.menu.permissionGroup"), table_name: "csm_roles", type_form: 1 },
				   "/system/role": { label: t("common.menu.permissionGroup"), table_name: "csm_roles", type_form: 1 },
				   "/system/roles": { label: t("common.menu.permissionGroup"), table_name: "csm_roles", type_form: 1 },
				   "/system/departments": { label: t("common.menu.dept"), table_name: "csm_depts", type_form: 1 },
				   "/system/branches": { label: t("common.menu.branch"), table_name: "csm_branches", type_form: 1 }
			   };
			   const fallback = systemMenuFallbacks[normalizedKey] || {
				   label: normalizedKey.replace("/system/", "System: "),
				   table_name: "",
				   type_form: 1,
			   };
			   let finalMenuData = selectedApiMenu;
			   if (!finalMenuData) {
				   finalMenuData = {
					   key: normalizedKey,
					   label: fallback.label,
					   table_name: fallback.table_name,
					   type_form: fallback.type_form,
					   id: normalizedKey,
				   };
			   } else {
				   if (!finalMenuData.table_name) finalMenuData.table_name = fallback.table_name;
				   if (!finalMenuData.type_form) finalMenuData.type_form = fallback.type_form;
				   if (!finalMenuData.label) finalMenuData.label = fallback.label;
			   }
			   // addTab với path gốc (normalizedKey) + menuData đầy đủ
			   // LayoutContent sẽ merge tab + route và patchDynamicRoutesWithComponent trả về đúng component
			   // AdminPage đọc activeTab?.menuData từ Zustand để lấy table_name, type_form
			   addTab(normalizedKey, {
				   key: normalizedKey,
				   label: finalMenuData.label || fallback.label,
				   closable: true,
				   draggable: true,
				   menuData: finalMenuData,
				   table_name: finalMenuData.table_name,
				   type_form: finalMenuData.type_form,
			   });
			   setActiveKey(normalizedKey);
			   return;
		   }

		   const hasRuntimePayload = !!(
			   selectedApiMenu && (
				   selectedApiMenu.table_name
				   || selectedApiMenu.report_name
				   || selectedApiMenu.auto_code_name
				   || selectedApiMenu.auto_code
				   || selectedApiMenu.kanban_config
				   || selectedApiMenu?.trigger?.load_db
				   || selectedApiMenu?.trigger?.report_db
				   || Number(selectedApiMenu.type_form) === 4
				   || Number(selectedApiMenu.type_form) === 6
			   )
		   );

		   if (selectedApiMenu && hasRuntimePayload) {
			   const runtimeMenuId = String(selectedApiMenu.id || selectedApiMenu.key || selectedProcessedMenu?.menuId || selectedProcessedMenu?.id || menuIdToSearch || menuIdSegmentFromKey || "").trim();
			   if (runtimeMenuId) {
				   const dynamicPath = `/system/grid/${runtimeMenuId}`;
				   const dynamicLabel = selectedApiMenu.label || selectedApiMenu.title || selectedProcessedMenu?.label || "Dynamic Menu";
				   useUserStore.getState().setSelectedMenuIdForTab(runtimeMenuId);
				   addTab(dynamicPath, {
					   key: dynamicPath,
					   label: String(dynamicLabel).replace(/^.*?\.\s+/, '').trim(),
					   closable: true,
					   draggable: true,
					   menuId: runtimeMenuId,
					   menuData: selectedApiMenu,
					   m_configs: selectedApiMenu,
					   type_form: selectedApiMenu.type_form,
					   table_name: selectedApiMenu.table_name,
					   report_name: selectedApiMenu.report_name,
					   kanban_config: selectedApiMenu.kanban_config,
					   auto_code_name: selectedApiMenu.auto_code_name,
					   auto_code: selectedApiMenu.auto_code,
				   });
				   setActiveKey(dynamicPath);
				   return;
			   }
		   }

	   // Dynamic link chỉ chạy khi là pure-link.
		   if (selectedApiMenu && Number(selectedApiMenu.type_form) === 3) {
			   const linkUrl = selectedApiMenu.dynamic_link_url || selectedApiMenu.v_link || "";
			   if (!linkUrl) {
				   console.warn('[DYNAMIC_LINK] Menu has no link URL configured:', selectedApiMenu);
				   return;
			   }
			   if (/^https?:/.test(linkUrl)) {
				   window.open(linkUrl, '_blank');
			   } else {
				   addTab(linkUrl, {
					   key: linkUrl,
					   label: selectedApiMenu.label,
					   closable: true,
					   draggable: true,
				   });
				   setActiveKey(linkUrl);
			   }
			   return;
		   }

		   // Legacy fallback: key kiểu menu_xxx vẫn phải mở runtime grid.
		   if (!selectedApiMenu && menuIdSegmentFromKey) {
			   const dynamicPath = `/system/grid/${menuIdSegmentFromKey}`;
			   useUserStore.getState().setSelectedMenuIdForTab(menuIdSegmentFromKey);
			   addTab(dynamicPath, {
				   key: dynamicPath,
				   label: String(selectedProcessedMenu?.label || selectedProcessedMenu?.title || menuIdSegmentFromKey),
				   closable: true,
				   draggable: true,
				   menuId: menuIdSegmentFromKey,
			   });
			   setActiveKey(dynamicPath);
			   return;
		   }

		   // External link fallback
		   if (/^https?:/.test(normalizedKey)) {
			   window.open(normalizedKey, '_blank');
			   return;
		   }

		   addTab(normalizedKey, {
			   key: normalizedKey,
			   label: String(selectedProcessedMenu?.label || normalizedKey),
			   closable: true,
			   draggable: true,
		   });
		   setActiveKey(normalizedKey);
		   return;
	};

	/**
	 * 混合导航模式下，侧边导航的展示
	 */
	useEffect(() => {
		if (shouldSplitMenuItems) {
			const { rootMenuPath } = findRootMenuByPath(processedMenus, removeTrailingSlash(pathname));
			if (rootMenuPath) {
				setRootMenuKey(rootMenuPath);
			}
		}
	}, [shouldSplitMenuItems, pathname, processedMenus]);

	/**
	 * Sync language to localStorage when i18n language changes
	 * This ensures menu will display in the correct language after navigation or page refresh
	 */
	useEffect(() => {
		if (i18n?.language) {
			// Only save if it's a supported language
			const lang = i18n.language.toLowerCase().startsWith("en") ? "en" : 
			             i18n.language.toLowerCase().startsWith("zh") ? "zh" : "vi";
			if (lang !== localStorage.getItem('selectedLanguage')) {
				localStorage.setItem('selectedLanguage', lang);
			}
		}
	}, [i18n?.language]);

	return {
		handleMenuSelect,
		topNavItems,
		sideNavItems,
	};
}
