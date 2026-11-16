import {
  BOT_NAMES,
  BOT_TUNING,
  BotBrain,
  MAP_ORDER,
  MATCH,
  MAX_REWIND_TICKS,
  PLAYER,
  PLAYER_COLORS,
  SNAPSHOT_EVERY_TICKS,
  TICK_DT,
  TICK_RATE,
  botShotDirections,
  clamp,
  getMap,
  isMapId,
  navGraph,
  nextMapId,
  isPrimary,
  loadoutFor,
  meleeTrace,
  randomPrimary,
  shellTicks,
  weaponIndex,
  createMoveState,
  damageAt,
  distance,
  dot,
  encodeSnapshot,
  eyeOf,
  forwardFromAngles,
  maxSpread,
  moveSpeedMult,
  raycastBoxes,
  stepMovement,
  traceShot,
  vec3,
  weaponByIndex,
  yawTowards,
  type BotWorld,
  type GameEvent,
  type HitTarget,
  type InputCmd,
  type MapDef,
  type MatchInfo,
  type ServerJson,
  type Vec3,
  type WeaponDef,
  type WeaponId,
  type WelcomeMsg,
} from '@kinetic/shared';
import { HISTORY_SIZE, ServerPlayer } from './player';
import { SOCKET_OPEN, type Socket } from './socket';

const MAX_HUMANS = 8;
const BOT_FILL = 6;
const END_SCREEN_SEC = 10;
const MAX_QUEUED_INPUTS = 64;
const MAX_SOCKET_BUFFER = 512 * 1024;

const r2 = (n: number) => Math.round(n * 100) / 100;

export class Room {
  map: MapDef;
  readonly players = new Map<number, ServerPlayer>();
  tick = 0;
  private phase: MatchInfo['phase'] = 'running';
  private phaseEndsTick = MATCH.durationSec * TICK_RATE;
  private broadcast: GameEvent[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private botWorld: BotWorld;

  constructor(
    readonly code: string,
    readonly isPrivate: boolean,
    private onEmpty: (room: Room) => void,
    /** Called whenever the number of humans changes (used for matchmaking). */
    private onPopulation: (room: Room) => void = () => {},
    initialMap?: string,
  ) {
    // Private rooms default to Foundry; public rooms start somewhere in the rotation.
    this.map = isMapId(initialMap)
      ? getMap(initialMap)
      : getMap(isPrivate ? MAP_ORDER[0] : MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]);
    // Build all bot navigation graphs up front so map rotation never hitches mid-match.
    for (const id of MAP_ORDER) navGraph(getMap(id));
    const self = this;
    this.botWorld = {
      get boxes() {
        return self.map.boxes;
      },
      get nav() {
        return navGraph(self.map);
      },
      get time() {
        return self.time;
      },
      get fighters() {
        return [...self.players.values()];
      },
      lineOfSight: (a, b) => this.lineOfSight(a, b),
    };
    this.syncBots();
    this.start();
  }

  get time(): number {
    return this.tick * TICK_DT;
  }

  get humans(): ServerPlayer[] {
    return [...this.players.values()].filter((p) => !p.isBot);
  }

  get hasSpace(): boolean {
    return this.humans.length < MAX_HUMANS;
  }

  // ───────────────────────── Lifecycle ─────────────────────────

