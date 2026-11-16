import { PROTOCOL_VERSION, decodeInput, sanitizeName, type ClientJson, type HelloMsg, type ServerJson } from '@kinetic/shared';
import type { ServerPlayer } from './player';
import type { Room } from './room';
import type { Socket } from './socket';

const MAX_MSGS_PER_SEC = 200;

/**
 * One client connection: validates messages, rate-limits, and routes them to
 * a Room. `resolveRoom` decides which room a hello joins (or returns an error).
 */
export class ClientSession {
  room: Room | null = null;
  player: ServerPlayer | null = null;
  private windowStart = 0;
  private count = 0;

  constructor(
    private socket: Socket,
    private resolveRoom: (hello: HelloMsg) => Room | string,
    private log: (msg: string) => void = () => {},
  ) {}

  private send(m: ServerJson): void {
    this.socket.send(JSON.stringify(m));
  }

  private rateOk(): boolean {
    const now = Date.now();
    if (now - this.windowStart >= 1000) {
      this.windowStart = now;
      this.count = 0;
    }
    if (++this.count > MAX_MSGS_PER_SEC) {
      this.socket.close(4002, 'rate limit');
      return false;
    }
    return true;
  }

  onBinary(buf: ArrayBuffer): void {
    if (!this.rateOk() || !this.room || !this.player) return;
    const cmd = decodeInput(buf);
    if (cmd) this.room.queueInput(this.player, cmd);
  }

  onText(text: string): void {
    if (!this.rateOk()) return;
    let msg: ClientJson;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'ping') {
      this.send({ type: 'pong', t: Number(msg.t) || 0 });
    } else if (msg.type === 'loadout') {
      if (this.room && this.player) this.room.setLoadout(this.player, msg.primary);
    } else if (msg.type === 'hello' && !this.player) {
      if (msg.version !== PROTOCOL_VERSION) {
        this.send({ type: 'error', message: 'Client is out of date — please refresh.' });
        this.socket.close(4003, 'version');
        return;
      }
      const room = this.resolveRoom(msg);
      if (typeof room === 'string') {
        this.send({ type: 'error', message: room });
        return;
      }
      if (!room.hasSpace) {
        this.send({ type: 'error', message: 'Room is full.' });
        return;
      }
      this.room = room;
      this.player = room.addHuman(this.socket, sanitizeName(msg.name), msg.primary);
      this.log(`[room ${room.code}] ${this.player.name} joined (${room.humans.length} humans)`);
    }
  }

  onClose(): void {
    if (this.room && this.player) {
      this.log(`[room ${this.room.code}] ${this.player.name} left`);
      this.room.removePlayer(this.player);
    }
    this.player = null;
  }
}
