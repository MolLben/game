import {
  TICK_RATE,
  decodeSnapshot,
  encodeInput,
  type GameEvent,
  type HelloMsg,
  type InputCmd,
  type ServerJson,
  type Snapshot,
  type WelcomeMsg,
} from '@kinetic/shared';

/** WebSocket connection to the authoritative game server + server clock estimate. */
export class NetClient {
  private ws: WebSocket | null = null;
  private tickOffset: number | null = null;
  private pingTimer = 0;
  id = -1;
  code = '';
  rtt = 0;
  onSnapshot: (s: Snapshot) => void = () => {};
  onEvents: (e: GameEvent[]) => void = () => {};
  onClose: (reason: string) => void = () => {};

  connect(url: string, hello: HelloMsg): Promise<WelcomeMsg> {
    return new Promise((resolve, reject) => {
      let welcomed = false;
      let ws: WebSocket;
      // Mode/code also go in the URL so an edge router (Cloudflare) can pick the room before upgrading.
      const full = new URL(url);
      full.searchParams.set('mode', hello.mode);
      if (hello.code) full.searchParams.set('code', hello.code);
      if (hello.map && hello.mode === 'create') full.searchParams.set('map', hello.map);
      try {
        ws = new WebSocket(full.toString());
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const timeout = window.setTimeout(() => {
        reject(new Error('Connection timed out'));
        ws.close();
      }, 6000);

      ws.onopen = () => ws.send(JSON.stringify(hello));
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') {
          const s = decodeSnapshot(ev.data as ArrayBuffer);
          this.updateClock(s.tick);
          this.onSnapshot(s);
          return;
        }
        const msg = JSON.parse(ev.data) as ServerJson;
        switch (msg.type) {
          case 'welcome':
            welcomed = true;
            clearTimeout(timeout);
            this.id = msg.id;
            this.code = msg.code;
            this.updateClock(msg.tick);
            this.startPing();
            resolve(msg);
            break;
          case 'events':
            this.onEvents(msg.events);
            break;
          case 'pong': {
            const sample = performance.now() - msg.t;
            this.rtt = this.rtt === 0 ? sample : this.rtt * 0.8 + sample * 0.2;
            break;
          }
          case 'error':
            if (!welcomed) {
              clearTimeout(timeout);
              reject(new Error(msg.message));
              ws.close();
            } else {
              this.onClose(msg.message);
            }
            break;
        }
      };
      ws.onclose = (ev) => {
        clearTimeout(timeout);
        clearInterval(this.pingTimer);
        if (!welcomed) reject(new Error(ev.reason || 'Could not reach the game server'));
        else this.onClose(ev.reason || 'Disconnected from server');
      };
    });
  }

  private startPing(): void {
    const ping = () => this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: 'ping', t: performance.now() }));
    ping();
    this.pingTimer = window.setInterval(ping, 1000);
  }

  /**
   * Tracks the offset between local time and server ticks. Snapshots that
   * arrive late (jitter) are mostly ignored by following the earliest arrivals.
   */
  private updateClock(tick: number): void {
    const est = tick - (performance.now() / 1000) * TICK_RATE;
    if (this.tickOffset === null) this.tickOffset = est;
    else if (est > this.tickOffset) this.tickOffset += (est - this.tickOffset) * 0.25;
    else this.tickOffset += (est - this.tickOffset) * 0.01;
  }

  /** Estimated latest server tick, as seen from this client. */
  serverTick(): number {
    return (performance.now() / 1000) * TICK_RATE + (this.tickOffset ?? 0);
  }

  sendLoadout(primary: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'loadout', primary }));
  }

  sendInput(cmd: InputCmd): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(encodeInput(cmd));
  }

  close(): void {
    this.onClose = () => {};
    clearInterval(this.pingTimer);
    this.ws?.close();
  }
}
