import { DurableObject } from 'cloudflare:workers';
import { Room } from '../../server/src/room';
import { ClientSession } from '../../server/src/session';
import type { Socket } from '../../server/src/socket';

export interface Env {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<GameRoom>;
  LOBBY: DurableObjectNamespace<Lobby>;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_HUMANS = 8;
const STALE_MS = 5 * 60 * 1000;

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

/** Accepts a WebSocket just long enough to tell the client why it can't join. */
function rejectSocket(message: string): Response {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ type: 'error', message }));
  server.close(4004, 'rejected');
  return new Response(null, { status: 101, webSocket: client });
}

// ───────────────────────── Worker entry ─────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      const rooms = await env.LOBBY.get(env.LOBBY.idFromName('lobby')).stats();
      return Response.json({ ok: true, rooms });
    }

    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'));
      const mode = url.searchParams.get('mode');
      let code: string;
      let isPrivate = false;
      if (mode === 'join') {
        const found = await lobby.lookup(String(url.searchParams.get('code') ?? ''));
        if (!found) return rejectSocket('Room not found or full.');
        code = found.code;
        isPrivate = found.isPrivate;
      } else if (mode === 'create') {
        code = await lobby.reserve(true);
        isPrivate = true;
      } else {
        code = await lobby.reserve(false);
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      const target = new URL('https://room/connect');
      target.searchParams.set('code', code);
      target.searchParams.set('private', isPrivate ? '1' : '0');
      const map = url.searchParams.get('map');
      if (mode === 'create' && map) target.searchParams.set('map', map);
      return room.fetch(new Request(target, request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// ───────────────────────── Lobby: matchmaking registry ─────────────────────────

interface RoomEntry {
  code: string;
  isPrivate: boolean;
  humans: number;
  /** Players sent to this room who haven't connected yet. */
  reserved: number;
  updated: number;
}

/** Single instance that tracks open rooms for Quick Play and private codes. */
export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, RoomEntry>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomEntry[]>('rooms');
      for (const r of saved ?? []) this.rooms.set(r.code, r);
    });
  }

  private async save(): Promise<void> {
    await this.ctx.storage.put('rooms', [...this.rooms.values()]);
  }

  private prune(): void {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (now - r.updated > STALE_MS && r.humans === 0) this.rooms.delete(code);
    }
  }

  /** Quick play: busiest public room with space, else a new one. Private: always new. */
  async reserve(isPrivate: boolean): Promise<string> {
    this.prune();
    let best: RoomEntry | null = null;
    if (!isPrivate) {
      for (const r of this.rooms.values()) {
        if (r.isPrivate || r.humans + r.reserved >= MAX_HUMANS) continue;
        if (!best || r.humans > best.humans) best = r;
      }
    }
    if (!best) {
      let code = newCode();
      while (this.rooms.has(code)) code = newCode();
      best = { code, isPrivate, humans: 0, reserved: 0, updated: Date.now() };
      this.rooms.set(code, best);
    }
    best.reserved++;
    best.updated = Date.now();
    await this.save();
    return best.code;
  }

  async lookup(rawCode: string): Promise<{ code: string; isPrivate: boolean } | null> {
    const code = rawCode.toUpperCase().trim();
    const r = this.rooms.get(code);
    if (!r || r.humans + r.reserved >= MAX_HUMANS) return null;
    r.reserved++;
    r.updated = Date.now();
    await this.save();
    return { code: r.code, isPrivate: r.isPrivate };
  }

  async report(code: string, humans: number, isPrivate: boolean): Promise<void> {
    const r = this.rooms.get(code) ?? { code, isPrivate, humans: 0, reserved: 0, updated: 0 };
    r.humans = humans;
    r.reserved = 0;
    r.updated = Date.now();
    this.rooms.set(code, r);
    await this.save();
  }

  async remove(code: string): Promise<void> {
    this.rooms.delete(code);
    await this.save();
  }

  async stats(): Promise<{ code: string; humans: number }[]> {
    this.prune();
    return [...this.rooms.values()].map((r) => ({ code: r.isPrivate ? 'private' : r.code, humans: r.humans }));
  }
}

// ───────────────────────── GameRoom: one match ─────────────────────────

/** Runs one authoritative Room (same code as the Node server) for its WebSocket clients. */
export class GameRoom extends DurableObject<Env> {
  private room: Room | null = null;

  private lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code') ?? 'XXXXX';
    const isPrivate = url.searchParams.get('private') === '1';
    const initialMap = url.searchParams.get('map') ?? undefined;

    if (!this.room) {
      this.room = new Room(
        code,
        isPrivate,
        (r) => {
          this.room = null;
          this.ctx.waitUntil(this.lobby().remove(r.code));
        },
        (r) => this.ctx.waitUntil(this.lobby().report(r.code, r.humans.length, r.isPrivate)),
        initialMap,
      );
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const session = new ClientSession(server as unknown as Socket, () => this.room ?? 'Room closed — try again.');
    const helloTimer = setTimeout(() => {
      if (!session.player) server.close(4001, 'hello timeout');
    }, 5000);

    server.addEventListener('message', (ev) => {
      if (typeof ev.data === 'string') session.onText(ev.data);
      else session.onBinary(ev.data as ArrayBuffer);
    });
    const closed = () => {
      clearTimeout(helloTimer);
      session.onClose();
    };
    server.addEventListener('close', closed);
    server.addEventListener('error', closed);

    return new Response(null, { status: 101, webSocket: client });
  }
}
