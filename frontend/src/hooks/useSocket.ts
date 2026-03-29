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

let sharedSocket: LegacySocket | null = null;
let sharedSocketUrl = "";
let sharedSocketRefCount = 0;
let sharedConnected = false;
let sharedHadConnectionIssue = false;
const connectedSubscribers = new Set<(connected: boolean) => void>();
const updateSubscribers = new Set<(event: SocketUpdateEvent) => void>();

function notifyConnected(connected: boolean) {
	sharedConnected = connected;
	connectedSubscribers.forEach((listener) => {
		try {
			listener(connected);
		} catch {
			// Ignore listener errors to keep manager stable
		}
	});
}

function processSocketUpdate(data: SocketUpdateEvent) {
	const userAppId = (useUserStore.getState().app_id || "").trim();
	const currentAppId = (useAppStore.getState().currentAppId || "").trim();
	const fallbackAppId = (useAppStore.getState().getCurrentAppId() || "").trim();
	const activeAppId = userAppId || currentAppId || fallbackAppId;

	const isSystemTable = data.table?.startsWith('sys_') || data.table?.startsWith('csm_') || data.table?.startsWith('wu_');
	const belongsToCurrentApp = data.appId === activeAppId;

	if (isSystemTable || belongsToCurrentApp) {
		if (data.table) {
			const currentTableData = useAppStore.getState().database[data.table];
			const inferredPkFields = Object.keys(data.primaryKeys || {}).filter(Boolean);
			const tableSnapshot = currentTableData || {
				id: data.table,
				rows: [],
				fieldsPK: inferredPkFields.length ? inferredPkFields : ['id'],
				app_id: data.appId,
			};
			const pkFields = tableSnapshot.fieldsPK || ['id'];
			let updatedRows = [...(tableSnapshot.rows || [])];

			const getRowId = (row: Record<string, any> | undefined | null) => {
				if (!row) return null;
				const id = row.id;
				return id !== undefined && id !== null ? String(id) : null;
			};

			const getPkValues = (row: Record<string, any> | undefined | null) => {
				if (!row) return null;
				const values: Record<string, any> = {};
				pkFields.forEach((pk) => {
					if (row[pk] !== undefined) {
						values[pk] = row[pk];
					}
				});
				return Object.keys(values).length ? values : null;
			};

			const primaryKeyMatch = (row: Record<string, any>, pkValues: Record<string, any> | null) => {
				if (!pkValues) return false;
				return pkFields.every((pk) => row[pk] === pkValues[pk]);
			};

			const eventRowId = getRowId(data.dataRow) ?? (data.primaryKeys?.id != null ? String(data.primaryKeys.id) : null);
			const eventPkValues = data.primaryKeys || getPkValues(data.dataRow);
			const findIndexById = () => (eventRowId ? updatedRows.findIndex((r) => getRowId(r) === eventRowId) : -1);

			if (data.action === 'create') {
				if (data.dataRow) {
					const idxById = findIndexById();
					if (idxById === -1) {
						updatedRows.push(data.dataRow);
					} else {
						updatedRows[idxById] = { ...updatedRows[idxById], ...data.dataRow };
					}
				}
			} else if (data.action === 'update') {
				if (data.dataRow) {
					const idxById = findIndexById();
					if (idxById !== -1) {
						updatedRows[idxById] = { ...updatedRows[idxById], ...data.dataRow };
					} else if (eventPkValues) {
						const idxByPk = updatedRows.findIndex((row) => primaryKeyMatch(row, eventPkValues));
						if (idxByPk !== -1) {
							updatedRows[idxByPk] = { ...updatedRows[idxByPk], ...data.dataRow };
						} else {
							updatedRows.push(data.dataRow);
						}
					} else {
						updatedRows.push(data.dataRow);
					}
				}
			} else if (data.action === 'delete') {
				if (eventRowId) {
					updatedRows = updatedRows.filter((row) => getRowId(row) !== eventRowId);
				} else if (eventPkValues) {
					updatedRows = updatedRows.filter((row) => !primaryKeyMatch(row, eventPkValues));
				}
			}

			useAppStore.getState().setTableData(data.table, {
				...tableSnapshot,
				rows: updatedRows,
			});
		}
	}

	updateSubscribers.forEach((listener) => {
		try {
			listener(data);
		} catch {
			// Ignore listener errors
		}
	});
}

