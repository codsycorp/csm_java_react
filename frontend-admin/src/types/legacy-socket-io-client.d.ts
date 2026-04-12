// Minimal typings for socket.io-client v2.x used by our app
// This avoids relying on the deprecated @types package and missing namespace.
declare module 'socket.io-client' {
  export interface LegacySocket {
    id?: string;
    on(event: string, cb: (...args: any[]) => void): any;
    emit(event: string, ...args: any[]): any;
    disconnect(): void;
  }

  export interface LegacySocketOptions {
    path?: string;
    transports?: string[];
    reconnection?: boolean;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    reconnectionAttempts?: number;
    [key: string]: any;
  }

  function io(uri: string, opts?: LegacySocketOptions): LegacySocket;
  export default io;
}
