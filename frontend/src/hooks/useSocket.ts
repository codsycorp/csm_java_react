/**
 * useSocket - Hook để kết nối và lắng nghe SocketIO events từ backend
 * Tự động reconnect và handle các event real-time
 */

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// Minimal legacy Socket.IO v2 client shape used by this hook
type LegacySocket = {
	id?: string;
	on: (event: string, cb: (...args: any[]) => void) => any;
	off?: (event: string, cb: (...args: any[]) => void) => any;
	emit: (event: string, ...args: any[]) => any;
	disconnect: () => void;
};
import { useAppStore, useUserStore } from "#src/store";

interface SocketUpdateEvent {
	appId: string; // App ID của table này thuộc về
	table: string;
	action: "create" | "update" | "delete";
	primaryKeys: Record<string, any>;
	dataRow?: Record<string, any>;
}

interface UseSocketOptions {
	enabled?: boolean;
	onUpdate?: (event: SocketUpdateEvent) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
	const { enabled = true, onUpdate } = options;
	const socketRef = useRef<LegacySocket | null>(null);
	const [connected, setConnected] = useState(false);
	const currentAppId = useAppStore((state) => state.currentAppId);
	const userAppId = useUserStore((state) => state.app_id);
	
	const appId = (userAppId && userAppId.trim())
		|| (currentAppId && currentAppId.trim())
		|| useAppStore.getState().getCurrentAppId();
	const isAdmin = useUserStore((state) => !!state.roles?.includes("admin") || !!state.dev);

