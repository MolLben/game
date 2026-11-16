/**
 * Minimal WebSocket surface the game room needs. Satisfied by both the Node
 * `ws` library and Cloudflare's WebSocket, so the same Room runs on either.
 */
export interface Socket {
  readonly readyState: number;
  /** Not available on Cloudflare; treated as 0 there. */
  readonly bufferedAmount?: number;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
}

export const SOCKET_OPEN = 1;
