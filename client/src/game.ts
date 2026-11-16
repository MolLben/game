import * as THREE from 'three';
import {
  BOT_NAMES,
  BOT_TUNING,
  BotBrain,
  INTERP_DELAY_TICKS,
  MATCH,
  MOVE,
  PLAYER,
  PLAYER_COLORS,
  PRIMARY_WEAPONS,
  PROTOCOL_VERSION,
  TICK_DT,
  WEAPONS,
  WEAPON_ORDER,
  angleDiff,
  botShotDirections,
  clamp,
  copyVec,
  createMoveState,
  damageAt,
  distance,
  dot,
  eyeHeight,
  eyeOf,
  forwardFromAngles,
  getMap,
  navGraph,
  nextMapId,
  horizontalSpeed,
  meleeTrace,
  moveSpeedMult,
  pitchTowards,
  randomPrimary,
  recoilForShot,
  raycastBoxes,
  rightFromYaw,
  spreadDirection,
  stepMovement,
  traceShot,
  upFromAngles,
  vec3,
  yawTowards,
  type BotWorld,
  type GameEvent,
  type HitTarget,
  type JoinMode,
  type MapDef,
  type MatchInfo,
  type MoveInput,
  type MoveState,
  type PlayerInfo,
  type Snapshot,
  type Vec3,
  type WeaponId,
} from '@kinetic/shared';
import { Sfx } from './audio';
import { Avatar } from './avatar';
import { Effects } from './effects';
import { Hud } from './hud';
import { Input, isTouchDevice } from './input';
import { NetClient } from './net';
import { saveSettings, settings } from './settings';
import type { Fighter } from './types';
import { ViewModel } from './viewmodel';
import { WeaponController } from './weaponController';
import { WorldView } from './world';

type GameState = 'menu' | 'playing' | 'paused' | 'ended';
type Mode = 'offline' | 'online';

interface RemoteSnap {
  tick: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
  alive: boolean;
  crouched: boolean;
  weapon: number;
}

/** Any fighter other than the local player: an offline bot or a networked player. */
interface Actor {
  fighter: Fighter;
  avatar: Avatar;
  prevPos: Vec3;
  renderPos: Vec3;
  brain: BotBrain | null;
  snaps: RemoteSnap[];
}

interface PendingInput {
  seq: number;
  input: MoveInput;
  mult: number;
}

const HIT_COLOR = new THREE.Color('#ff5a3c');

function cloneMove(m: MoveState): MoveState {
  return { ...m, pos: { ...m.pos }, vel: { ...m.vel } };
}

export class Game {
  map: MapDef = getMap(settings.map);
  private world!: WorldView;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
  readonly input: Input;
  readonly hud = new Hud();
  readonly sfx = new Sfx();
  readonly fx: Effects;
  readonly vm = new ViewModel();
  readonly weapons = new WeaponController(settings.primary);

  mode: Mode = 'offline';
  net: NetClient | null = null;
  fighters: Fighter[] = [];
  actors: Actor[] = [];
  player: Fighter;
  state: GameState = 'menu';
  matchTime = 0;
  onStateChange: (s: GameState) => void = () => {};
  onDisconnect: (reason: string) => void = () => {};

  private actorById = new Map<number, Actor>();
  private acc = 0;
  private lastFrame = performance.now();
  private realTime = 0;
  private playerPrev = vec3();
  private smoothFeetY = 0;
  private eyeY: number = PLAYER.standEye;
  private landDip = 0;
  private roll = 0;
  private fovKick = 0;
  private recoilPending = 0;
  private recoilYawPending = 0;
  private recoilApplied = 0;
  private lastShotAt = -1;
  private stepDist = 0;
  private mouseDX = 0;
  private mouseDY = 0;
  private stickyTargetId: number | null = null;
  private killer: Fighter | null = null;
  private fpsFrames = 0;
  private fpsTime = 0;
  private pendingResume = false;
  private botWorld: BotWorld;

  // Online
  private seq = 0;
  private pending: PendingInput[] = [];
  private pendingShots: Vec3[][] = [];
  private pendingReload = false;
  private correction = vec3();
  private hardSnap = false;
  private matchEndsAt = 0;
  private matchPhase: MatchInfo['phase'] = 'running';

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // Phones: cap resolution a bit lower to keep the frame rate up.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice() ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.camera.rotation.order = 'YXZ';
    this.world = new WorldView(this.scene, this.map);
    this.fx = new Effects(this.scene);

    this.player = this.makeFighter({ id: 0, name: 'You', color: '#ffffff', isBot: false, kills: 0, deaths: 0 });
    this.camera.position.set(0, 8, 26);

    const self = this;
    this.botWorld = {
      get boxes() {
        return self.map.boxes;
      },
      get nav() {
        return navGraph(self.map);
      },
      get time() {
        return self.matchTime;
      },
      get fighters() {
        return self.fighters;
      },
      lineOfSight: (a, b) => this.lineOfSight(a, b),
    };