	// Keep latest onUpdate without recreating socket listeners
	const onUpdateRef = useRef<typeof onUpdate>();
	useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
	useEffect(() => {
		const envRealtimeUrl = import.meta.env.VITE_REALTIME_BASE_URL;
		const apiUrl = envRealtimeUrl?.trim().replace(/\/$/, "");
		console.log(`[Socket] 🔌 useSocket init - enabled: ${enabled}, apiUrl: ${apiUrl}, appId: ${appId}`);
		
		if (!enabled || !apiUrl) {
			console.log(`[Socket] ⛔ Socket disabled or no apiUrl`);
			return;
		}

		if (socketRef.current) {
			console.log(`[Socket] ⚠️ Socket already exists, skipping reconnection`);
			return;
		}

		console.log(`[Socket] 🔗 Creating new socket connection to ${apiUrl}`);
		const socket = io(apiUrl, {
			transports: ["websocket", "polling"],
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			reconnectionAttempts: 5,
		});

		socketRef.current = socket;

		socket.on("connect", () => {
			console.log(`[Socket] ✅ Connected! Socket ID: ${socket.id}`);
			setConnected(true);
			if (appId) {
				socket.emit("join_room", appId);
				console.log(`[Socket] 📍 Attempting to join room: ${appId}`);
			}
			if (isAdmin) {
				socket.emit("join_room", "csm");
				console.log(`[Socket] 👑 Admin/Dev detected. Joining admin room 'csm'.`);
			}
		});

		socket.on("disconnect", (reason) => {
			setConnected(false);
		});

		socket.on("connect_error", (error) => {
			console.error('[Socket] Connection error:', error);
		});

		console.log('[Socket] 🔧 Registering csm_msg_update listener');
		socket.on("csm_msg_update", (data: SocketUpdateEvent) => {
			console.log('[Socket Global] 🎯 Received update:', data);
			
			// 🔥 CRITICAL: Accept updates for all tables - system tables (sys_, csm_, wu_) and app-specific tables
			// The store's setTableData() will only update if the table exists in currentTableData
			const isSystemTable = data.table?.startsWith('sys_') || data.table?.startsWith('csm_') || data.table?.startsWith('wu_');
			const belongsToCurrentApp = data.appId === appId;
			const shouldProcess = isSystemTable || belongsToCurrentApp;
			
			if (!shouldProcess) {
				console.log(`[Socket Global] ⏭️ Skipping update: table '${data.table}' belongs to app '${data.appId}', current app is '${appId}'`);
				return;
			}
			
			console.log(`[Socket Global] ✅ Processing update for ${isSystemTable ? 'system table' : 'app table'} '${data.table}'`);
			
			if (data.table) {
				const currentTableData = useAppStore.getState().database[data.table];
				if (currentTableData) {
					const pkFields = currentTableData.fieldsPK || ['id'];
					let updatedRows = [...(currentTableData.rows || [])];

					const getRowId = (row: Record<string, any> | undefined | null) => {
						if (!row) return null;
						const id = row.id;
						return id !== undefined && id !== null ? String(id) : null;
					};

					const getPkValues = (row: Record<string, any> | undefined | null) => {
						if (!row) return null;
						const values: Record<string, any> = {};
						pkFields.forEach(pk => {
							if (row[pk] !== undefined) {
								values[pk] = row[pk];
							}
						});
						return Object.keys(values).length ? values : null;
					};

					const primaryKeyMatch = (row: Record<string, any>, pkValues: Record<string, any> | null) => {
						if (!pkValues) return false;
						return pkFields.every(pk => row[pk] === pkValues[pk]);
					};

					const eventRowId = getRowId(data.dataRow) ?? (data.primaryKeys?.id != null ? String(data.primaryKeys.id) : null);
					const eventPkValues = data.primaryKeys || getPkValues(data.dataRow);
					const findIndexById = () => (eventRowId ? updatedRows.findIndex(r => getRowId(r) === eventRowId) : -1);

					if (data.action === 'create') {
						if (data.dataRow) {
							const idxById = findIndexById();
							if (idxById === -1) {
								updatedRows.push(data.dataRow);
								console.log(`[Socket Global] ✅ Inserted row to ${data.table}`);
							} else {
								updatedRows[idxById] = { ...updatedRows[idxById], ...data.dataRow };
								console.log(`[Socket Global] ✅ Merged row in ${data.table} (create->merge)`);
							}
						}
					} else if (data.action === 'update') {
						if (data.dataRow) {
							const idxById = findIndexById();
							if (idxById !== -1) {
								updatedRows[idxById] = { ...updatedRows[idxById], ...data.dataRow };
								console.log(`[Socket Global] ✅ Updated row in ${data.table} by id`);
							} else if (eventPkValues) {
								const idxByPk = updatedRows.findIndex(row => primaryKeyMatch(row, eventPkValues));
								if (idxByPk !== -1) {
									updatedRows[idxByPk] = { ...updatedRows[idxByPk], ...data.dataRow };
									console.log(`[Socket Global] ✅ Updated row in ${data.table} by pk`);
								} else {
									updatedRows.push(data.dataRow);
									console.log(`[Socket Global] ✅ Inserted row to ${data.table} (update fallback)`);
								}
							} else {
								updatedRows.push(data.dataRow);
								console.log(`[Socket Global] ✅ Inserted row to ${data.table} (update fallback no keys)`);
							}
						}
					} else if (data.action === 'delete') {
						if (eventRowId) {
							updatedRows = updatedRows.filter(row => getRowId(row) !== eventRowId);
							console.log(`[Socket Global] ✅ Deleted row from ${data.table} by id`);
						} else if (eventPkValues) {
							updatedRows = updatedRows.filter(row => !primaryKeyMatch(row, eventPkValues));
							console.log(`[Socket Global] ✅ Deleted row from ${data.table} by pk`);
						}
					}

					useAppStore.getState().setTableData(data.table, {
						...currentTableData,
						rows: updatedRows
					});
					console.log(`[Socket Global] ✅ Global database updated for ${data.table}, ${updatedRows.length} rows`);
				}
			}
			
			onUpdateRef.current?.(data);
		});

		return () => {
			try { socket.disconnect(); } catch {}
			socketRef.current = null;
		};
	}, [enabled, isAdmin, appId]);

	const lastJoinedRoomRef = useRef<string | null>(null);
	useEffect(() => {
		if (!enabled) return;
		if (!appId) return;
		const socket = socketRef.current;
		if (!socket) return;
		if (lastJoinedRoomRef.current === appId) return;
		socket.emit("join_room", appId);
		lastJoinedRoomRef.current = appId;
		if (isAdmin) {
			socket.emit("join_room", "csm");
		}
	}, [enabled, appId, isAdmin]);

	return {
		socket: socketRef.current,
		connected,
	};
}