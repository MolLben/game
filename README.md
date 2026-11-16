<<<<<<< HEAD
# KINETIC (working title)

Browser-based arena FPS. **Phase 3: weapons & combat feel** on top of the Phase 2 online multiplayer
(authoritative server, quick play, private rooms, prediction, interpolation, lag-compensated hitscan).
Offline practice vs bots is still available.

## Weapons

Pick a **primary** in the menu (or press 1–4 while dead — applies on respawn); everyone also carries a pistol and a knife.

| Weapon | Role | Notes |
|---|---|---|
| Arc-7 Rifle | All-rounder | Full-auto, learnable recoil pattern |
| Wasp SMG | Close range | Fastest fire rate & movement |
| Breacher Shotgun | Close range | 10 pellets, one-shot up close, shell-by-shell reload (fire to interrupt) |
| Lancet Sniper | Long range | Scoped, bolt action, headshot = kill |
| Pike Pistol | Sidearm | Quick draw |
| Edge Knife | Melee | 55 dmg (2 hits), fastest movement, `V` to equip |

Recoil follows a fixed per-weapon pattern (`recoilForShot` in `shared/src/weapons.ts`) so sprays can be learned.

## Run

```bash
npm install
npm run dev        # game server on :2567 + client on http://localhost:5173
npm run typecheck
npm run build      # production client bundle in client/dist
npm start          # game server only (PORT env var, default 2567)
```

Open several browser tabs/windows to play against yourself; empty slots are filled with server-side bots.
To point the client at another server: `http://localhost:5173/?server=ws://host:2567`.
Invite links look like `http://localhost:5173/?room=ABCDE`.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Space | Jump (hold to bunny-hop) |
| Shift / C | Crouch — tap while running to **slide**; slide → jump keeps momentum |
| LMB / RMB | Fire / aim down sights |
| R | Reload |
| 1–3, wheel, Q | Switch weapon / last weapon |
| V | Knife |
| H | Toggle Aim Assist |
| Tab | Scoreboard |
| Esc | Pause |

## Layout

```
shared/            Engine-agnostic simulation shared by client and server
  src/movement.ts    Fixed-tick player movement (accel, friction, slide, jump, step-up)
  src/physics.ts     AABB collision + raycasts
  src/weapons.ts     Weapon stats (data-driven)
  src/combat.ts      Hitboxes
  src/bot-ai.ts      Bot brain (runs on server online, on client offline)
  src/hitscan.ts     Shot tracing against map + hitboxes
  src/protocol.ts    Binary/JSON network messages
  src/maps/          Map definitions (boxes, spawns, bot waypoints)
server/            Node + ws authoritative game server (rooms, matchmaking)
client/            Three.js + Vite browser client
  src/game.ts        Game loop, shooting, damage, match flow
  src/net.ts         WebSocket client + server clock
  src/avatar.ts      Third-person player model
  src/viewmodel.ts   First-person weapon models & animation
  src/hud.ts         HUD/scoreboard; index.html + style.css for markup
```

## Tuning

- Movement: `shared/src/constants.ts` (`MOVE`, `PLAYER`)
- Weapons: `shared/src/weapons.ts`
- Bot difficulty: `BOT_TUNING` in `shared/src/bot-ai.ts`; lobby bot fill: `BOT_FILL` in `server/src/room.ts`
- Match rules: `MATCH` in `shared/src/constants.ts`

## Netcode overview

- **Server** (`server/`) simulates everything at 60 Hz using the same `shared/` movement code and sends
  30 Hz binary snapshots. Clients only send inputs (movement keys, view angles, shot directions).
- **Prediction**: the client applies its own inputs immediately, then rewinds to each server snapshot and
  replays unacknowledged inputs. Inputs are quantized (float32 angles, byte ADS) so both sides compute
  identical results.
- **Interpolation**: other players are rendered 100 ms in the past between snapshots.
- **Lag compensation**: each shot carries the tick the client was viewing; the server rewinds hitboxes to that
  tick (max 500 ms) before tracing.
- **Validation**: fire rate, ammo, reloads, weapon swaps, shot direction cone, input rate (anti speed-hack),
  message rate limits, name sanitizing.

Key files: `shared/src/protocol.ts` (wire format), `server/src/room.ts` (simulation, combat, match flow),
`server/src/matchmaker.ts`, `client/src/net.ts`, `client/src/game.ts` (prediction/interpolation).
# game
12c713cb496dd497b2d58ee0ee06e13f9264c66b