  private start(): void {
    let last = performance.now();
    let acc = 0;
    const step = 1000 / TICK_RATE;
    this.interval = setInterval(() => {
      const now = performance.now();
      acc = Math.min(acc + now - last, 250);
      last = now;
      while (acc >= step) {
        acc -= step;
        this.step();
      }
    }, 4);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private nextId(): number {
    for (let id = 1; id < 250; id++) if (!this.players.has(id)) return id;
    throw new Error('room full');
  }

  private nextColor(): string {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
  }

  addHuman(socket: Socket, name: string, primary: unknown): ServerPlayer {
    const p = new ServerPlayer(this.nextId(), name, this.nextColor(), socket, null, isPrimary(primary) ? primary : 'rifle');
    p.joinTick = this.tick;
    this.players.set(p.id, p);
    this.broadcast.push({ t: 'join', p: p.info() });
    const welcome: WelcomeMsg = {
      type: 'welcome',
      id: p.id,
      code: this.code,
      isPrivate: this.isPrivate,
      tick: this.tick,
      map: this.map.id,
      players: [...this.players.values()].map((o) => o.info()),
      match: this.matchInfo(),
    };
    this.sendJson(p, welcome);
    this.spawn(p);
    this.syncBots();
    this.onPopulation(this);
    return p;
  }

  removePlayer(p: ServerPlayer): void {
    if (!this.players.delete(p.id)) return;
    this.broadcast.push({ t: 'leave', id: p.id });
    if (this.humans.length === 0) {
      this.stop();
      this.onEmpty(this);
      return;
    }
    this.syncBots();
    this.onPopulation(this);
  }

  /** Keeps the lobby lively: bots fill empty slots and leave as humans join. */
  private syncBots(): void {
    const bots = [...this.players.values()].filter((p) => p.isBot);
    const want = Math.max(0, BOT_FILL - this.humans.length);
    for (let i = bots.length; i < want; i++) {
      const used = new Set([...this.players.values()].map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot${i}`;
      const b = new ServerPlayer(this.nextId(), name, this.nextColor(), null, new BotBrain(), randomPrimary());
      this.players.set(b.id, b);
      this.broadcast.push({ t: 'join', p: b.info() });
      this.spawn(b);
    }
    for (let i = want; i < bots.length; i++) {
      this.players.delete(bots[i].id);
      this.broadcast.push({ t: 'leave', id: bots[i].id });
    }
  }

  setLoadout(p: ServerPlayer, primary: unknown): void {
    if (isPrimary(primary)) p.pendingPrimary = primary;
  }

  queueInput(p: ServerPlayer, cmd: InputCmd): void {
    const lastQueued = p.inputs.length ? p.inputs[p.inputs.length - 1].seq : p.lastSeq;
    if (cmd.seq <= lastQueued || p.inputs.length >= MAX_QUEUED_INPUTS) return;
    p.inputs.push(cmd);
  }

  // ───────────────────────── Simulation ─────────────────────────

  private step(): void {
    this.tick++;

    for (const p of this.players.values()) {
      if (p.isBot) this.stepBot(p);
      else this.processInputs(p);
    }

    for (const p of this.players.values()) {
      if (p.alive && p.move.pos.y < this.map.killY) this.kill(p, null, false, 'fell');
      if (p.alive && p.health < PLAYER.maxHealth && this.time - p.lastDamageTime > MATCH.regenDelay) {
        p.health = Math.min(PLAYER.maxHealth, p.health + MATCH.regenPerSec * TICK_DT);
      }
      if (!p.alive && this.phase === 'running' && this.time >= p.respawnAt) this.spawn(p);
      p.record(this.tick);
    }

    if (this.tick >= this.phaseEndsTick) {
      if (this.phase === 'running') this.endMatch();
      else this.restartMatch();
    }

    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush();
  }

  private processInputs(p: ServerPlayer): void {
    // Speed-hack guard: a client can never simulate more inputs than ticks elapsed (+ small slack).
    const budget = this.tick - p.joinTick + 20 - p.inputTick;
    const n = Math.min(p.inputs.length > 3 ? 2 : 1, p.inputs.length, Math.max(0, budget));
    for (let i = 0; i < n; i++) this.applyInput(p, p.inputs.shift()!);
  }

  private applyInput(p: ServerPlayer, cmd: InputCmd): void {
    p.lastSeq = cmd.seq;
    p.inputTick++;
    p.viewTick = cmd.viewTick;
    const it = p.inputTick;

    // Only weapons in the player's loadout can be equipped.
    if (cmd.weapon !== p.weapon && p.loadout.includes(cmd.weapon)) {
      p.weapon = cmd.weapon;
      p.reloadEndTick = 0;
      p.equipEndTick = it + Math.floor(weaponByIndex(p.weapon).equipTime * TICK_RATE * 0.7);
    }
    const def = weaponByIndex(p.weapon);
    this.updateReload(p, def, it);
    if (cmd.reload && !def.melee && p.reloadEndTick === 0 && p.ammo[p.weapon] < def.magSize) {
      p.reloadStartTick = it;
      p.reloadAmmoStart = p.ammo[p.weapon];
      p.reloadEndTick = def.shellReload > 0 ? 1 : it + Math.floor(def.reloadTime * TICK_RATE * 0.85);
    }
    if (!p.alive) return;

    p.yaw = cmd.yaw;
    p.pitch = cmd.pitch;
    // Shots happen before this tick's movement, matching where the client's camera was.
    for (const pellets of cmd.shots) this.handleShot(p, cmd, pellets, it);
    stepMovement(
      p.move,
      { forward: cmd.forward, right: cmd.right, jump: cmd.jump, crouch: cmd.crouch, yaw: cmd.yaw },
      TICK_DT,
      this.map.boxes,
      moveSpeedMult(p.weapon, cmd.ads),
      this.map.pads,
    );
  }

  private stepBot(b: ServerPlayer): void {
    if (!b.alive || this.phase !== 'running') return;
    const weapon = weaponByIndex(b.weapon);
    const d = b.brain!.think(b, this.botWorld, TICK_DT, weapon);
    stepMovement(b.move, d.input, TICK_DT, this.map.boxes, BOT_TUNING.speedMult * weapon.moveMult, this.map.pads);
    if (d.fireAt) this.botFire(b, d.fireAt as ServerPlayer);
  }

  /** Other players' hitboxes as they were at `tick` (lag compensation). */
  private targetsAt(tick: number): HitTarget[] {
    const out: HitTarget[] = [];
    for (const o of this.players.values()) {
      if (!o.alive || this.time - o.spawnTime < MATCH.spawnProtection) continue;
      const h = o.history[tick % HISTORY_SIZE];
      if (h && h.tick === tick && h.alive) out.push({ id: o.id, pos: h.pos, crouched: h.crouched });
      else out.push({ id: o.id, pos: o.move.pos, crouched: o.move.crouched });
    }
    return out;
  }

  /** Advances (or completes) an in-progress reload on the player's own input clock. */
  private updateReload(p: ServerPlayer, def: WeaponDef, it: number): void {
    if (p.reloadEndTick === 0) return;
    if (def.shellReload > 0) {
      const loaded = Math.floor((it - p.reloadStartTick) / shellTicks(def, TICK_RATE, 0.85));
      p.ammo[p.weapon] = Math.min(def.magSize, p.reloadAmmoStart + loaded);
      if (p.ammo[p.weapon] >= def.magSize) p.reloadEndTick = 0;
    } else if (it >= p.reloadEndTick) {
      p.ammo[p.weapon] = def.magSize;
      p.reloadEndTick = 0;
    }
  }

  private handleShot(p: ServerPlayer, cmd: InputCmd, pellets: Vec3[], it: number): void {
    if (this.phase !== 'running' || pellets.length === 0) return;
    const w = p.weapon;
    const def = weaponByIndex(w);
    if (it < p.equipEndTick || it < p.nextFireTick) return;
    // Shell reloads can be interrupted by firing (keeping the shells loaded so far).
    if (p.reloadEndTick > 0 && def.shellReload > 0 && p.ammo[w] > 0) p.reloadEndTick = 0;
    if (!def.melee && (p.reloadEndTick > 0 || p.ammo[w] <= 0)) return;
    if (!def.melee) p.ammo[w]--;
    p.nextFireTick = it + Math.floor((60 / def.rpm) * TICK_RATE * 0.7);

    const aim = forwardFromAngles(cmd.yaw, cmd.pitch);
    const minDot = Math.cos(Math.min(1.2, maxSpread(def) + 0.2));
    const origin = eyeOf(p);
    const rewindTick = clamp(cmd.viewTick, this.tick - MAX_REWIND_TICKS, this.tick);
    const targets = this.targetsAt(rewindTick);
    const results = new Map<number, { dmg: number; head: boolean }>();
    const ends: number[][] = [];

    if (def.melee) {
      const d = pellets[0];
      if (dot(d, aim) < minDot) return;
      const yaw = Math.atan2(-d.x, -d.z);
      const pitch = Math.asin(clamp(d.y, -1, 1));
      const hit = meleeTrace(origin, yaw, pitch, def.range, this.map.boxes, targets, p.id);
      this.broadcastExcept(p, { t: 'shot', id: p.id, w: def.id, e: [] });
      if (hit.targetId >= 0) results.set(hit.targetId, { dmg: def.damage, head: false });
      this.applyResults(p, def, results);
      return;
    }

    for (const dir of pellets.slice(0, def.pellets)) {
      if (dot(dir, aim) < minDot) continue; // impossible direction — ignore
      const hit = traceShot(origin, dir, def.range, this.map.boxes, targets, p.id);
      if (ends.length < 4) {
        const n = hit.normal ?? { x: 0, y: 0, z: 0 };
        ends.push([r2(hit.point.x), r2(hit.point.y), r2(hit.point.z), n.x, n.y, n.z, hit.targetId >= 0 ? 1 : 0]);
      }
      if (hit.targetId >= 0) {
        const r = results.get(hit.targetId) ?? { dmg: 0, head: false };
        r.dmg += damageAt(def, hit.t, hit.head);
        r.head ||= hit.head;
        results.set(hit.targetId, r);
      }
    }

    this.broadcastExcept(p, { t: 'shot', id: p.id, w: def.id, e: ends });
    this.applyResults(p, def, results);
  }

  private applyResults(p: ServerPlayer, def: WeaponDef, results: Map<number, { dmg: number; head: boolean }>): void {
    for (const [id, r] of results) {
      const target = this.players.get(id);
      if (!target) continue;
      const res = this.damage(target, r.dmg, p, r.head, def.name);
      if (res !== 'none') {
        p.events.push({ t: 'hit', target: id, head: r.head, kill: res === 'kill', dmg: Math.round(r.dmg) });
      }
    }
  }

  private botFire(b: ServerPlayer, target: ServerPlayer): void {
    const def = weaponByIndex(b.weapon);
    const origin = eyeOf(b);
    const targets = this.targetsAt(this.tick);
    const ends: number[][] = [];
    const results = new Map<number, { dmg: number; head: boolean }>();
    for (const dir of botShotDirections(origin, target.move.pos, target, !b.move.onGround, def)) {
      const hit = traceShot(origin, dir, def.range, this.map.boxes, targets, b.id);
      const n = hit.normal ?? { x: 0, y: 0, z: 0 };
      if (ends.length < 4) {
        ends.push([r2(hit.point.x), r2(hit.point.y), r2(hit.point.z), n.x, n.y, n.z, hit.targetId >= 0 ? 1 : 0]);
      }
      if (hit.targetId >= 0) {
        const r = results.get(hit.targetId) ?? { dmg: 0, head: false };
        r.dmg += damageAt(def, hit.t, hit.head) * BOT_TUNING.damageScale;
        r.head ||= hit.head;
        results.set(hit.targetId, r);
      }
    }
    this.broadcast.push({ t: 'shot', id: b.id, w: def.id, e: ends });
    for (const [id, r] of results) {
      const victim = this.players.get(id);
      if (victim) this.damage(victim, r.dmg, b, r.head, def.name);
    }
  }

  lineOfSight(a: Vec3, b: Vec3): boolean {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) return true;
    return !raycastBoxes(a, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.05, this.map.boxes);
  }

  // ───────────────────────── Combat ─────────────────────────

  private damage(
    target: ServerPlayer,
    amount: number,
    attacker: ServerPlayer | null,
    head: boolean,
    weapon: string,
  ): 'none' | 'hit' | 'kill' {
    if (!target.alive || this.phase !== 'running') return 'none';
    if (this.time - target.spawnTime < MATCH.spawnProtection) return 'none';
    target.health -= amount;
    target.lastDamageTime = this.time;
    if (!target.isBot && attacker) {
      target.events.push({ t: 'damage', by: attacker.id, amount: Math.round(amount), x: r2(attacker.move.pos.x), z: r2(attacker.move.pos.z) });
    }
    target.brain?.onDamaged(target, attacker);
    if (target.health <= 0) {
      this.kill(target, attacker, head, weapon);
      return 'kill';
    }
    return 'hit';
  }

  private kill(target: ServerPlayer, attacker: ServerPlayer | null, head: boolean, weapon: string): void {
    target.alive = false;
    target.health = 0;
    target.deaths++;
    target.streak = 0;
    target.respawnAt = this.time + MATCH.respawnDelay;
    const killer = attacker && attacker !== target ? attacker : null;
    if (killer) {
      killer.kills++;
      killer.streak++;
    }
    this.broadcast.push({ t: 'kill', killer: killer ? killer.id : 0, victim: target.id, w: weapon, head });
    if (killer && killer.kills >= MATCH.killLimit) this.endMatch();
  }

  private pickSpawn(p: ServerPlayer): Vec3 {
    const scored = this.map.spawns.map((s) => {
      let minD = Infinity;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        minD = Math.min(minD, distance(s, o.move.pos));
      }
      return { s, d: minD + Math.random() * 6 };
    });
    scored.sort((a, b) => b.d - a.d);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
  }

  private spawn(p: ServerPlayer): void {
    const pos = this.pickSpawn(p);
    p.move = createMoveState(pos);
    p.yaw = yawTowards(pos, vec3());
    p.pitch = 0;
    p.health = PLAYER.maxHealth;
    p.alive = true;
    p.spawnTime = this.time;
    p.lastDamageTime = -99;
    if (p.isBot && Math.random() < 0.3) p.pendingPrimary = randomPrimary();
    p.primary = p.pendingPrimary;
    p.loadout = loadoutFor(p.primary).map((id: WeaponId) => weaponIndex(id));
    p.weapon = p.loadout[0];
    p.equipEndTick = 0;
    p.refillAmmo();
    p.brain?.reset();
    this.broadcast.push({ t: 'spawn', id: p.id, w: p.weapon });
  }

  // ───────────────────────── Match flow ─────────────────────────

  private matchInfo(): MatchInfo {
    return { phase: this.phase, map: this.map.id, timeLeft: Math.max(0, (this.phaseEndsTick - this.tick) * TICK_DT) };
  }

  private endMatch(): void {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.phaseEndsTick = this.tick + END_SCREEN_SEC * TICK_RATE;
    const ranking = [...this.players.values()]
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((p) => ({ id: p.id, kills: p.kills, deaths: p.deaths }));
    this.broadcast.push({ t: 'match', match: this.matchInfo(), ranking });
  }

  private restartMatch(): void {
    this.phase = 'running';
    this.map = getMap(nextMapId(this.map.id));
    this.phaseEndsTick = this.tick + MATCH.durationSec * TICK_RATE;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
    }
    this.broadcast.push({ t: 'match', match: this.matchInfo() });
    for (const p of this.players.values()) this.spawn(p);
  }

  // ───────────────────────── Networking ─────────────────────────

  private broadcastExcept(except: ServerPlayer, e: GameEvent): void {
    for (const p of this.players.values()) if (p !== except && !p.isBot) p.events.push(e);
  }

  private sendJson(p: ServerPlayer, msg: ServerJson): void {
    const s = p.socket;
    if (s && s.readyState === SOCKET_OPEN) s.send(JSON.stringify(msg));
  }

  private flush(): void {
    const shared = this.broadcast;
    this.broadcast = [];
    const all = [...this.players.values()];
    for (const p of all) {
      const s = p.socket;
      if (!s) continue;
      if (s.readyState !== SOCKET_OPEN) continue;
      if ((s.bufferedAmount ?? 0) > MAX_SOCKET_BUFFER) {
        s.close(4000, 'connection too slow');
        continue;
      }
      const events = shared.length ? [...shared, ...p.events] : p.events;
      p.events = [];
      if (events.length) s.send(JSON.stringify({ type: 'events', events }));
      const snap = encodeSnapshot({
        tick: this.tick,
        ack: p.lastSeq,
        self: { alive: p.alive, health: p.health, move: p.move },
        entities: all
          .filter((o) => o !== p)
          .map((o) => ({
            id: o.id,
            alive: o.alive,
            onGround: o.move.onGround,
            crouched: o.move.crouched,
            sliding: o.move.sliding,
            pos: o.move.pos,
            yaw: o.yaw,
            pitch: o.pitch,
            weapon: o.weapon,
          })),
      });
      s.send(snap);
    }
  }
}
