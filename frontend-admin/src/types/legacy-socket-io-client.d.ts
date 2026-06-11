declare module "socket.io-client" {
	interface Socket {
		id?: string;
		on(event: "connect", cb: () => void): this;
		on(event: "disconnect", cb: () => void): this;
		on(event: "connect_error", cb: (error: Error) => void): this;
		on(event: "csm_msg_update", cb: (data: Record<string, unknown>) => void): this;
		on(event: string, cb: (...args: any[]) => void): this;
		off?(event: string, cb?: (...args: any[]) => void): this;
		emit(event: string, ...args: any[]): this;
		disconnect(): this;
		io?: {
			on?(event: string, cb: (...args: any[]) => void): void;
		};
	}

	interface SocketIOClientStatic {
		(url: string, opts?: Record<string, unknown>): Socket;
		connect(url: string, opts?: Record<string, unknown>): Socket;
	}

	const io: SocketIOClientStatic;
	export default io;
}
