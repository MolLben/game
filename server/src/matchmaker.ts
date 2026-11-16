import { randomInt } from 'node:crypto';
import { Room } from './room';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Matchmaker {
  readonly rooms = new Map<string, Room>();

  private newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 5; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
      if (!this.rooms.has(c)) return c;
    }
  }

  private create(isPrivate: boolean, map?: string): Room {
    const room = new Room(
      this.newCode(),
      isPrivate,
      (r) => {
        this.rooms.delete(r.code);
        console.log(`[room ${r.code}] closed (empty)`);
      },
      undefined,
      map,
    );
    this.rooms.set(room.code, room);
    console.log(`[room ${room.code}] created (${isPrivate ? 'private' : 'public'})`);
    return room;
  }

  /** Quick play: fill the busiest public room that still has space. */
  quickPlay(): Room {
    let best: Room | null = null;
    for (const r of this.rooms.values()) {
      if (r.isPrivate || !r.hasSpace) continue;
      if (!best || r.humans.length > best.humans.length) best = r;
    }
    return best ?? this.create(false);
  }

  createPrivate(map?: string): Room {
    return this.create(true, map);
  }

  find(code: string): Room | null {
    const r = this.rooms.get(code.toUpperCase().trim());
    return r && r.hasSpace ? r : null;
  }

  stats() {
    return [...this.rooms.values()].map((r) => ({
      code: r.isPrivate ? 'private' : r.code,
      humans: r.humans.length,
      total: r.players.size,
    }));
  }
}
