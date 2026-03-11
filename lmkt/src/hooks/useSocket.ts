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
	off?: (event: string, cb: (...args: any[]) => void) => any; // Thêm off để hỗ trợ socket.off
	emit: (event: string, ...args: any[]) => any;
	disconnect: () => void;
};
import { useAppStore, useUserStore } from "#src/store";

interface SocketUpdateEvent {
	appId: string;
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
	// Prefer user's app_id to avoid default 'csm' overriding
	       const appId = (userAppId && userAppId.trim())
		       || (currentAppId && currentAppId.trim())
		       || useAppStore.getState().getCurrentAppId();
	       const isAdmin = useUserStore((state) => !!state.roles?.includes("admin") || !!state.dev);

	// Keep latest onUpdate without recreating socket listeners
	const onUpdateRef = useRef<typeof onUpdate>();
	useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

	       useEffect(() => {
		       // Determine socket URL strictly from env (no defaults)
		       const envRealtimeUrl = import.meta.env.VITE_REALTIME_BASE_URL;
		       const apiUrl = envRealtimeUrl?.trim().replace(/\/$/, "");
		       if (!enabled || !apiUrl) {
				   // [Socket] Missing VITE_REALTIME_BASE_URL; skip connecting.
			       return;
		       }

		       // Avoid recreating when already connected for this base URL
		       if (socketRef.current) return;

			   // [Socket] Connecting to server

		       const socket = io(apiUrl, {
			       transports: ["websocket", "polling"],
			       reconnection: true,
			       reconnectionDelay: 1000,
			       reconnectionDelayMax: 5000,
			       reconnectionAttempts: 5,
		       });

		       socketRef.current = socket;

		       // Connection events
		       socket.on("connect", () => {
				   // [Socket] Connected
			       setConnected(true);
			       // Join initial app room if available
			       if (appId) {
				       socket.emit("join_room", appId);
					   // [Socket] Joined room
			       }
			       // Nếu là admin/dev thì join thêm room 'csm'
			       if (isAdmin) {
				       socket.emit("join_room", "csm");
					   // [Socket] Joined admin/dev room
			       }
		       });

		       socket.on("disconnect", (reason) => {
				   // [Socket] Disconnected
			       setConnected(false);
		       });

		       socket.on("connect_error", (error) => {
				   // [Socket] Connection error
		       });

		       // Listen for data update events
		       socket.on("csm_msg_update", (data: SocketUpdateEvent) => {
			   // [Socket] Received update

			   const isSystemTable = data.table?.startsWith('sys_') || data.table?.startsWith('csm_') || data.table?.startsWith('wu_');
			   const belongsToCurrentApp = !data.appId || data.appId === appId;
			   const shouldProcess = isSystemTable || belongsToCurrentApp;

			   if (!shouldProcess || !data.table) {
				   onUpdateRef.current?.(data);
				   return;
			   }

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
							   const idxByPk = updatedRows.findIndex(row => primaryKeyMatch(row, eventPkValues));
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
						   updatedRows = updatedRows.filter(row => getRowId(row) !== eventRowId);
					   } else if (eventPkValues) {
						   updatedRows = updatedRows.filter(row => !primaryKeyMatch(row, eventPkValues));
					   }
				   }

				   useAppStore.getState().setTableData(data.table, {
					   ...currentTableData,
					   rows: updatedRows
				   });
			   }

			   onUpdateRef.current?.(data);
		       });

		       // Cleanup only when disabled or URL changes/unmount
		       return () => {
				   // [Socket] Disconnecting
			       try { socket.disconnect(); } catch {}
			       socketRef.current = null;
		       };
	       }, [enabled, isAdmin, appId]);

	// Join room when appId changes without recreating the socket
	const lastJoinedRoomRef = useRef<string | null>(null);
	       useEffect(() => {
		       if (!enabled) return;
		       if (!appId) return;
		       const socket = socketRef.current;
		       if (!socket) return;
		       if (lastJoinedRoomRef.current === appId) return;
		       socket.emit("join_room", appId);
		       lastJoinedRoomRef.current = appId;
			   // [Socket] Joined room
		       // Nếu là admin/dev thì join thêm room 'csm'
		       if (isAdmin) {
			       socket.emit("join_room", "csm");
					   // [Socket] Joined admin/dev room
		       }
	       }, [enabled, appId, isAdmin]);

	// Add detailed logging for room assignment
	if (!appId) {
		console.warn("[Socket] No appId available for room assignment.");
	} else {
		console.info(`[Socket] Attempting to join room: ${appId}`);
	}
	if (isAdmin) {
		console.info("[Socket] Admin/Dev detected. Joining admin room 'csm'.");
	}

	return {
		socket: socketRef.current,
		connected,
	};
}