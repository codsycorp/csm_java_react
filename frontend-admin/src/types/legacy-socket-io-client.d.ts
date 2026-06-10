declare module "socket.io-client" {
	interface Socket {
		id?: string;
		on(event: string, cb: (...args: unknown[]) => void): this;
		off?(event: string, cb?: (...args: unknown[]) => void): this;
		emit(event: string, ...args: unknown[]): this;
		disconnect(): this;
		io?: {
			on?(event: string, cb: (...args: unknown[]) => void): void;
		};
	}

	interface SocketIOClientStatic {
		(url: string, opts?: Record<string, unknown>): Socket;
		connect(url: string, opts?: Record<string, unknown>): Socket;
	}

	const io: SocketIOClientStatic;
	export default io;
}