function ensureSharedSocket(apiUrl: string) {
	if (sharedSocket && sharedSocketUrl === apiUrl) {
		return sharedSocket;
	}

	if (sharedSocket && sharedSocketUrl !== apiUrl) {
		try {
			sharedSocket.disconnect();
		} catch {
			// ignore
		}
		sharedSocket = null;
		sharedSocketUrl = "";
		notifyConnected(false);
	}

	const socket = io(apiUrl, {
		transports: ["websocket", "polling"],
		reconnection: true,
		reconnectionDelay: 1000,
		reconnectionDelayMax: 5000,
		reconnectionAttempts: Number.MAX_SAFE_INTEGER,
	});

	sharedSocket = socket;
	sharedSocketUrl = apiUrl;

	socket.on("connect", () => {
		if (sharedHadConnectionIssue) {
			console.clear();
			console.info('[Socket] Reconnected successfully. Cleared previous connection logs.');
			sharedHadConnectionIssue = false;
		}
		notifyConnected(true);
	});

	socket.on("disconnect", () => {
		sharedHadConnectionIssue = true;
		notifyConnected(false);
	});

	socket.on("connect_error", (error) => {
		sharedHadConnectionIssue = true;
		console.error('[Socket] Connection error:', error);
	});

	const manager = (socket as any).io;
	if (manager?.on) {
		manager.on('reconnect_attempt', () => {
			sharedHadConnectionIssue = true;
		});
		manager.on('reconnect_failed', () => {
			sharedHadConnectionIssue = true;
		});
	}

	socket.on("csm_msg_update", (data: SocketUpdateEvent) => {
		processSocketUpdate(data);
	});

	return socket;
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

	useEffect(() => {
		const envRealtimeUrl = import.meta.env.VITE_REALTIME_BASE_URL;
		const apiUrl = envRealtimeUrl?.trim().replace(/\/$/, "");
		
		if (!enabled || !apiUrl) {
			setConnected(false);
			return;
		}

		const handleConnectedChange = (value: boolean) => {
			setConnected(value);
		};

		connectedSubscribers.add(handleConnectedChange);
		if (onUpdate) {
			updateSubscribers.add(onUpdate);
		}

		const socket = ensureSharedSocket(apiUrl);
		socketRef.current = socket;
		sharedSocketRefCount += 1;
		setConnected(sharedConnected);

		return () => {
			connectedSubscribers.delete(handleConnectedChange);
			if (onUpdate) {
				updateSubscribers.delete(onUpdate);
			}

			sharedSocketRefCount = Math.max(0, sharedSocketRefCount - 1);
			if (sharedSocketRefCount === 0 && sharedSocket) {
				try {
					sharedSocket.disconnect();
				} catch {
					// ignore
				}
				sharedSocket = null;
				sharedSocketUrl = "";
				notifyConnected(false);
			}
			socketRef.current = null;
		};
	}, [enabled, onUpdate]);

	const lastJoinedRoomRef = useRef<string | null>(null);
	useEffect(() => {
		if (!enabled) return;
		if (!appId) return;
		const socket = socketRef.current || sharedSocket;
		if (!socket) return;
		if (lastJoinedRoomRef.current === appId) return;
		socket.emit("join_room", appId);
		lastJoinedRoomRef.current = appId;
		if (isAdmin) {
			socket.emit("join_room", "csm");
		}
	}, [enabled, appId, isAdmin]);

	return {
		socket: socketRef.current || sharedSocket,
		connected,
	};
}