    this.vm.onCycle = (kind) => (kind === 'pump' ? this.sfx.pump() : this.sfx.bolt());

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.handleLock(locked);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    requestAnimationFrame(this.frame);
  }

  // ───────────────────────── Setup ─────────────────────────

  private makeFighter(info: PlayerInfo): Fighter {
    return {
      id: info.id,
      name: info.name,
      color: info.color,
      isBot: info.isBot,
      move: createMoveState(vec3()),
      yaw: 0,
      pitch: 0,
      health: PLAYER.maxHealth,
      alive: false,
      kills: info.kills,
      deaths: info.deaths,
      streak: 0,
      respawnAt: 0,
      spawnTime: 0,
      lastDamageTime: -99,
      weapon: 'rifle',
    };
  }

  private addActor(info: PlayerInfo, brain: BotBrain | null): Actor {
    const a: Actor = {
      fighter: this.makeFighter(info),
      avatar: new Avatar(info.name, info.color, this.scene),
      prevPos: vec3(),
      renderPos: vec3(),
      brain,
      snaps: [],
    };
    this.actors.push(a);
    this.actorById.set(info.id, a);
    this.fighters = [this.player, ...this.actors.map((x) => x.fighter)];
    return a;
  }

  private removeActor(id: number): void {
    const a = this.actorById.get(id);
    if (!a) return;
    a.avatar.dispose(this.scene);
    this.actorById.delete(id);
    this.actors = this.actors.filter((x) => x !== a);
    this.fighters = [this.player, ...this.actors.map((x) => x.fighter)];
  }

  private clearActors(): void {
    for (const a of this.actors) a.avatar.dispose(this.scene);
    this.actors = [];
    this.actorById.clear();
    this.fighters = [this.player];
  }

  private fighterById(id: number): Fighter | null {
    if (id === this.player.id) return this.player;
    return this.actorById.get(id)?.fighter ?? null;
  }

  private resetLocalMatch(): void {
    this.unlockStickyAim();
    this.hud.clearKillfeed();
    this.hud.hideEnd();
    this.equipLoadout(settings.primary);
    this.acc = 0;
    this.matchTime = 0;
    this.killer = null;
    this.player.alive = false;
    this.hud.hideDeath();
  }

  // ───────────────────────── Match flow ─────────────────────────

  startOffline(): void {
    this.leaveOnline();
    this.mode = 'offline';
    this.loadMap(settings.map);
    this.player.id = 0;
    this.player.name = 'You';
    this.player.color = '#ffffff';
    this.clearActors();
    for (let i = 0; i < settings.bots; i++) {
      this.addActor(
        { id: i + 1, name: BOT_NAMES[i % BOT_NAMES.length], color: PLAYER_COLORS[i % PLAYER_COLORS.length], isBot: true, kills: 0, deaths: 0 },
        new BotBrain(),
      ).fighter.weapon = randomPrimary();
    }
    for (const f of this.fighters) {
      f.kills = f.deaths = f.streak = 0;
    }
    this.resetLocalMatch();
    for (const f of this.fighters) this.spawnOffline(f);
    this.hud.setNetInfo('');
    this.resume();
  }

  async startOnline(url: string, name: string, mode: JoinMode, code?: string): Promise<void> {
    this.sfx.init();
    this.leaveOnline();
    const net = new NetClient();
    const welcome = await net.connect(url, { type: 'hello', version: PROTOCOL_VERSION, name, mode, code, primary: settings.primary, map: settings.map });
    this.net = net;
    this.mode = 'online';
    this.clearActors();
    const me = welcome.players.find((p) => p.id === welcome.id)!;
    this.player.id = me.id;
    this.player.name = me.name;
    this.player.color = me.color;
    this.player.kills = me.kills;
    this.player.deaths = me.deaths;
    for (const p of welcome.players) if (p.id !== me.id) this.addActor(p, null);
    this.resetLocalMatch();
    this.seq = 0;
    this.pending = [];
    this.pendingShots = [];
    this.pendingReload = false;
    this.loadMap(welcome.map);
    this.applyMatchInfo(welcome.match);
    this.hud.setNetInfo(`ROOM ${welcome.code}${welcome.isPrivate ? ' (private)' : ''}`);
    net.onSnapshot = (s) => this.handleSnapshot(s);
    net.onEvents = (e) => this.handleEvents(e);
    net.onClose = (reason) => {
      this.leaveOnline();
      this.setState('menu');
      this.onDisconnect(reason);
    };
    this.resume();
  }

  /** Leave the current online room (if any) and return to the menu backdrop. */
  leaveOnline(): void {
    if (this.net) {
      this.net.close();
      this.net = null;
    }
    if (this.mode === 'online') this.clearActors();
  }

  leave(): void {
    this.leaveOnline();
    this.clearActors();
    this.player.alive = false;
    this.input.unlock();
    this.setState('menu');
  }

  get roomCode(): string {
    return this.net?.code ?? '';
  }

  resume(): void {
    this.sfx.init();
    this.pendingResume = true;
    this.input.lock();
  }

  private handleLock(locked: boolean): void {
    if (locked && this.pendingResume) {
      this.pendingResume = false;
      this.hud.hideEnd();
      this.setState('playing');
      this.lastFrame = performance.now();
    } else if (!locked && this.state === 'playing') {
      this.setState('paused');
    }
  }

  private setState(s: GameState): void {
    this.state = s;
    this.hud.show(s === 'playing');
    this.onStateChange(s);
  }

  private endMatchOffline(): void {
    this.setState('ended');
    this.input.unlock();
    const ranked = [...this.fighters].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    this.hud.showEnd(ranked, this.player, `${ranked[0].name} wins with ${ranked[0].kills} eliminations`);
  }

  /** Swap the rendered + simulated map (no-op if already loaded). */
  loadMap(id: string): void {
    const next = getMap(id);
    if (next.id === this.map.id && this.world) return;
    this.world.dispose();
    this.map = next;
    this.world = new WorldView(this.scene, next);
    this.fx.clear();
  }

  private applyMatchInfo(m: MatchInfo): void {
    this.matchPhase = m.phase;
    this.matchEndsAt = this.realTime + m.timeLeft;
  }

  // ───────────────────────── Offline simulation ─────────────────────────

  private pickSpawn(f: Fighter): Vec3 {
    const scored = this.map.spawns.map((s) => {
      let minD = Infinity;
      for (const o of this.fighters) if (o !== f && o.alive) minD = Math.min(minD, distance(s, o.move.pos));
      return { s, d: minD + Math.random() * 6 };
    });
    scored.sort((a, b) => b.d - a.d);
    return scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
  }

  private spawnOffline(f: Fighter): void {
    const p = this.pickSpawn(f);
    f.move = createMoveState(p);
    f.yaw = yawTowards(p, vec3());
    f.pitch = 0;
    f.health = PLAYER.maxHealth;
    f.alive = true;
    f.spawnTime = this.matchTime;
    f.lastDamageTime = -99;
    if (f === this.player) {
      this.onLocalSpawn(settings.primary);
      copyVec(this.playerPrev, p);
      this.smoothFeetY = p.y;
    } else {
      const a = this.actorById.get(f.id)!;
      copyVec(a.prevPos, p);
      copyVec(a.renderPos, p);
      a.avatar.onSpawn();
      a.brain?.reset();
      if (Math.random() < 0.3) f.weapon = randomPrimary();
    }
  }

  private onLocalSpawn(primary: WeaponId): void {
    this.unlockStickyAim();
    this.eyeY = PLAYER.standEye;
    this.recoilApplied = this.recoilPending = this.recoilYawPending = 0;
    this.equipLoadout(primary);
    this.killer = null;
    this.hud.hideDeath();
    this.hud.setAimAssistIndicator(settings.aimAssist, settings.aimAssistStrength);
  }

  private equipLoadout(primary: WeaponId): void {
    this.weapons.setLoadout(primary);
    this.player.weapon = this.weapons.def.id;
    this.vm.setWeapon(this.weapons.def);
    this.updateSlots();
  }

  private updateSlots(): void {
    this.hud.setSlots(this.weapons.slots.map((d) => d.name), this.weapons.current);
  }

  private nextLoadoutText(): string {
    const keys = PRIMARY_WEAPONS.map((id, i) => `${i + 1} ${WEAPONS[id].name.split(' ')[0]}`).join(' · ');
    return `Next life: ${WEAPONS[settings.primary].name}  —  ${keys}`;
  }

  /** Choose the primary for the next life (menu or death screen). */
  setPrimary(id: WeaponId): void {
    settings.primary = id;
    saveSettings();
    this.net?.sendLoadout(id);
    this.hud.setNextLoadout(this.nextLoadoutText());
  }

  /** Offline-only damage application. Returns true on kill. */
  private damageOffline(target: Fighter, amount: number, attacker: Fighter | null, head: boolean, weapon: string): boolean {
    if (!target.alive || this.matchTime - target.spawnTime < MATCH.spawnProtection) return false;
    target.health -= amount;
    target.lastDamageTime = this.matchTime;
    if (target === this.player) {
      if (attacker) this.onLocalDamaged(amount, attacker.move.pos);
    } else {
      const a = this.actorById.get(target.id)!;
      a.avatar.onHit();
      a.brain?.onDamaged(target, attacker);
    }
    if (target.health <= 0) {
      target.respawnAt = this.matchTime + MATCH.respawnDelay;
      this.applyKill(attacker, target, head, weapon);
      if (attacker && attacker.kills >= MATCH.killLimit) this.endMatchOffline();
      return true;
    }
    return false;
  }

  private onLocalDamaged(amount: number, from: Vec3): void {
    this.sfx.hurt();
    this.hud.flashDamage(amount);
    const rel = yawTowards(this.player.move.pos, from) - this.player.yaw;
    this.hud.damageIndicator(-rel);
  }

  /** Bookkeeping + UI for a kill (used by offline sim and server events). */
  private applyKill(attacker: Fighter | null, target: Fighter, head: boolean, weapon: string): void {
    target.alive = false;
    target.health = 0;
    target.deaths++;
    target.streak = 0;
    const killer = attacker && attacker !== target ? attacker : null;
    if (killer) {
      killer.kills++;
      killer.streak++;
    }
    const mine = target === this.player || killer === this.player;
    this.hud.killfeed(killer, target, weapon, head, mine);

    if (target === this.player) {
      this.killer = killer;
      target.respawnAt = this.matchTime + MATCH.respawnDelay;
      this.weapons.ads = 0;
      this.hud.showDeath(killer ? killer.name : 'the void', weapon);
      this.hud.setNextLoadout(this.nextLoadoutText());
    } else {
      this.actorById.get(target.id)?.avatar.onDeath(this.realTime);
    }
    if (killer === this.player) {
      this.sfx.kill();
      const s = this.player.streak;
      const msg = s >= 5 ? `RAMPAGE ×${s}` : s === 3 ? 'TRIPLE KILL' : s === 2 ? 'DOUBLE KILL' : '';
      this.hud.centerMessage(`${head ? 'HEADSHOT · ' : ''}ELIMINATED ${target.name}`, msg);
    }
  }

  lineOfSight(a: Vec3, b: Vec3): boolean {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) return true;
    return !raycastBoxes(a, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.05, this.map.boxes);
  }

  private renderPosOf(f: Fighter): Vec3 {
    if (f === this.player) return f.move.pos;
    return this.actorById.get(f.id)?.renderPos ?? f.move.pos;
  }

  /** Hit targets as currently displayed (interpolated) on this client. */
  private hitTargets(): HitTarget[] {
    return this.fighters.filter((f) => f.alive).map((f) => ({ id: f.id, pos: this.renderPosOf(f), crouched: f.move.crouched }));
  }

  private botFireOffline(a: Actor, target: Fighter): void {
    const f = a.fighter;
    const def = WEAPONS[f.weapon];
    const origin = eyeOf(f);
    const muzzle = a.avatar.muzzleWorld(a.renderPos, f.yaw, f.move.crouched);
    const targets = this.hitTargets();
    const results = new Map<Fighter, { dmg: number; head: boolean }>();
    const dirs = botShotDirections(origin, this.renderPosOf(target), target, !f.move.onGround, def);
    dirs.forEach((dir, i) => {
      const hit = traceShot(origin, dir, def.range, this.map.boxes, targets, f.id);
      if (i % 3 === 0) this.fx.tracer(muzzle, hit.point, '#ffd08a', 0.022);
      const victim = hit.targetId >= 0 ? this.fighterById(hit.targetId) : null;
      if (victim) {
        this.fx.sparks(hit.point, hit.normal ?? { x: 0, y: 1, z: 0 }, HIT_COLOR, 6, 3);
        const r = results.get(victim) ?? { dmg: 0, head: false };
        r.dmg += damageAt(def, hit.t, hit.head) * BOT_TUNING.damageScale;
        r.head ||= hit.head;
        results.set(victim, r);
      } else if (hit.normal) {
        this.fx.impact(hit.point, hit.normal);
      }
    });
    a.avatar.muzzleFlash();
    this.sfx.shot(def.id, origin);
    for (const [v, r] of results) this.damageOffline(v, r.dmg, f, r.head, def.name);
  }

  // ───────────────────────── Online: server messages ─────────────────────────

  private handleSnapshot(s: Snapshot): void {
    for (const e of s.entities) {
      const a = this.actorById.get(e.id);
      if (!a) continue;
      a.snaps.push({ tick: s.tick, pos: e.pos, yaw: e.yaw, pitch: e.pitch, alive: e.alive, crouched: e.crouched, weapon: e.weapon });
      if (a.snaps.length > 60) a.snaps.shift();
    }

    const p = this.player;
    p.health = s.self.health;
    this.pending = this.pending.filter((x) => x.seq > s.ack);
    if (!s.self.alive || !p.alive) return;

    // Reconcile: rewind to the server's authoritative state, replay unacknowledged inputs.
    const before = { ...p.move.pos };
    p.move = cloneMove(s.self.move);
    for (const x of this.pending) stepMovement(p.move, x.input, TICK_DT, this.map.boxes, x.mult, this.map.pads);
    const d = { x: p.move.pos.x - before.x, y: p.move.pos.y - before.y, z: p.move.pos.z - before.z };
    if (this.hardSnap || Math.hypot(d.x, d.y, d.z) > 2) {
      this.hardSnap = false;
      copyVec(this.playerPrev, p.move.pos);
      this.smoothFeetY = p.move.pos.y;
      this.correction = vec3();
    } else {
      // Shift the interpolation base and hide the error with a decaying visual offset.
      this.playerPrev.x += d.x;
      this.playerPrev.y += d.y;
      this.playerPrev.z += d.z;
      this.correction.x -= d.x;
      this.correction.y -= d.y;
      this.correction.z -= d.z;
    }
  }

  private handleEvents(events: GameEvent[]): void {
    for (const e of events) {
      switch (e.t) {
        case 'join':
          if (e.p.id !== this.player.id && !this.actorById.has(e.p.id)) this.addActor(e.p, null);
          break;
        case 'leave':
          this.removeActor(e.id);
          break;
        case 'spawn':
          if (e.id === this.player.id) {
            this.player.alive = true;
            this.player.health = PLAYER.maxHealth;
            this.player.spawnTime = this.matchTime;
            this.hardSnap = true;
            this.onLocalSpawn(WEAPON_ORDER[e.w] ?? settings.primary);
          } else {
            this.actorById.get(e.id)?.avatar.onSpawn();
          }
          break;
        case 'shot': {
          const a = this.actorById.get(e.id);
          if (!a) break;
          const f = a.fighter;
          const from = a.avatar.muzzleWorld(a.renderPos, f.yaw, f.move.crouched);
          for (const [x, y, z, nx, ny, nz, hitPlayer] of e.e) {
            const pt = { x, y, z };
            const n = { x: nx, y: ny, z: nz };
            this.fx.tracer(from, pt, '#ffd08a', 0.022);
            if (hitPlayer) this.fx.sparks(pt, n, HIT_COLOR, 6, 3);
            else if (nx || ny || nz) this.fx.impact(pt, n);
          }
          if (e.w !== 'knife') a.avatar.muzzleFlash();
          this.sfx.shot(e.w, from);
          break;
        }
        case 'hit':
          this.hud.hitmarker(e.kill ? 'kill' : e.head ? 'head' : 'hit');
          this.hud.damageNumber(e.dmg, e.head, e.kill);
          this.sfx.hit(e.head);
          if (this.weapons.def.melee) this.sfx.knifeHit();
          this.actorById.get(e.target)?.avatar.onHit();
          break;
        case 'damage':
          this.onLocalDamaged(e.amount, { x: e.x, y: 0, z: e.z });
          break;
        case 'kill': {
          const victim = this.fighterById(e.victim);
          if (victim) this.applyKill(this.fighterById(e.killer), victim, e.head, e.w);
          break;
        }
        case 'match':
          this.applyMatchInfo(e.match);
          if (e.match.phase === 'ended' && e.ranking) {
            const ranked = e.ranking.map((r) => this.fighterById(r.id)).filter((f): f is Fighter => !!f);
            for (const r of e.ranking) {
              const f = this.fighterById(r.id);
              if (f) {
                f.kills = r.kills;
                f.deaths = r.deaths;
              }
            }
            if (ranked.length) {
              this.hud.showEnd(ranked, this.player, `${ranked[0].name} wins · next: ${getMap(nextMapId(e.match.map)).name} in ${Math.round(e.match.timeLeft)}s`);
              this.input.unlock();
              this.setState('ended');
            }
          } else if (e.match.phase === 'running') {
            this.loadMap(e.match.map);
            for (const f of this.fighters) {
              f.kills = f.deaths = f.streak = 0;
            }
            this.hud.clearKillfeed();
          }
          break;
      }
    }
  }

  // ───────────────────────── Shooting ─────────────────────────

  currentSpread(): number {
    const def = this.weapons.def;
    const m = this.player.move;
    const moveF = clamp(horizontalSpeed(m.vel) / MOVE.runSpeed, 0, 1.5);
    let s = def.spreadHip + (def.spreadAds - def.spreadHip) * this.weapons.ads + this.weapons.bloom;
    s += m.onGround ? def.spreadMove * moveF : def.spreadAir;
    if (m.crouched && m.onGround && !m.sliding) s *= 0.8;
    return s;
  }

  private playerMelee(): void {
    const def = this.weapons.def;
    const p = this.player;
    const origin = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const hit = meleeTrace(origin, p.yaw, p.pitch, def.range, this.map.boxes, this.hitTargets(), p.id);
    this.vm.kick(1);
    this.sfx.knifeSwing();
    this.lastShotAt = this.realTime;
    const victim = hit.targetId >= 0 ? this.fighterById(hit.targetId) : null;
    if (this.mode === 'online') this.pendingShots.push([forwardFromAngles(p.yaw, p.pitch)]);
    if (victim) {
      this.fx.sparks(hit.point, hit.normal ?? { x: 0, y: 1, z: 0 }, HIT_COLOR, 10, 3);
      if (this.mode === 'offline') {
        const killed = this.damageOffline(victim, def.damage, p, false, def.name);
        this.hud.hitmarker(killed ? 'kill' : 'hit');
        this.hud.damageNumber(def.damage, false, killed);
        this.sfx.knifeHit();
      }
    } else if (hit.normal && hit.t < def.range) {
      this.fx.sparks(hit.point, hit.normal, new THREE.Color('#ffd27a'), 5, 2);
      this.sfx.knifeHit();
    }
  }

  private playerShoot(shotIndex: number): void {
    const def = this.weapons.def;
    if (def.melee) {
      this.playerMelee();
      return;
    }
    const p = this.player;
    const origin = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const spread = this.currentSpread();
    const ads = this.weapons.ads;

    const mo = this.vm.muzzleOffset();
    const r = rightFromYaw(p.yaw);
    const u = upFromAngles(p.yaw, p.pitch);
    const fw = forwardFromAngles(p.yaw, p.pitch);
    const muzzle = {
      x: origin.x + r.x * mo.x + u.x * mo.y - fw.x * mo.z,
      y: origin.y + r.y * mo.x + u.y * mo.y - fw.y * mo.z,
      z: origin.z + r.z * mo.x + u.z * mo.y - fw.z * mo.z,
    };

    const targets = this.hitTargets();
    const dirs: Vec3[] = [];
    const results = new Map<Fighter, { dmg: number; head: boolean }>();
    for (let i = 0; i < def.pellets; i++) {
      const dir = spreadDirection(p.yaw, p.pitch, spread);
      dirs.push(dir);
      const hit = traceShot(origin, dir, def.range, this.map.boxes, targets, p.id);
      if (def.pellets === 1 || i % 3 === 0) this.fx.tracer(muzzle, hit.point);
      const victim = hit.targetId >= 0 ? this.fighterById(hit.targetId) : null;
      if (victim) {
        const acc = results.get(victim) ?? { dmg: 0, head: false };
        acc.dmg += damageAt(def, hit.t, hit.head);
        acc.head ||= hit.head;
        results.set(victim, acc);
        this.fx.sparks(hit.point, hit.normal ?? fw, HIT_COLOR, 8, 3);
      } else if (hit.normal) {
        this.fx.impact(hit.point, hit.normal);
      }
    }

    if (this.mode === 'online') {
      // Server decides hits (with lag compensation); hitmarkers arrive as 'hit' events.
      this.pendingShots.push(dirs);
    } else {
      let anyHead = false;
      let anyKill = false;
      for (const [f, res] of results) {
        anyHead ||= res.head;
        const killed = this.damageOffline(f, res.dmg, p, res.head, def.name);
        if (killed) anyKill = true;
        this.hud.damageNumber(res.dmg, res.head, killed);
      }
      if (results.size > 0) {
        this.hud.hitmarker(anyKill ? 'kill' : anyHead ? 'head' : 'hit');
        this.sfx.hit(anyHead);
      }
    }

    // Learnable recoil pattern + a little jitter; ADS softens it.
    const kick = recoilForShot(def, shotIndex);
    const jit = def.recoil.jitter;
    const adsSoften = 1 - 0.35 * ads;
    this.recoilPending += kick.pitch * (1 + (Math.random() * 2 - 1) * jit) * adsSoften;
    this.recoilYawPending += (kick.yaw + (Math.random() * 2 - 1) * def.recoil.side * jit) * adsSoften;
    this.lastShotAt = this.realTime;
    this.vm.kick(def.id === 'shotgun' || def.id === 'sniper' ? 2 : 1);
    this.sfx.shot(def.id);
    if (def.cycle === 'none') this.sfx.casing();
  }

  // ───────────────────────── Frame / tick ─────────────────────────

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.realTime += dt;

    // Online play keeps simulating while paused/ended — the server doesn't stop.
    const simulate = this.state === 'playing' || (this.mode === 'online' && this.net !== null && this.state !== 'menu');
    if (simulate) {
      if (this.state === 'playing') this.updatePlayerFrame(dt);
      else this.mouseDX = this.mouseDY = 0;
      this.acc += dt;
      while (this.acc >= TICK_DT) {
        this.tick(TICK_DT);
        this.acc -= TICK_DT;
      }
    } else {
      this.mouseDX = this.mouseDY = 0;
      if (this.state === 'menu') {
        const t = this.realTime * 0.06;
        const r = this.map.size + 6;
        this.camera.position.set(Math.sin(t) * r, 14, Math.cos(t) * r);
        this.camera.lookAt(0, 2, 0);
      }
    }

    const alpha = simulate ? this.acc / TICK_DT : 1;
    this.updateView(dt, alpha);
    this.fx.update(dt);
    this.world.update(dt);
    this.render();
    this.input.endFrame();

    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.hud.stats(Math.round(this.fpsFrames / this.fpsTime), horizontalSpeed(this.player.move.vel), this.net ? Math.round(this.net.rtt) : -1);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  };

  /**
   * Toggle or acquire GTA-style sticky aim lock on the best available enemy.
   */
  toggleStickyAim(): void {
    if (!settings.stickyAim || !this.player.alive) {
      this.unlockStickyAim();
      return;
    }
    if (this.stickyTargetId !== null) {
      // Manual unlock
      this.unlockStickyAim();
      this.hud.centerMessage('AIM UNLOCKED', 'Target cleared');
      return;
    }
    const eye = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
    const fwd = forwardFromAngles(this.player.yaw, this.player.pitch);
    const target = this.findStickyTarget(eye, fwd);
    if (target) {
      this.stickyTargetId = target.fighter.id;
      this.sfx.swap();
      this.hud.updateLockBtn(true, target.fighter.name);
      this.hud.centerMessage(`LOCKED: ${target.fighter.name.toUpperCase()}`, 'Sticky tracking [E to unlock]');
    } else {
      this.hud.centerMessage('NO TARGET IN RANGE', 'Look towards an enemy to lock');
    }
  }

  unlockStickyAim(): void {
    this.stickyTargetId = null;
    this.hud.setTargetLock(false);
    this.hud.updateLockBtn(false);
  }

  private findStickyTarget(eye: Vec3, fwd: Vec3): { fighter: Fighter; pos: Vec3 } | null {
    const maxDist = 50;
    const maxAngle = 0.52; // ~30 deg wide acquisition cone

    let best: { fighter: Fighter; pos: Vec3 } | null = null;
    let bestScore = Infinity;

    for (const f of this.fighters) {
      if (f === this.player || !f.alive) continue;
      // In online multiplayer, strictly exclude human players
      if (this.mode === 'online' && !f.isBot) continue;

      const basePos = this.renderPosOf(f);
      const chestY = basePos.y + (f.move.crouched ? 0.75 : 1.15);
      const targetPos = { x: basePos.x, y: chestY, z: basePos.z };

      const dx = targetPos.x - eye.x;
      const dy = targetPos.y - eye.y;
      const dz = targetPos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.5 || dist > maxDist) continue;

      const toDir = { x: dx / dist, y: dy / dist, z: dz / dist };
      const dotProd = dot(fwd, toDir);
      if (dotProd < Math.cos(maxAngle)) continue;

      const angle = Math.acos(clamp(dotProd, -1, 1));
      if (angle >= maxAngle) continue;

      if (!this.lineOfSight(eye, targetPos)) continue;

      const score = angle * (1 + (dist / maxDist) * 0.4);
      if (score < bestScore) {
        bestScore = score;
        best = { fighter: f, pos: targetPos };
      }
    }
    return best;
  }

  /**
   * GTA-inspired Soft Aim Assist: finds the closest visible enemy within a soft angular cone.
   * In online multiplayer, human opponents are excluded to guarantee fair play.
   */
  private findAimAssistTarget(eye: Vec3, fwd: Vec3, zoom: number): { fighter: Fighter; pos: Vec3; angle: number } | null {
    const maxDist = 45;
    const maxAngle = 0.22 / Math.sqrt(zoom); // ~12.5 deg hipfire, narrower when scoped

    let bestTarget: { fighter: Fighter; pos: Vec3; angle: number } | null = null;
    let bestScore = Infinity;

    for (const f of this.fighters) {
      if (f === this.player || !f.alive) continue;
      // Guarantee multiplayer fairness: do not assist / lock against human players
      if (this.mode === 'online' && !f.isBot) continue;

      const basePos = this.renderPosOf(f);
      // Target center-mass (chest)
      const chestY = basePos.y + (f.move.crouched ? 0.75 : 1.15);
      const targetPos = { x: basePos.x, y: chestY, z: basePos.z };

      const dx = targetPos.x - eye.x;
      const dy = targetPos.y - eye.y;
      const dz = targetPos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.5 || dist > maxDist) continue;

      const toDir = { x: dx / dist, y: dy / dist, z: dz / dist };
      const dotProd = dot(fwd, toDir);
      if (dotProd < Math.cos(maxAngle)) continue;

      const angle = Math.acos(clamp(dotProd, -1, 1));
      if (angle >= maxAngle) continue;

      // Line of sight check against map geometry
      if (!this.lineOfSight(eye, targetPos)) continue;

      // Prioritize small angular difference to crosshair, then proximity
      const score = angle * (1 + (dist / maxDist) * 0.4);
      if (score < bestScore) {
        bestScore = score;
        bestTarget = { fighter: f, pos: targetPos, angle };
      }
    }
    return bestTarget;
  }

  private updatePlayerFrame(dt: number): void {
    const inp = this.input;
    const p = this.player;
    const w = this.weapons;
    const { dx, dy } = inp.consumeMouse();
    this.mouseDX = dx;
    this.mouseDY = dy;

    if (!p.alive) {
      w.ads = 0;
      PRIMARY_WEAPONS.forEach((id, i) => {
        if (inp.wasPressed(`Digit${i + 1}`)) this.setPrimary(id);
      });
      return;
    }

    if (inp.wasPressed('KeyH')) {
      settings.aimAssist = !settings.aimAssist;
      saveSettings();
      const statusEl = document.getElementById('v-aa-status');
      const checkEl = document.getElementById('set-aim-assist') as HTMLInputElement | null;
      if (statusEl) {
        statusEl.textContent = settings.aimAssist ? 'ON' : 'OFF';
        statusEl.className = `status-pill ${settings.aimAssist ? 'on' : 'off'}`;
      }
      if (checkEl) checkEl.checked = settings.aimAssist;
      this.hud.setAimAssistIndicator(settings.aimAssist, settings.aimAssistStrength);
      this.hud.centerMessage(
        `AIM ASSIST ${settings.aimAssist ? 'ON' : 'OFF'}`,
        settings.aimAssist ? `Strength: ${Math.round(settings.aimAssistStrength * 100)}%` : 'Disabled',
      );
    }

    const zoom = 1 + (w.def.adsZoom - 1) * w.ads;
    const adsMult = 1 + (settings.adsSensMult - 1) * w.ads;
    let sens = (0.0022 * settings.sensitivity * adsMult) / zoom;

    // GTA-inspired Soft Aim Assist
    if (settings.aimAssist) {
      const eye = { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z };
      const fwd = forwardFromAngles(p.yaw, p.pitch);
      const aaTarget = this.findAimAssistTarget(eye, fwd, zoom);
      if (aaTarget) {
        const strength = clamp(settings.aimAssistStrength ?? 0.5, 0, 1);
        const maxAngle = 0.22 / Math.sqrt(zoom);
        const proximity = 1 - clamp(aaTarget.angle / maxAngle, 0, 1);

        // 1. Crosshair friction / slowdown: reduces sensitivity slightly when sweeping across target
        const friction = 1 - 0.38 * strength * proximity;
        sens *= friction;

        // 2. Smooth, gradual magnetic pull towards target center-mass (no snapping)
        const wantYaw = yawTowards(eye, aaTarget.pos);
        const wantPitch = pitchTowards(eye, aaTarget.pos);
        const diffYaw = angleDiff(wantYaw, p.yaw);
        const diffPitch = wantPitch - p.pitch;

        const pullRate = 2.2 * strength * proximity;
        p.yaw += diffYaw * Math.min(0.25, pullRate * dt);
        p.pitch += diffPitch * Math.min(0.25, pullRate * dt);

        // 3. Subtle GTA-style ADS acquisition assist
        if (w.ads > 0 && w.ads < 0.6 && inp.button(2)) {
          const adsNudge = 1.6 * strength * dt;
          p.yaw += diffYaw * adsNudge;
          p.pitch += diffPitch * adsNudge;
        }
      }
    }

    p.yaw -= dx * sens;
    const dp = -dy * sens;
    p.pitch += dp;
    if (dp < 0) this.recoilApplied = Math.max(0, this.recoilApplied + dp);

    // Recoil: applied smoothly, then auto-recovers when you stop firing
    const k = 1 - Math.exp(-dt * 28);
    const ap = this.recoilPending * k;
    p.pitch += ap;
    this.recoilPending -= ap;
    this.recoilApplied += ap;
    const ay = this.recoilYawPending * k;
    p.yaw += ay;
    this.recoilYawPending -= ay;
    if (this.realTime - this.lastShotAt > 0.15) {
      const rcv = this.recoilApplied * (1 - Math.exp(-dt * 5));
      p.pitch -= rcv;
      this.recoilApplied -= rcv;
    }
    p.pitch = clamp(p.pitch, -1.55, 1.55);
    p.yaw = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw));

    let next = -1;
    const n = w.slots.length;
    for (let i = 0; i < n; i++) if (inp.wasPressed(`Digit${i + 1}`)) next = i;
    if (inp.wasPressed('KeyV')) next = w.slots.findIndex((d) => d.melee);
    if (inp.wasPressed('KeyQ')) next = w.previous;
    if (inp.wheel !== 0) next = (w.current + inp.wheel + n) % n;
    if (next >= 0 && w.switchTo(next)) {
      this.vm.setWeapon(w.def);
      this.player.weapon = w.def.id;
      this.sfx.swap();
      this.updateSlots();
    }
    if (inp.wasPressed('KeyR') && w.startReload()) {
      if (!w.isShellReload) this.sfx.reload(w.def.reloadTime);
      this.pendingReload = true;
    }

    const res = w.update(dt, inp.button(0), inp.buttonPressed(0), inp.button(2));
    if (res.fired) this.playerShoot(res.shotIndex);
    if (res.shellLoaded) this.sfx.shell();
    if (res.reloadStarted) {
      if (!w.isShellReload) this.sfx.reload(w.def.reloadTime);
      this.pendingReload = true;
    }
    if (res.dry) this.sfx.dry();
  }

  private tick(dt: number): void {
    this.matchTime += dt;
    const p = this.player;
    const inp = this.input;
    const playing = this.state === 'playing';
    copyVec(this.playerPrev, p.move.pos);

    // Quantize exactly like the wire format so prediction matches the server bit-for-bit.
    const move: MoveInput = {
      forward: playing ? (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) : 0,
      right: playing ? (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0) : 0,
      jump: playing && inp.down('Space'),
      crouch: playing && (inp.down('ShiftLeft') || inp.down('ShiftRight') || inp.down('KeyC')),
      yaw: Math.fround(p.yaw),
    };
    const adsByte = Math.round(this.weapons.ads * 255);
    const mult = moveSpeedMult(this.weapons.globalIndex, adsByte);

    if (p.alive) {
      const ev = stepMovement(p.move, move, dt, this.map.boxes, mult, this.map.pads);
      if (ev.launched) this.sfx.jumpPad();
      if (ev.jumped) this.sfx.jump();
      if (ev.landed && ev.landSpeed > 4) {
        this.sfx.land(ev.landSpeed);
        this.landDip = Math.min(0.14, ev.landSpeed * 0.012);
      }
      if (ev.slideStarted) this.sfx.slide();
      const hs = horizontalSpeed(p.move.vel);
      if (p.move.onGround && !p.move.sliding && hs > 2) {
        this.stepDist += hs * dt;
        if (this.stepDist > (p.move.crouched ? 1.6 : 2.4)) {
          this.stepDist = 0;
          if (!p.move.crouched) this.sfx.footstep();
        }
      }
    }

    if (this.mode === 'online') {
      this.tickOnline(move, adsByte, mult);
    } else {
      this.tickOffline(dt);
    }
  }

  private tickOnline(move: MoveInput, adsByte: number, mult: number): void {
    const net = this.net;
    if (!net) return;
    const p = this.player;
    this.seq++;
    this.pending.push({ seq: this.seq, input: move, mult });
    if (this.pending.length > 180) this.pending.shift();
    net.sendInput({
      seq: this.seq,
      forward: move.forward,
      right: move.right,
      jump: move.jump,
      crouch: move.crouch,
      reload: this.pendingReload,
      weapon: this.weapons.globalIndex,
      ads: adsByte,
      yaw: move.yaw,
      pitch: Math.fround(p.pitch),
      viewTick: net.serverTick() - INTERP_DELAY_TICKS,
      shots: this.pendingShots,
    });
    this.pendingShots = [];
    this.pendingReload = false;
  }

  private tickOffline(dt: number): void {
    const p = this.player;
    if (p.alive && p.move.pos.y < this.map.killY) {
      p.respawnAt = this.matchTime + MATCH.respawnDelay;
      this.applyKill(null, p, false, 'fell');
    }
    for (const a of this.actors) {
      const f = a.fighter;
      copyVec(a.prevPos, f.move.pos);
      if (!f.alive || !a.brain) continue;
      const weapon = WEAPONS[f.weapon];
      const d = a.brain.think(f, this.botWorld, dt, weapon);
      stepMovement(f.move, d.input, dt, this.map.boxes, BOT_TUNING.speedMult * weapon.moveMult, this.map.pads);
      if (d.fireAt) this.botFireOffline(a, d.fireAt as Fighter);
      if (f.alive && f.move.pos.y < this.map.killY) {
        f.respawnAt = this.matchTime + MATCH.respawnDelay;
        this.applyKill(null, f, false, 'fell');
      }
    }
    for (const f of this.fighters) {
      if (f.alive && f.health < PLAYER.maxHealth && this.matchTime - f.lastDamageTime > MATCH.regenDelay) {
        f.health = Math.min(PLAYER.maxHealth, f.health + MATCH.regenPerSec * dt);
      }
      if (!f.alive && this.matchTime >= f.respawnAt) this.spawnOffline(f);
    }
    if (this.matchTime >= MATCH.durationSec && this.state === 'playing') this.endMatchOffline();
  }

  // ───────────────────────── View ─────────────────────────

  private updateActors(dt: number, alpha: number): void {
    if (this.mode === 'online' && this.net) {
      const rt = this.net.serverTick() - INTERP_DELAY_TICKS;
      for (const a of this.actors) {
        const sn = a.snaps;
        if (!sn.length) continue;
        while (sn.length > 2 && sn[1].tick < rt - 2) sn.shift();
        const bi = sn.findIndex((s) => s.tick >= rt);
        let A: RemoteSnap;
        let B: RemoteSnap;
        let t = 0;
        if (bi === -1) A = B = sn[sn.length - 1];
        else if (bi === 0) A = B = sn[0];
        else {
          A = sn[bi - 1];
          B = sn[bi];
          t = clamp((rt - A.tick) / Math.max(1, B.tick - A.tick), 0, 1);
        }
        if (A.alive !== B.alive) A = B = t < 0.5 ? A : B; // never lerp across death/respawn
        const f = a.fighter;
        a.renderPos.x = A.pos.x + (B.pos.x - A.pos.x) * t;
        a.renderPos.y = A.pos.y + (B.pos.y - A.pos.y) * t;
        a.renderPos.z = A.pos.z + (B.pos.z - A.pos.z) * t;
        f.yaw = A.yaw + angleDiff(B.yaw, A.yaw) * t;
        f.pitch = A.pitch + (B.pitch - A.pitch) * t;
        const cur = t < 0.5 ? A : B;
        f.alive = cur.alive;
        f.move.crouched = cur.crouched;
        f.weapon = WEAPON_ORDER[cur.weapon] ?? 'rifle';
        a.avatar.setWeapon(f.weapon);
        copyVec(f.move.pos, a.renderPos);
        a.avatar.update(a.renderPos, f.yaw, f.pitch, f.move.crouched, f.alive, dt, this.realTime);
      }
    } else {
      for (const a of this.actors) {
        const f = a.fighter;
        a.renderPos.x = a.prevPos.x + (f.move.pos.x - a.prevPos.x) * alpha;
        a.renderPos.y = a.prevPos.y + (f.move.pos.y - a.prevPos.y) * alpha;
        a.renderPos.z = a.prevPos.z + (f.move.pos.z - a.prevPos.z) * alpha;
        a.avatar.setWeapon(f.weapon);
        a.avatar.update(a.renderPos, f.yaw, f.pitch, f.move.crouched, f.alive, dt, this.realTime);
      }
    }
  }

  private updateView(dt: number, alpha: number): void {
    const p = this.player;
    const w = this.weapons;
    this.updateActors(dt, alpha);
    if (this.state === 'menu') return;

    if (p.alive) {
      const decay = Math.exp(-dt * 12);
      this.correction.x *= decay;
      this.correction.y *= decay;
      this.correction.z *= decay;
      const x = this.playerPrev.x + (p.move.pos.x - this.playerPrev.x) * alpha + this.correction.x;
      const y = this.playerPrev.y + (p.move.pos.y - this.playerPrev.y) * alpha + this.correction.y;
      const z = this.playerPrev.z + (p.move.pos.z - this.playerPrev.z) * alpha + this.correction.z;
      if (p.move.onGround && Math.abs(y - this.smoothFeetY) < 0.7) {
        this.smoothFeetY += (y - this.smoothFeetY) * Math.min(1, dt * 22);
      } else {
        this.smoothFeetY = y;
      }
      this.eyeY += (eyeHeight(p.move) - this.eyeY) * Math.min(1, dt * 14);
      this.landDip *= Math.exp(-dt * 9);
      this.roll += ((p.move.sliding ? 0.06 : 0) - this.roll) * Math.min(1, dt * 8);
      this.camera.position.set(x, this.smoothFeetY + this.eyeY - this.landDip, z);
      this.camera.rotation.set(p.pitch, p.yaw, this.roll);
    } else {
      const lowY = p.move.pos.y + 0.5;
      this.camera.position.y += (lowY - this.camera.position.y) * Math.min(1, dt * 4);
      if (this.killer) {
        const want = yawTowards(this.camera.position, this.renderPosOf(this.killer));
        const d = angleDiff(want, this.camera.rotation.y);
        this.camera.rotation.y += d * Math.min(1, dt * 3);
        this.camera.rotation.x *= 1 - Math.min(1, dt * 3);
      }
      this.camera.rotation.z += (0.25 - this.camera.rotation.z) * Math.min(1, dt * 3);
      this.hud.updateDeathTimer(Math.max(0, p.respawnAt - this.matchTime));
    }

    this.fovKick += ((p.move.sliding ? 6 : 0) - this.fovKick) * Math.min(1, dt * 6);
    const hfov = THREE.MathUtils.degToRad(settings.fov + this.fovKick);
    const zoom = 1 + (w.def.adsZoom - 1) * w.ads;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect / zoom);
    this.camera.fov = THREE.MathUtils.radToDeg(vfov);
    this.camera.updateProjectionMatrix();

    const scoped = p.alive && w.def.scoped && w.ads > 0.85;
    this.hud.setScope(scoped);
    this.vm.update(dt, {
      ads: w.ads,
      speed: horizontalSpeed(p.move.vel),
      onGround: p.move.onGround,
      sliding: p.move.sliding,
      mouseDX: this.mouseDX,
      mouseDY: this.mouseDY,
      reloadProgress: w.reloadProgress,
      shellReload: w.isShellReload,
      switchProgress: w.switchProgress,
    });
    this.vm.scene.visible = p.alive && !scoped;

    const spreadPx = (Math.tan(this.currentSpread()) / Math.tan(vfov / 2)) * (window.innerHeight / 2);
    this.hud.setCrosshair(spreadPx, !p.alive || scoped ? 'none' : w.ads > 0.6 || w.def.melee ? 'dot' : 'full');
    this.hud.setHealth(p.health);
    const reloadBar = !w.reloading ? -1 : w.isShellReload ? w.mag / w.def.magSize : w.reloadProgress;
    this.hud.setAmmo(w.def.name, w.mag, w.def.magSize, reloadBar);

    const leader = this.fighters.reduce((a, b) => (b.kills > a.kills ? b : a), this.fighters[0]);
    const timeLeft =
      this.mode === 'online'
        ? this.matchPhase === 'running'
          ? Math.max(0, this.matchEndsAt - this.realTime)
          : 0
        : Math.max(0, MATCH.durationSec - this.matchTime);
    this.hud.setTop(p.kills, leader, timeLeft, MATCH.killLimit);
    this.hud.scoreboard(this.fighters, this.input.down('Tab'), p);

    const fwd = forwardFromAngles(this.camera.rotation.y, this.camera.rotation.x);
    this.sfx.setListener(this.camera.position, fwd);
  }

  private render(): void {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.state !== 'menu' && this.vm.scene.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.vm.scene, this.vm.camera);
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
  }
}
