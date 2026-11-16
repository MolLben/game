var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { DurableObject } from "cloudflare:workers";

// ../shared/src/math.ts
function vec3(x = 0, y = 0, z = 0) {
  return { x, y, z };
}
__name(vec3, "vec3");
function horizontalSpeed(v) {
  return Math.hypot(v.x, v.z);
}
__name(horizontalSpeed, "horizontalSpeed");
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
__name(distance, "distance");
function normalize(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l > 1e-9) {
    v.x /= l;
    v.y /= l;
    v.z /= l;
  }
  return v;
}
__name(normalize, "normalize");
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
__name(clamp, "clamp");
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
__name(angleDiff, "angleDiff");
function forwardFromAngles(yaw, pitch, out = vec3()) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}
__name(forwardFromAngles, "forwardFromAngles");
function rightFromYaw(yaw, out = vec3()) {
  out.x = Math.cos(yaw);
  out.y = 0;
  out.z = -Math.sin(yaw);
  return out;
}
__name(rightFromYaw, "rightFromYaw");
function upFromAngles(yaw, pitch, out = vec3()) {
  const sp = Math.sin(pitch);
  out.x = Math.sin(yaw) * sp;
  out.y = Math.cos(pitch);
  out.z = Math.cos(yaw) * sp;
  return out;
}
__name(upFromAngles, "upFromAngles");
function yawTowards(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
__name(yawTowards, "yawTowards");
function pitchTowards(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return Math.atan2(to.y - from.y, Math.hypot(dx, dz));
}
__name(pitchTowards, "pitchTowards");
function spreadDirection(yaw, pitch, spread, rand = Math.random) {
  const f = forwardFromAngles(yaw, pitch);
  if (spread <= 0) return f;
  const r = rightFromYaw(yaw);
  const u = upFromAngles(yaw, pitch);
  const a = rand() * Math.PI * 2;
  const m = spread * Math.sqrt(rand());
  const cx = Math.cos(a) * m;
  const cy = Math.sin(a) * m;
  return normalize({ x: f.x + r.x * cx + u.x * cy, y: f.y + r.y * cx + u.y * cy, z: f.z + r.z * cx + u.z * cy });
}
__name(spreadDirection, "spreadDirection");
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
__name(dot, "dot");

// ../shared/src/constants.ts
var TICK_RATE = 60;
var TICK_DT = 1 / TICK_RATE;
var PLAYER = {
  radius: 0.32,
  standHeight: 1.8,
  crouchHeight: 1.15,
  standEye: 1.62,
  crouchEye: 1,
  stepHeight: 0.55,
  maxHealth: 100
};
var MOVE = {
  gravity: 22,
  maxFallSpeed: 30,
  jumpVelocity: 7.4,
  runSpeed: 7.4,
  crouchSpeed: 3.6,
  groundAccel: 11,
  airAccel: 2.2,
  friction: 7,
  stopSpeed: 2.5,
  slideMinSpeed: 5.5,
  slideBoost: 3.2,
  slideMaxSpeed: 12.5,
  slideFriction: 0.8,
  slideDuration: 0.8,
  slideCooldown: 0.9
};
var MATCH = {
  killLimit: 25,
  durationSec: 480,
  respawnDelay: 3,
  spawnProtection: 1,
  regenDelay: 5,
  regenPerSec: 25
};

// ../shared/src/map.ts
function B(cx, cz, w, d, y0, h, mat) {
  return {
    min: { x: cx - w / 2, y: y0, z: cz - d / 2 },
    max: { x: cx + w / 2, y: y0 + h, z: cz + d / 2 },
    mat
  };
}
__name(B, "B");
function PAD(cx, cz, w, d, top, launch) {
  return {
    min: { x: cx - w / 2, y: top, z: cz - d / 2 },
    max: { x: cx + w / 2, y: top, z: cz + d / 2 },
    launch
  };
}
__name(PAD, "PAD");
var pt = /* @__PURE__ */ __name((x, z, y = 0) => ({ x, y: y + 0.05, z }), "pt");

// ../shared/src/physics.ts
var EPS = 1e-4;
function overlapsBox(pos, height, b) {
  const r = PLAYER.radius;
  return pos.x - r < b.max.x && pos.x + r > b.min.x && pos.y < b.max.y && pos.y + height > b.min.y && pos.z - r < b.max.z && pos.z + r > b.min.z;
}
__name(overlapsBox, "overlapsBox");
function overlapsAny(pos, height, boxes) {
  for (const b of boxes) if (overlapsBox(pos, height, b)) return true;
  return false;
}
__name(overlapsAny, "overlapsAny");
function moveAxis(pos, axis, amount, height, boxes, canStep) {
  if (amount === 0) return false;
  pos[axis] += amount;
  let blocked = false;
  const r = PLAYER.radius;
  for (const b of boxes) {
    if (!overlapsBox(pos, height, b)) continue;
    if (axis !== "y" && canStep) {
      const rise = b.max.y - pos.y;
      if (rise > 0 && rise <= PLAYER.stepHeight) {
        const oldY = pos.y;
        pos.y = b.max.y + EPS;
        if (!overlapsAny(pos, height, boxes)) continue;
        pos.y = oldY;
      }
    }
    if (axis === "y") {
      pos.y = amount > 0 ? b.min.y - height - EPS : b.max.y + EPS;
    } else {
      pos[axis] = amount > 0 ? b.min[axis] - r - EPS : b.max[axis] + r + EPS;
    }
    blocked = true;
  }
  return blocked;
}
__name(moveAxis, "moveAxis");
function rayAabb(o, d, min, max, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let nAxis = null;
  let nSign = 0;
  for (const k of ["x", "y", "z"]) {
    const od = d[k];
    if (Math.abs(od) < 1e-9) {
      if (o[k] < min[k] || o[k] > max[k]) return null;
      continue;
    }
    const inv = 1 / od;
    let t1 = (min[k] - o[k]) * inv;
    let t2 = (max[k] - o[k]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = k;
      nSign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const normal = { x: 0, y: 0, z: 0 };
  if (nAxis) normal[nAxis] = nSign;
  else normal.y = 1;
  return { t: tmin, normal };
}
__name(rayAabb, "rayAabb");
function raycastBoxes(o, d, maxT, boxes) {
  let best = null;
  let bestT = maxT;
  for (const b of boxes) {
    const h = rayAabb(o, d, b.min, b.max, bestT);
    if (h && h.t < bestT) {
      bestT = h.t;
      best = { ...h, box: b };
    }
  }
  return best;
}
__name(raycastBoxes, "raycastBoxes");

// ../shared/src/movement.ts
function createMoveState(pos) {
  return {
    pos: vec3(pos.x, pos.y, pos.z),
    vel: vec3(),
    onGround: false,
    crouched: false,
    sliding: false,
    slideTime: 0,
    slideCooldown: 0,
    slideRequest: false,
    prevCrouch: false
  };
}
__name(createMoveState, "createMoveState");
function bodyHeight(s) {
  return s.crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
}
__name(bodyHeight, "bodyHeight");
function eyeHeight(s) {
  return s.crouched ? PLAYER.crouchEye : PLAYER.standEye;
}
__name(eyeHeight, "eyeHeight");
function accelerate(vel, wx, wz, wishSpeed, accel, dt) {
  const current = vel.x * wx + vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const a = Math.min(accel * wishSpeed * dt, add);
  vel.x += a * wx;
  vel.z += a * wz;
}
__name(accelerate, "accelerate");
function applyFriction(vel, friction, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const drop = Math.max(speed, MOVE.stopSpeed) * friction * dt;
  const scale = Math.max(0, speed - drop) / speed;
  vel.x *= scale;
  vel.z *= scale;
}
__name(applyFriction, "applyFriction");
function endSlide(s) {
  s.sliding = false;
  s.slideCooldown = MOVE.slideCooldown;
}
__name(endSlide, "endSlide");
function stepMovement(s, input, dt, boxes, speedMult = 1, pads = []) {
  const ev = { jumped: false, landed: false, landSpeed: 0, slideStarted: false, launched: false };
  const wasGround = s.onGround;
  s.slideCooldown = Math.max(0, s.slideCooldown - dt);
  const sy = Math.sin(input.yaw);
  const cy = Math.cos(input.yaw);
  let wx = -sy * input.forward + cy * input.right;
  let wz = -cy * input.forward - sy * input.right;
  const wl = Math.hypot(wx, wz);
  const mag = Math.min(1, wl);
  if (wl > 1e-6) {
    wx /= wl;
    wz /= wl;
  }
  const crouchPressed = input.crouch && !s.prevCrouch;
  s.prevCrouch = input.crouch;
  if (input.crouch) {
    s.crouched = true;
    if (crouchPressed) s.slideRequest = true;
  } else {
    s.slideRequest = false;
    if (s.crouched && !overlapsAny(s.pos, PLAYER.standHeight, boxes)) s.crouched = false;
    if (s.sliding) endSlide(s);
  }
  const hs = Math.hypot(s.vel.x, s.vel.z);
  if (s.onGround && s.slideRequest) {
    s.slideRequest = false;
    if (!s.sliding && s.slideCooldown <= 0 && hs >= MOVE.slideMinSpeed) {
      const ns = Math.max(hs, Math.min(hs + MOVE.slideBoost, MOVE.slideMaxSpeed));
      s.vel.x *= ns / hs;
      s.vel.z *= ns / hs;
      s.sliding = true;
      s.slideTime = MOVE.slideDuration;
      ev.slideStarted = true;
    }
  }
  if (s.sliding) {
    s.slideTime -= dt;
    if (s.slideTime <= 0 || hs < MOVE.crouchSpeed) endSlide(s);
  }
  if (input.jump && s.onGround) {
    s.vel.y = MOVE.jumpVelocity;
    s.onGround = false;
    ev.jumped = true;
    if (s.sliding) endSlide(s);
  }
  if (s.onGround) {
    applyFriction(s.vel, s.sliding ? MOVE.slideFriction : MOVE.friction, dt);
    if (!s.sliding) {
      const ws = (s.crouched ? MOVE.crouchSpeed : MOVE.runSpeed) * speedMult * mag;
      accelerate(s.vel, wx, wz, ws, MOVE.groundAccel, dt);
    }
  } else {
    accelerate(s.vel, wx, wz, MOVE.runSpeed * speedMult * mag, MOVE.airAccel, dt);
  }
  s.vel.y = Math.max(s.vel.y - MOVE.gravity * dt, -MOVE.maxFallSpeed);
  const h = bodyHeight(s);
  const canStep = wasGround && !ev.jumped;
  if (moveAxis(s.pos, "x", s.vel.x * dt, h, boxes, canStep)) s.vel.x = 0;
  if (moveAxis(s.pos, "z", s.vel.z * dt, h, boxes, canStep)) s.vel.z = 0;
  const vyBefore = s.vel.y;
  s.onGround = false;
  if (moveAxis(s.pos, "y", s.vel.y * dt, h, boxes, false)) {
    if (s.vel.y < 0) s.onGround = true;
    s.vel.y = 0;
  }
  if (!s.onGround && wasGround && !ev.jumped && s.vel.y <= 0) {
    const y0 = s.pos.y;
    if (moveAxis(s.pos, "y", -PLAYER.stepHeight, h, boxes, false)) {
      s.onGround = true;
      s.vel.y = 0;
    } else {
      s.pos.y = y0;
    }
  }
  if (s.onGround && !wasGround) {
    ev.landed = true;
    ev.landSpeed = -vyBefore;
  }
  if (s.onGround) {
    for (const p of pads) {
      if (s.pos.x >= p.min.x && s.pos.x <= p.max.x && s.pos.z >= p.min.z && s.pos.z <= p.max.z && Math.abs(s.pos.y - p.max.y) < 0.15) {
        s.vel.x = p.launch.x;
        s.vel.y = p.launch.y;
        s.vel.z = p.launch.z;
        s.onGround = false;
        if (s.sliding) endSlide(s);
        ev.launched = true;
        break;
      }
    }
  }
  return ev;
}
__name(stepMovement, "stepMovement");

// ../shared/src/weapons.ts
var NO_RECOIL = { up: 0, climb: 0, side: 0, sideFreq: 0, jitter: 0 };
var base = {
  slot: "primary",
  melee: false,
  pellets: 1,
  headMult: 1.5,
  range: 250,
  shellReload: 0,
  adsMoveMult: 0.7,
  scoped: false,
  bloomPerShot: 0,
  bloomMax: 0,
  bloomRecover: 0.1,
  recoilReset: 0.5,
  cycle: "none"
};
var WEAPONS = {
  rifle: {
    ...base,
    id: "rifle",
    name: "Arc-7 Rifle",
    description: "All-rounder. Controllable full-auto at any range.",
    auto: true,
    damage: 24,
    rpm: 600,
    magSize: 30,
    reloadTime: 1.9,
    equipTime: 0.45,
    spreadHip: 0.022,
    spreadAds: 3e-3,
    spreadMove: 0.025,
    spreadAir: 0.06,
    bloomPerShot: 4e-3,
    bloomMax: 0.03,
    bloomRecover: 0.12,
    recoil: { up: 0.0105, climb: 0.45, side: 6e-3, sideFreq: 0.55, jitter: 0.15 },
    recoilReset: 0.28,
    falloffStart: 25,
    falloffEnd: 60,
    minDamageMult: 0.7,
    adsZoom: 1.35,
    adsTime: 0.18,
    moveMult: 0.95
  },
  smg: {
    ...base,
    id: "smg",
    name: "Wasp SMG",
    description: "Fastest fire rate and movement. Shreds up close.",
    auto: true,
    headMult: 1.4,
    damage: 17,
    rpm: 900,
    magSize: 32,
    reloadTime: 1.6,
    equipTime: 0.35,
    spreadHip: 0.03,
    spreadAds: 0.012,
    spreadMove: 0.01,
    spreadAir: 0.04,
    bloomPerShot: 3e-3,
    bloomMax: 0.025,
    bloomRecover: 0.15,
    recoil: { up: 65e-4, climb: 0.3, side: 8e-3, sideFreq: 0.8, jitter: 0.25 },
    recoilReset: 0.22,
    falloffStart: 12,
    falloffEnd: 35,
    minDamageMult: 0.55,
    adsZoom: 1.15,
    adsTime: 0.12,
    moveMult: 1.05,
    adsMoveMult: 0.85
  },
  shotgun: {
    ...base,
    id: "shotgun",
    name: "Breacher Shotgun",
    description: "One-shot potential up close. Loads shell by shell.",
    auto: false,
    headMult: 1.25,
    pellets: 10,
    damage: 14,
    rpm: 75,
    magSize: 6,
    reloadTime: 2.3,
    shellReload: 0.42,
    equipTime: 0.45,
    spreadHip: 0.075,
    spreadAds: 0.055,
    spreadMove: 0.01,
    spreadAir: 0.02,
    recoil: { up: 0.05, climb: 0, side: 0.01, sideFreq: 1.3, jitter: 0.3 },
    cycle: "pump",
    falloffStart: 6,
    falloffEnd: 18,
    minDamageMult: 0.3,
    adsZoom: 1.15,
    adsTime: 0.15,
    moveMult: 1
  },
  sniper: {
    ...base,
    id: "sniper",
    name: "Lancet Sniper",
    description: "Headshots kill instantly. Bolt action, scoped.",
    auto: false,
    headMult: 2,
    damage: 90,
    rpm: 45,
    magSize: 5,
    reloadTime: 2.6,
    equipTime: 0.6,
    spreadHip: 0.09,
    spreadAds: 0,
    spreadMove: 0.06,
    spreadAir: 0.15,
    recoil: { up: 0.06, climb: 0, side: 6e-3, sideFreq: 1, jitter: 0.2 },
    cycle: "bolt",
    falloffStart: 1e9,
    falloffEnd: 2e9,
    minDamageMult: 1,
    adsZoom: 3.5,
    adsTime: 0.28,
    moveMult: 0.9,
    adsMoveMult: 0.6,
    scoped: true
  },
  pistol: {
    ...base,
    id: "pistol",
    name: "Pike Pistol",
    description: "Reliable sidearm. Quick to draw.",
    slot: "secondary",
    auto: false,
    headMult: 1.6,
    damage: 30,
    rpm: 360,
    magSize: 12,
    reloadTime: 1.3,
    equipTime: 0.25,
    spreadHip: 0.015,
    spreadAds: 6e-3,
    spreadMove: 0.01,
    spreadAir: 0.03,
    bloomPerShot: 8e-3,
    bloomMax: 0.03,
    bloomRecover: 0.12,
    recoil: { up: 0.02, climb: 0.2, side: 4e-3, sideFreq: 1.1, jitter: 0.2 },
    falloffStart: 15,
    falloffEnd: 40,
    minDamageMult: 0.6,
    adsZoom: 1.2,
    adsTime: 0.12,
    moveMult: 1.08,
    adsMoveMult: 0.85
  },
  knife: {
    ...base,
    id: "knife",
    name: "Edge Knife",
    description: "Two slashes to kill. Fastest movement.",
    slot: "melee",
    melee: true,
    auto: true,
    headMult: 1,
    damage: 55,
    rpm: 90,
    magSize: 0,
    reloadTime: 0,
    equipTime: 0.25,
    spreadHip: 0,
    spreadAds: 0,
    spreadMove: 0,
    spreadAir: 0,
    recoil: NO_RECOIL,
    range: 2.4,
    falloffStart: 1e9,
    falloffEnd: 2e9,
    minDamageMult: 1,
    adsZoom: 1,
    adsTime: 0.1,
    moveMult: 1.12,
    adsMoveMult: 1
  }
};
var WEAPON_ORDER = ["rifle", "smg", "shotgun", "sniper", "pistol", "knife"];
var PRIMARY_WEAPONS = ["rifle", "smg", "shotgun", "sniper"];
function weaponIndex(id) {
  return WEAPON_ORDER.indexOf(id);
}
__name(weaponIndex, "weaponIndex");
function weaponByIndex(i) {
  return WEAPONS[WEAPON_ORDER[i] ?? "rifle"] ?? WEAPONS.rifle;
}
__name(weaponByIndex, "weaponByIndex");
function isPrimary(id) {
  return typeof id === "string" && PRIMARY_WEAPONS.includes(id);
}
__name(isPrimary, "isPrimary");
function loadoutFor(primary) {
  return [isPrimary(primary) ? primary : "rifle", "pistol", "knife"];
}
__name(loadoutFor, "loadoutFor");
function damageAt(def, dist, head) {
  let mult = 1;
  if (dist > def.falloffStart) {
    const k = clamp((dist - def.falloffStart) / (def.falloffEnd - def.falloffStart), 0, 1);
    mult = 1 + (def.minDamageMult - 1) * k;
  }
  return def.damage * mult * (head ? def.headMult : 1);
}
__name(damageAt, "damageAt");
function shellTicks(def, tickRate, slack = 1) {
  return Math.max(1, Math.floor(def.shellReload * tickRate * slack));
}
__name(shellTicks, "shellTicks");
function moveSpeedMult(weaponIndex2, adsByte) {
  const def = weaponByIndex(weaponIndex2);
  const ads = clamp(adsByte, 0, 255) / 255;
  return def.moveMult * (1 + (def.adsMoveMult - 1) * ads);
}
__name(moveSpeedMult, "moveSpeedMult");
function maxSpread(def) {
  return Math.max(def.spreadHip, def.spreadAds) + def.bloomMax + def.spreadMove * 1.5 + def.spreadAir;
}
__name(maxSpread, "maxSpread");

// ../shared/src/combat.ts
function getHitboxes(pos, crouched) {
  const h = crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
  const headSize = 0.4;
  const hr = 0.2;
  const br = PLAYER.radius;
  const headBottom = pos.y + h - headSize;
  return {
    head: {
      min: { x: pos.x - hr, y: headBottom, z: pos.z - hr },
      max: { x: pos.x + hr, y: pos.y + h + 0.02, z: pos.z + hr }
    },
    body: {
      min: { x: pos.x - br, y: pos.y, z: pos.z - br },
      max: { x: pos.x + br, y: headBottom, z: pos.z + br }
    }
  };
}
__name(getHitboxes, "getHitboxes");
function chestPoint(pos, crouched) {
  return { x: pos.x, y: pos.y + (crouched ? 0.7 : 1.15), z: pos.z };
}
__name(chestPoint, "chestPoint");

// ../shared/src/hitscan.ts
function traceShot(origin, dir, range, boxes, targets, ignoreId) {
  const w = raycastBoxes(origin, dir, range, boxes);
  let best = w ? w.t : range;
  let normal = w ? w.normal : null;
  let targetId = -1;
  let head = false;
  for (const tg of targets) {
    if (tg.id === ignoreId) continue;
    const hb = getHitboxes(tg.pos, tg.crouched);
    const h = rayAabb(origin, dir, hb.head.min, hb.head.max, best);
    if (h && h.t < best) {
      best = h.t;
      targetId = tg.id;
      head = true;
      normal = h.normal;
    }
    const b = rayAabb(origin, dir, hb.body.min, hb.body.max, best);
    if (b && b.t < best) {
      best = b.t;
      targetId = tg.id;
      head = false;
      normal = b.normal;
    }
  }
  return {
    t: best,
    point: { x: origin.x + dir.x * best, y: origin.y + dir.y * best, z: origin.z + dir.z * best },
    normal,
    targetId,
    head
  };
}
__name(traceShot, "traceShot");
var MELEE_FAN = [
  [0, 0],
  [0.22, 0],
  [-0.22, 0],
  [0, 0.15],
  [0, -0.15],
  [0.4, 0],
  [-0.4, 0]
];
function meleeTrace(origin, yaw, pitch, range, boxes, targets, ignoreId) {
  let first = null;
  let best = null;
  for (const [dy, dp] of MELEE_FAN) {
    const r = traceShot(origin, forwardFromAngles(yaw + dy, pitch + dp), range, boxes, targets, ignoreId);
    first ??= r;
    if (r.targetId >= 0 && (!best || r.t < best.t)) best = r;
  }
  return best ?? first;
}
__name(meleeTrace, "meleeTrace");

// ../shared/src/players.ts
var PLAYER_COLORS = [
  "#e05252",
  "#4fa3e0",
  "#5cc46a",
  "#d9a03a",
  "#b067d6",
  "#3cc7b8",
  "#e07a3c",
  "#d65a9c",
  "#8fa3b8",
  "#c9c43a",
  "#6f7de0",
  "#9ad04a"
];
var BOT_NAMES = ["Rook", "Vex", "Nova", "Kade", "Juno", "Pax", "Sable", "Orin", "Tess", "Bram", "Ivo", "Lark"];
var MAX_NAME_LENGTH = 16;
function sanitizeName(raw) {
  const s = typeof raw === "string" ? raw : "";
  const clean = s.replace(/[\u0000-\u001f\u007f<>&"'`]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  return clean || "Player";
}
__name(sanitizeName, "sanitizeName");

// ../shared/src/nav.ts
var DOWN = { x: 0, y: -1, z: 0 };
var UP = { x: 0, y: 1, z: 0 };
var MAX_LINK = 22;
var SAMPLE = 0.4;
var MAX_DROP = 2;
function groundBelow(x, y, z, boxes, maxDrop = MAX_DROP) {
  const top = y + 0.6;
  const hit = raycastBoxes({ x, y: top, z }, DOWN, 0.6 + maxDrop, boxes);
  return hit ? top - hit.t : null;
}
__name(groundBelow, "groundBelow");
function walkable(a, b, boxes) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return Math.abs(a.y - b.y) < 0.6;
  const n = Math.ceil(dist / SAMPLE);
  const dir = { x: dx / dist, y: 0, z: dz / dist };
  let y = a.y;
  let px = a.x;
  let pz = a.z;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.x + dx * t;
    const z = a.z + dz * t;
    if (raycastBoxes({ x: px, y: y + 0.7, z: pz }, dir, dist / n, boxes)) return false;
    const gy = groundBelow(x, y, z, boxes);
    if (gy === null) return false;
    if (gy > y + PLAYER.stepHeight + 1e-3) return false;
    if (raycastBoxes({ x, y: gy + 0.05, z }, UP, PLAYER.standHeight - 0.05, boxes)) return false;
    y = gy;
    px = x;
    pz = z;
  }
  return Math.abs(y - b.y) < 0.6;
}
__name(walkable, "walkable");
var cache = /* @__PURE__ */ new Map();
function navGraph(map) {
  const cached = cache.get(map.id);
  if (cached) return cached;
  const points = map.waypoints;
  const links = points.map(() => []);
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const a = points[i];
      const b = points[j];
      if (Math.hypot(a.x - b.x, a.z - b.z) > MAX_LINK) continue;
      if (walkable(a, b, map.boxes)) links[i].push(j);
    }
  }
  for (const [from, to] of map.extraLinks ?? []) if (!links[from].includes(to)) links[from].push(to);
  const g2 = { points, links };
  cache.set(map.id, g2);
  return g2;
}
__name(navGraph, "navGraph");
function nearestNode(g2, pos, boxes) {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < g2.points.length; i++) {
    const p = g2.points[i];
    const score = Math.hypot(p.x - pos.x, p.z - pos.z) + Math.abs(p.y - pos.y) * 3;
    if (score >= bestScore) continue;
    const a = { x: pos.x, y: pos.y + 1, z: pos.z };
    const d = { x: p.x - a.x, y: p.y + 1 - a.y, z: p.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    const blocked = len > 0.1 && raycastBoxes(a, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.05, boxes);
    if (blocked) continue;
    best = i;
    bestScore = score;
  }
  if (best >= 0) return best;
  for (let i = 0; i < g2.points.length; i++) {
    const p = g2.points[i];
    const score = Math.hypot(p.x - pos.x, p.z - pos.z) + Math.abs(p.y - pos.y) * 3;
    if (score < bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
__name(nearestNode, "nearestNode");
function findPath(g2, from, to) {
  if (from === to) return [to];
  const prev = new Array(g2.points.length).fill(-1);
  const seen = new Uint8Array(g2.points.length);
  const queue = [from];
  seen[from] = 1;
  while (queue.length) {
    const n = queue.shift();
    for (const m of g2.links[n]) {
      if (seen[m]) continue;
      seen[m] = 1;
      prev[m] = n;
      if (m === to) {
        const path = [to];
        let c = n;
        while (c !== from) {
          path.unshift(c);
          c = prev[c];
        }
        return path;
      }
      queue.push(m);
    }
  }
  return null;
}
__name(findPath, "findPath");

// ../shared/src/bot-ai.ts
var PREFERRED_RANGE = {
  rifle: [7, 22],
  smg: [4, 13],
  shotgun: [2, 7],
  sniper: [14, 40],
  pistol: [6, 18],
  knife: [0, 1.5]
};
function randomPrimary() {
  return PRIMARY_WEAPONS[Math.floor(Math.random() * PRIMARY_WEAPONS.length)];
}
__name(randomPrimary, "randomPrimary");
var BOT_TUNING = {
  viewRange: 55,
  turnRate: 7,
  reactionMin: 0.3,
  reactionMax: 0.65,
  baseSpread: 0.035,
  moveSpreadPerMs: 4e-3,
  damageScale: 0.55,
  speedMult: 0.92
};
var BotBrain = class {
  static {
    __name(this, "BotBrain");
  }
  target = null;
  retarget = 0;
  reaction = 0;
  fireCd = 0;
  burst = 0;
  strafeDir = 0;
  strafeT = 0;
  /** Remaining waypoint indices to walk through. */
  path = [];
  stuck = 0;
  reset() {
    this.target = null;
    this.path = [];
    this.burst = 0;
    this.stuck = 0;
  }
  onDamaged(self, attacker) {
    if (attacker && attacker !== self && attacker.alive && (!this.target || Math.random() < 0.6)) {
      this.target = attacker;
      this.retarget = 0.6;
      this.reaction = Math.min(this.reaction, 0.25);
    }
  }
  findTarget(self, world) {
    const eye = eyeOf(self);
    let best = null;
    let bestD = BOT_TUNING.viewRange;
    for (const o of world.fighters) {
      if (o === self || !o.alive || world.time - o.spawnTime < MATCH.spawnProtection) continue;
      const c = chestPoint(o.move.pos, o.move.crouched);
      let d = distance(eye, c);
      if (o === this.target) d *= 0.7;
      if (d >= bestD) continue;
      const ang = Math.abs(angleDiff(yawTowards(eye, c), self.yaw));
      if (ang > 2 && d > 8) continue;
      if (!world.lineOfSight(eye, c)) continue;
      best = o;
      bestD = d;
    }
    return best;
  }
  repath(self, world) {
    const g2 = world.nav;
    this.stuck = 0;
    if (!g2.points.length) {
      this.path = [];
      return;
    }
    const from = nearestNode(g2, self.move.pos, world.boxes);
    let goal = Math.floor(Math.random() * g2.points.length);
    if (goal === from) goal = (goal + 1) % g2.points.length;
    this.path = [from, ...findPath(g2, from, goal) ?? []];
  }
  think(self, world, dt, weapon) {
    const out = { input: { forward: 0, right: 0, jump: false, crouch: false, yaw: self.yaw }, fireAt: null };
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.2 + Math.random() * 0.1;
      const prev = this.target;
      this.target = this.findTarget(self, world);
      if (this.target && this.target !== prev) {
        this.reaction = BOT_TUNING.reactionMin + Math.random() * (BOT_TUNING.reactionMax - BOT_TUNING.reactionMin);
        if (weapon.scoped) this.reaction += 0.35;
      }
    }
    if (this.target && !this.target.alive) this.target = null;
    const eye = eyeOf(self);
    const turn = BOT_TUNING.turnRate * dt;
    const input = out.input;
    if (this.target) {
      const t = this.target;
      const c = chestPoint(t.move.pos, t.move.crouched);
      const dy = angleDiff(yawTowards(eye, c), self.yaw);
      self.yaw += clamp(dy, -turn, turn);
      self.pitch += clamp(pitchTowards(eye, c) - self.pitch, -turn, turn);
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafeT = 0.4 + Math.random() * 1;
        this.strafeDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
      }
      const d = distance(eye, c);
      const [near, far] = PREFERRED_RANGE[weapon.id];
      input.forward = d > far ? 1 : d < near ? -1 : 0;
      input.right = this.strafeDir;
      input.yaw = self.yaw;
      if (Math.random() < 4e-3) input.jump = true;
      this.path = [];
      if (!safeToMove(self, input, world.boxes)) {
        input.forward = 0;
        input.right = 0;
        input.jump = false;
        this.strafeDir = -this.strafeDir;
      } else if (input.jump && !safeToMove(self, input, world.boxes, true)) {
        input.jump = false;
      }
      this.reaction -= dt;
      this.fireCd -= dt;
      if (this.reaction <= 0 && Math.abs(dy) < 0.15 && this.fireCd <= 0 && d <= weapon.range) {
        out.fireAt = t;
        if (weapon.auto) {
          if (this.burst <= 0) this.burst = 3 + Math.floor(Math.random() * 4);
          this.burst--;
          this.fireCd = this.burst > 0 ? 60 / weapon.rpm * 1.25 : 0.45 + Math.random() * 0.5;
        } else {
          this.fireCd = 60 / weapon.rpm + 0.12 + Math.random() * 0.35;
        }
      }
    } else {
      const g2 = world.nav;
      const pos = self.move.pos;
      if (this.path.length === 0 || this.stuck > 1.5) this.repath(self, world);
      let node = this.path.length ? g2.points[this.path[0]] : null;
      if (node && Math.hypot(node.x - pos.x, node.z - pos.z) < 1.2 && Math.abs(node.y - pos.y) < 1.2) {
        this.path.shift();
        node = this.path.length ? g2.points[this.path[0]] : null;
      }
      if (node) {
        const dy = angleDiff(yawTowards(pos, node), self.yaw);
        self.yaw += clamp(dy, -turn * 0.8, turn * 0.8);
        input.forward = Math.abs(dy) < 0.8 ? 1 : 0.15;
      }
      self.pitch *= 0.9;
      input.yaw = self.yaw;
      if (!safeToMove(self, input, world.boxes)) {
        input.forward = 0;
        this.path = [];
      }
      if (self.move.onGround && horizontalSpeed(self.move.vel) < 1) {
        this.stuck += dt;
        if (this.stuck > 0.6 && safeToMove(self, { ...input, forward: 1 }, world.boxes, true)) input.jump = true;
      } else {
        this.stuck = Math.max(0, this.stuck - dt);
      }
    }
    return out;
  }
};
var WALK_PROBES = [0.7, 1.4];
var JUMP_PROBES = [0.7, 1.4, 2.4, 3.4, 4.4, 5.4];
function groundAlong(p, dx, dz, dists, boxes) {
  for (const d of dists) {
    if (groundBelow(p.x + dx * d, p.y, p.z + dz * d, boxes, 2) === null) return false;
  }
  return true;
}
__name(groundAlong, "groundAlong");
function safeToMove(self, input, boxes, jumping = false) {
  if (!self.move.onGround) return true;
  const p = self.move.pos;
  const probes = jumping ? JUMP_PROBES : WALK_PROBES;
  const v = self.move.vel;
  const hs = Math.hypot(v.x, v.z);
  if (hs > 3 && !groundAlong(p, v.x / hs, v.z / hs, probes, boxes)) return false;
  const mag = Math.hypot(input.forward, input.right);
  if (mag < 0.01) return true;
  const sy = Math.sin(input.yaw);
  const cy = Math.cos(input.yaw);
  const wx = (-sy * input.forward + cy * input.right) / mag;
  const wz = (-cy * input.forward - sy * input.right) / mag;
  return groundAlong(p, wx, wz, probes, boxes);
}
__name(safeToMove, "safeToMove");
function eyeOf(a) {
  return { x: a.move.pos.x, y: a.move.pos.y + eyeHeight(a.move), z: a.move.pos.z };
}
__name(eyeOf, "eyeOf");
function botShotDirections(origin, targetPos, target, shooterAirborne, weapon) {
  const aim = chestPoint(targetPos, target.move.crouched);
  const dir = normalize({ x: aim.x - origin.x, y: aim.y - origin.y, z: aim.z - origin.z });
  const yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(clamp(dir.y, -1, 1));
  const spread = BOT_TUNING.baseSpread + horizontalSpeed(target.move.vel) * BOT_TUNING.moveSpreadPerMs + (shooterAirborne ? 0.03 : 0);
  const center = spreadDirection(yaw, pitch, spread);
  if (weapon.pellets <= 1) return [center];
  const cy = Math.atan2(-center.x, -center.z);
  const cp = Math.asin(clamp(center.y, -1, 1));
  return Array.from({ length: weapon.pellets }, () => spreadDirection(cy, cp, weapon.spreadHip));
}
__name(botShotDirections, "botShotDirections");

// ../shared/src/protocol.ts
var PROTOCOL_VERSION = 3;
var SNAPSHOT_EVERY_TICKS = 2;
var MAX_REWIND_TICKS = 30;
var MAX_PELLETS = 16;
var MAX_SHOTS_PER_INPUT = 4;
var BIN = { INPUT: 1, SNAPSHOT: 2 };
function decodeInput(buf) {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 23 || v.getUint8(0) !== BIN.INPUT) return null;
    let o = 1;
    const seq = v.getUint32(o, true);
    o += 4;
    const forward = Math.max(-1, Math.min(1, v.getInt8(o)));
    o += 1;
    const right = Math.max(-1, Math.min(1, v.getInt8(o)));
    o += 1;
    const b = v.getUint8(o);
    o += 1;
    const weapon = v.getUint8(o);
    o += 1;
    const ads = v.getUint8(o);
    o += 1;
    const yaw = v.getFloat32(o, true);
    o += 4;
    const pitch = v.getFloat32(o, true);
    o += 4;
    const viewTick = v.getUint32(o, true);
    o += 4;
    const nShots = Math.min(v.getUint8(o), MAX_SHOTS_PER_INPUT);
    o += 1;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return null;
    const shots = [];
    for (let i = 0; i < nShots; i++) {
      const n = Math.min(v.getUint8(o), MAX_PELLETS);
      o += 1;
      const pellets = [];
      for (let j = 0; j < n; j++) {
        const d = { x: v.getFloat32(o, true), y: v.getFloat32(o + 4, true), z: v.getFloat32(o + 8, true) };
        o += 12;
        const len = Math.hypot(d.x, d.y, d.z);
        if (!Number.isFinite(len) || len < 0.5 || len > 1.5) continue;
        pellets.push({ x: d.x / len, y: d.y / len, z: d.z / len });
      }
      shots.push(pellets);
    }
    return {
      seq,
      forward,
      right,
      jump: (b & 1) !== 0,
      crouch: (b & 2) !== 0,
      reload: (b & 4) !== 0,
      weapon,
      ads,
      yaw,
      pitch: Math.max(-1.6, Math.min(1.6, pitch)),
      viewTick,
      shots
    };
  } catch {
    return null;
  }
}
__name(decodeInput, "decodeInput");
var SELF_BYTES = 1 + 6 * 4 + 2 * 4 + 1;
var ENTITY_BYTES = 1 + 1 + 1 + 3 * 4 + 2 * 4;
function encodeSnapshot(s) {
  const buf = new ArrayBuffer(1 + 4 + 4 + SELF_BYTES + 1 + s.entities.length * ENTITY_BYTES);
  const v = new DataView(buf);
  let o = 0;
  v.setUint8(o, BIN.SNAPSHOT);
  o += 1;
  v.setUint32(o, s.tick, true);
  o += 4;
  v.setUint32(o, s.ack, true);
  o += 4;
  const m = s.self.move;
  v.setUint8(
    o,
    (s.self.alive ? 1 : 0) | (m.onGround ? 2 : 0) | (m.crouched ? 4 : 0) | (m.sliding ? 8 : 0) | (m.slideRequest ? 16 : 0) | (m.prevCrouch ? 32 : 0)
  );
  o += 1;
  for (const n of [m.pos.x, m.pos.y, m.pos.z, m.vel.x, m.vel.y, m.vel.z, m.slideTime, m.slideCooldown]) {
    v.setFloat32(o, n, true);
    o += 4;
  }
  v.setUint8(o, Math.max(0, Math.min(255, Math.ceil(s.self.health))));
  o += 1;
  v.setUint8(o, s.entities.length);
  o += 1;
  for (const e of s.entities) {
    v.setUint8(o, e.id);
    o += 1;
    v.setUint8(o, (e.alive ? 1 : 0) | (e.onGround ? 2 : 0) | (e.crouched ? 4 : 0) | (e.sliding ? 8 : 0));
    o += 1;
    v.setUint8(o, e.weapon);
    o += 1;
    for (const n of [e.pos.x, e.pos.y, e.pos.z, e.yaw, e.pitch]) {
      v.setFloat32(o, n, true);
      o += 4;
    }
  }
  return buf;
}
__name(encodeSnapshot, "encodeSnapshot");

// ../shared/src/maps/bunker.ts
var CELL = 12;
var LINES = [-6, 6];
var MIDS = [-12, 0, 12];
function build() {
  const b = [];
  const add = /* @__PURE__ */ __name((...x) => b.push(...x), "add");
  add(B(0, 0, 40, 40, -1, 1, "floor"));
  add(B(0, -19, 40, 2, 0, 5, "concrete"), B(0, 19, 40, 2, 0, 5, "concrete"));
  add(B(-19, 0, 2, 40, 0, 5, "concrete"), B(19, 0, 2, 40, 0, 5, "concrete"));
  for (const line of LINES) {
    for (const mid of MIDS) {
      const gap = mid === 0 ? 5 : 2.6;
      const start = mid - CELL / 2;
      const end = mid + CELL / 2;
      const lenA = mid - gap / 2 - start;
      const lenB = end - (mid + gap / 2);
      add(B(line, start + lenA / 2, 0.6, lenA, 0, 4, "wall"), B(line, end - lenB / 2, 0.6, lenB, 0, 4, "wall"));
      add(B(start + lenA / 2, line, lenA, 0.6, 0, 4, "wall"), B(end - lenB / 2, line, lenB, 0.6, 0, 4, "wall"));
    }
  }
  for (const s of [1, -1]) for (const t of [1, -1]) add(B(3 * s, 3 * t, 1.2, 1.2, 0, 4, "concrete"));
  for (const s of [1, -1]) {
    add(B(0, 14 * s, 6, 2.4, 0, 2.4, "container"), B(14 * s, 0, 2.4, 6, 0, 2.4, "container"));
    add(B(14 * s, 14 * s, 6, 6, 0, 1.5, "metal"));
    add(B(10.6 * s, 14 * s, 0.8, 3, 0, 1, "metal"), B(9.8 * s, 14 * s, 0.8, 3, 0, 0.5, "metal"));
    add(B(12 * s, -10 * s, 4, 0.6, 0, 1.1, "wall"));
    add(B(15.5 * s, -15.5 * s, 1.6, 1.6, 0, 1.6, "crate"), B(15.5 * s, -13.7 * s, 1.4, 1.4, 0, 1.4, "crate"));
  }
  add(B(6, 0, 0.7, 5, 3.6, 0.4, "accent"), B(-6, 0, 0.7, 5, 3.6, 0.4, "accent"));
  add(B(0, 6, 5, 0.7, 3.6, 0.4, "accent"), B(0, -6, 5, 0.7, 3.6, 0.4, "accent"));
  return b;
}
__name(build, "build");
var BUNKER = {
  id: "bunker",
  name: "Bunker",
  description: "Close-quarters rooms and doorways around a pillared hall.",
  size: 20,
  boxes: build(),
  pads: [],
  spawns: [
    pt(14, 14, 1.5),
    pt(-14, -14, 1.5),
    pt(16, -8),
    pt(-16, 8),
    pt(8, -16),
    pt(-8, 16),
    pt(0, 16.8),
    pt(0, -16.8),
    pt(16.8, 0),
    pt(-16.8, 0),
    pt(8, 8),
    pt(-8, -8)
  ],
  waypoints: [
    pt(0, 0),
    pt(6, 0),
    pt(-6, 0),
    pt(0, 6),
    pt(0, -6),
    // 0-4 hall + hall doors
    pt(6, 12),
    pt(6, -12),
    pt(-6, 12),
    pt(-6, -12),
    // 5-8 doors on x lines
    pt(12, 6),
    pt(-12, 6),
    pt(12, -6),
    pt(-12, -6),
    // 9-12 doors on z lines
    pt(10, 0),
    pt(-10, 0),
    pt(0, 10),
    pt(0, -10),
    // 13-16 edge rooms
    pt(8.5, 8.5),
    pt(-8.5, -8.5),
    pt(14, 14, 1.5),
    pt(-14, -14, 1.5),
    // 17-20 platform rooms
    pt(12, -14),
    pt(-12, 14),
    pt(9, -9),
    pt(-9, 9)
    // 21-24 crate rooms
  ],
  killY: -20,
  theme: {
    sky: "#262c3a",
    fogNear: 25,
    fogFar: 80,
    hemiSky: "#a9bbdf",
    hemiGround: "#202228",
    hemiIntensity: 1,
    sun: "#cfdcff",
    sunIntensity: 1.5,
    sunPos: { x: 20, y: 50, z: 10 },
    palette: {
      floor: { base: "#3a3d43", minor: "#42464d", major: "#54595f" },
      wall: { base: "#555b66", minor: "#5e6571", major: "#717986" },
      concrete: { base: "#6a6e75", minor: "#74787f", major: "#868a91" },
      accent: { base: "#d94848", minor: "#c23d3d", major: "#a33333" }
    }
  }
};

// ../shared/src/maps/canal.ts
function build2() {
  const b = [];
  const add = /* @__PURE__ */ __name((...x) => b.push(...x), "add");
  add(B(0, -17.5, 86, 25, -3, 3, "floor"), B(0, 17.5, 86, 25, -3, 3, "floor"));
  add(B(0, 0, 86, 10, -3, 1.5, "concrete"));
  add(B(0, -31, 86, 2, -3, 10, "wall"), B(0, 31, 86, 2, -3, 10, "wall"));
  add(B(-43, 0, 2, 64, -3, 10, "wall"), B(43, 0, 2, 64, -3, 10, "wall"));
  for (const x of [-28, 0, 28]) {
    for (const s of [1, -1]) {
      add(B(x, -4.6 * s, 3, 0.8, -3, 2.5, "metal"), B(x, -3.8 * s, 3, 0.8, -3, 2, "metal"));
    }
  }
  for (const x of [-15, 15]) {
    add(B(x, 0, 4, 10.4, 0, 0.4, "metal"));
    add(B(x - 1.95, 0, 0.1, 10.4, 0.4, 0.9, "accent"), B(x + 1.95, 0, 0.1, 10.4, 0.4, 0.9, "accent"));
  }
  add(B(-6, 1.5, 1.6, 1.6, -1.5, 1.6, "crate"), B(6, -1.5, 1.6, 1.6, -1.5, 1.6, "crate"));
  add(B(-34, -2, 2.6, 1.2, -1.5, 1.2, "metal"), B(34, 2, 2.6, 1.2, -1.5, 1.2, "metal"));
  for (const s of [1, -1]) {
    add(B(-32 * s, -20 * s, 6, 6, 0, 4, "concrete"));
    for (let i = 0; i < 7; i++) add(B((-29 + 0.4 + 0.8 * i) * s, -20 * s, 0.8, 3, 0, 3.5 - i * 0.5, "metal"));
    add(B(-32 * s, (-20 + 2.85) * s, 6, 0.3, 4, 1.1, "wall"));
    add(B(-34.85 * s, -20 * s, 0.3, 6, 4, 1.1, "wall"));
    add(B(-12 * s, -21 * s, 10, 6, 0, 4.5, "wall"));
    add(B(10 * s, -18 * s, 7, 2.6, 0, 2.6, "container"));
    add(B(22 * s, -24 * s, 2.6, 7, 0, 2.6, "container"));
    add(B(0, -12 * s, 1.8, 1.8, 0, 1.8, "crate"), B(1.9 * s, -12.4 * s, 1.4, 1.4, 0, 1.4, "crate"));
    add(B(-24 * s, -8 * s, 6, 0.6, 0, 1.1, "wall"), B(30 * s, -9 * s, 5, 0.6, 0, 1.1, "wall"));
    add(B(-4 * s, -24 * s, 1.6, 1.6, 0, 1.6, "crate"), B(34 * s, -24 * s, 1.8, 1.8, 0, 1.8, "crate"));
  }
  return b;
}
__name(build2, "build");
var both = /* @__PURE__ */ __name((x, z, y = 0) => [pt(x, z, y), pt(-x, -z, y)], "both");
var CANAL = {
  id: "canal",
  name: "Canal",
  description: "Long sightlines across a sunken channel. Sniper towers on each bank.",
  size: 42,
  boxes: build2(),
  pads: [],
  spawns: [
    ...both(-38, -26),
    ...both(0, -27),
    ...both(17, -27),
    ...both(38, -14),
    ...both(-38, -12),
    ...both(-32, -20, 4)
  ],
  waypoints: [
    ...both(-36, -12),
    ...both(-24, -14),
    ...both(-12, -12),
    ...both(0, -9),
    ...both(12, -12),
    ...both(24, -14),
    ...both(36, -14),
    ...both(-20, -27),
    ...both(8, -26),
    ...both(36, -27),
    ...both(-15, -8),
    ...both(15, -8),
    // bridge ends
    pt(-15, 0, 0.4),
    pt(15, 0, 0.4),
    // bridges
    ...both(-28, -7),
    ...both(0, -7),
    ...both(28, -7),
    // stair tops
    pt(-28, 0, -1.5),
    pt(0, 0, -1.5),
    pt(28, 0, -1.5),
    pt(-22, 0, -1.5),
    pt(22, 0, -1.5),
    // channel
    ...both(-32, -20, 4),
    ...both(-23, -20)
    // towers + stair feet
  ],
  killY: -20,
  theme: {
    sky: "#b7cdd6",
    fogNear: 60,
    fogFar: 170,
    hemiSky: "#e3eef3",
    hemiGround: "#3f453d",
    hemiIntensity: 1.3,
    sun: "#fff7e8",
    sunIntensity: 1.8,
    sunPos: { x: 40, y: 60, z: -30 },
    palette: {
      floor: { base: "#5d635c", minor: "#676d65", major: "#788076" },
      concrete: { base: "#7f7b70", minor: "#89857a", major: "#9a968a" },
      wall: { base: "#4d5a4a", minor: "#566553", major: "#6a7b66" }
    }
  }
};

// ../shared/src/maps/foundry.ts
function build3() {
  const boxes = [];
  const add = /* @__PURE__ */ __name((...b) => boxes.push(...b), "add");
  add(B(0, 0, 72, 72, -1, 1, "floor"));
  add(B(0, -33, 68, 2, 0, 9, "wall"), B(0, 33, 68, 2, 0, 9, "wall"));
  add(B(-33, 0, 2, 68, 0, 9, "wall"), B(33, 0, 2, 68, 0, 9, "wall"));
  add(B(0, 0, 10, 10, 0, 3, "concrete"));
  for (let i = 0; i < 5; i++) {
    const h = 2.5 - i * 0.5;
    add(B(0, 5.4 + i * 0.8, 3, 0.8, 0, h, "metal"));
    add(B(0, -5.4 - i * 0.8, 3, 0.8, 0, h, "metal"));
  }
  add(B(-3.6, 0, 1, 2.4, 3, 1.1, "crate"), B(3.6, 0, 1, 2.4, 3, 1.1, "crate"));
  for (const s of [1, -1]) {
    add(B(10 * s, 0, 10, 2.4, 2.6, 0.4, "metal"));
    add(B(10 * s, 1.15, 10, 0.1, 3, 0.9, "accent"), B(10 * s, -1.15, 10, 0.1, 3, 0.9, "accent"));
    add(B(17 * s, 0, 4, 8, 0, 3, "concrete"));
    add(B(17 * s + 1.7 * s, 0, 0.6, 8, 3, 1.1, "wall"));
    for (let i = 0; i < 5; i++) {
      add(B(17 * s, (4.4 + i * 0.8) * s, 3, 0.8, 0, 2.5 - i * 0.5, "metal"));
    }
  }
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      add(B(22 * sx, 22 * sz, 9, 9, 0, 2.5, "concrete"));
      for (let i = 0; i < 4; i++) {
        add(B(22 * sx, 22 * sz - sz * (4.9 + i * 0.8), 3, 0.8, 0, 2 - i * 0.5, "metal"));
      }
      add(B(22 * sx - sx * 4.25, 22 * sz + sz * 1.5, 0.5, 6, 2.5, 1.1, "wall"));
    }
  }
  const windowWall = /* @__PURE__ */ __name((cx, cz) => {
    add(B(cx, cz, 10, 0.8, 0, 1, "wall"));
    add(B(cx, cz, 10, 0.8, 2, 1.4, "wall"));
    add(B(cx - 4.6, cz, 0.8, 0.8, 1, 1, "wall"), B(cx + 4.6, cz, 0.8, 0.8, 1, 1, "wall"));
    add(B(cx, cz, 0.6, 0.8, 1, 1, "wall"));
  }, "windowWall");
  windowWall(-12, -14);
  windowWall(12, 14);
  add(B(0, -24, 7, 2.6, 0, 2.6, "container"), B(0, 24, 7, 2.6, 0, 2.6, "container"));
  add(B(26, 0, 2.6, 7, 0, 2.6, "container"), B(-26, 0, 2.6, 7, 0, 2.6, "container"));
  add(B(1.5, -24, 3, 2.6, 2.6, 2.4, "container"), B(-1.5, 24, 3, 2.6, 2.6, 2.4, "container"));
  add(B(8, 9, 1.6, 1.6, 0, 1.6, "crate"), B(9.7, 9, 1.6, 1.6, 0, 1.6, "crate"), B(8.8, 9, 1.2, 1.2, 1.6, 1.2, "crate"));
  add(B(-8, -9, 1.6, 1.6, 0, 1.6, "crate"), B(-9.7, -9, 1.6, 1.6, 0, 1.6, "crate"), B(-8.8, -9, 1.2, 1.2, 1.6, 1.2, "crate"));
  add(B(-9, 8, 2, 2, 0, 2, "crate"), B(9, -8, 2, 2, 0, 2, "crate"));
  add(B(12, -14, 2, 2, 0, 2, "crate"), B(14.2, -12.8, 1.4, 1.4, 0, 1.4, "crate"));
  add(B(-12, 14, 2, 2, 0, 2, "crate"), B(-14.2, 12.8, 1.4, 1.4, 0, 1.4, "crate"));
  add(B(24, -10, 1.8, 1.8, 0, 1.8, "crate"), B(-24, 10, 1.8, 1.8, 0, 1.8, "crate"));
  add(B(0, 29, 5, 0.6, 0, 1.2, "wall"), B(0, -29, 5, 0.6, 0, 1.2, "wall"));
  return boxes;
}
__name(build3, "build");
var g = /* @__PURE__ */ __name((x, z, y = 0.05) => ({ x, y, z }), "g");
var FOUNDRY = {
  id: "foundry",
  name: "Foundry",
  description: "Industrial yard. Raised center, side towers, mixed ranges.",
  size: 34,
  boxes: build3(),
  pads: [],
  spawns: [
    g(29, 29),
    g(-29, -29),
    g(29, -29),
    g(-29, 29),
    g(0, 30.5),
    g(0, -30.5),
    g(29, 10),
    g(-29, -10),
    g(12, 28),
    g(-12, -28),
    g(-29, 18),
    g(29, -18),
    g(22, 22, 2.55),
    g(-22, -22, 2.55)
  ],
  waypoints: [
    g(0, 12),
    g(0, -12),
    g(12, 0),
    g(-12, 0),
    g(20, 10),
    g(-20, -10),
    g(10, -20),
    g(-10, 20),
    g(28, 28),
    g(-28, -28),
    g(28, -28),
    g(-28, 28),
    g(6, 18),
    g(-6, -18),
    g(18, -6),
    g(-18, 6),
    g(0, 28),
    g(0, -28),
    g(28, 8),
    g(-28, -8),
    g(14, 22),
    g(-14, -22),
    g(-22, 12.5),
    g(22, -12.5),
    // Elevated routes: center platform, bridges, towers, corner decks
    g(0, 0, 3.05),
    g(10, 0, 3.05),
    g(-10, 0, 3.05),
    g(16, 0, 3.05),
    g(-16, 0, 3.05),
    g(17, 9.5),
    g(-17, -9.5),
    g(22, 22, 2.55),
    g(-22, -22, 2.55),
    g(22, -22, 2.55),
    g(-22, 22, 2.55),
    // Perimeter
    g(28, -12),
    g(-28, 12),
    g(12, -28),
    g(-12, 28)
  ],
  killY: -20,
  theme: {
    sky: "#8fb3d9",
    fogNear: 70,
    fogFar: 160,
    hemiSky: "#cfe0ff",
    hemiGround: "#3a3530",
    hemiIntensity: 1.1,
    sun: "#fff1d6",
    sunIntensity: 2.4,
    sunPos: { x: 30, y: 55, z: 18 }
  }
};

// ../shared/src/maps/skyline.ts
var tower = /* @__PURE__ */ __name((cx, cz, w, d, top) => B(cx, cz, w, d, -30, top + 30, "concrete"), "tower");
function planks(axis, fixed, start, end, tops) {
  const n = tops.length;
  const len = (end - start) / n;
  return tops.map((top, i) => {
    const c = start + len * (i + 0.5);
    const w = Math.abs(len);
    return axis === "x" ? B(c, fixed, w, 3, top - 0.4, 0.4, "metal") : B(fixed, c, 3, w, top - 0.4, 0.4, "metal");
  });
}
__name(planks, "planks");
function build4() {
  const b = [];
  const add = /* @__PURE__ */ __name((...x) => b.push(...x), "add");
  add(tower(0, 0, 14, 14, 6));
  for (const s of [1, -1]) {
    add(tower(22 * s, 0, 8, 14, 4));
    add(tower(0, 22 * s, 14, 8, 3));
    for (const t of [1, -1]) add(tower(20 * s, 20 * t, 12, 12, 2));
  }
  for (const s of [1, -1]) {
    add(...planks("x", 0, 7 * s, 18 * s, [5.5, 5, 4.5, 4]));
    for (const t of [1, -1]) {
      add(...planks("z", 22 * s, 7 * t, 14 * t, [3.5, 3, 2.5, 2]));
      add(...planks("x", 22 * t, 7 * s, 14 * s, [2.5, 2]));
    }
  }
  add(B(0, 0, 3, 3, 6, 1.4, "metal"));
  add(B(-4, 4, 1.5, 1.5, 6, 1.5, "crate"), B(4, -4, 1.5, 1.5, 6, 1.5, "crate"));
  for (const s of [1, -1]) for (const t of [1, -1]) add(B(5.5 * s, 6.6 * t, 3, 0.4, 6, 0.9, "wall"));
  for (const s of [1, -1]) {
    add(B(23.5 * s, 4 * s, 2, 2.5, 4, 1.6, "metal"), B(20 * s, -4 * s, 1.4, 1.4, 4, 1.4, "crate"));
    add(B(-4.5 * s, 24 * s, 1.6, 1.6, 3, 1.6, "crate"), B(4.5 * s, 23 * s, 2, 1.2, 3, 1.1, "metal"));
    for (const t of [1, -1]) {
      add(B(23 * s, 23 * t, 3, 3, 2, 3, "metal"));
      add(B(17 * s, 17 * t, 1.6, 1.6, 2, 1.6, "crate"));
      add(B(25.8 * s, 20 * t, 0.4, 12, 2, 0.8, "wall"), B(20 * s, 25.8 * t, 12, 0.4, 2, 0.8, "wall"));
    }
  }
  const far = [
    [-55, -30, 10, 18],
    [-48, 20, 8, 26],
    [-60, 50, 12, 12],
    [50, -45, 10, 22],
    [58, 10, 9, 30],
    [45, 52, 12, 16],
    [-15, -60, 14, 20],
    [20, -58, 9, 28],
    [10, 62, 12, 24],
    [-35, 60, 8, 18],
    [62, -12, 7, 14],
    [-62, -2, 9, 34]
  ];
  for (const [x, z, w, top] of far) add(B(x, z, w, w, -30, top + 30, "wall"));
  return b;
}
__name(build4, "build");
var SKYLINE = {
  id: "skyline",
  name: "Skyline",
  description: "Sunset rooftops over a deadly drop. Jump pads, bridges, verticality.",
  size: 30,
  boxes: build4(),
  pads: [PAD(0, 20, 2, 2, 3, { x: 0, y: 13, z: -19 }), PAD(0, -20, 2, 2, 3, { x: 0, y: 13, z: 19 })],
  spawns: [
    pt(20, 18, 2),
    pt(-20, -18, 2),
    pt(20, -18, 2),
    pt(-20, 18, 2),
    pt(16, 23, 2),
    pt(-16, -23, 2),
    pt(16, -23, 2),
    pt(-16, 23, 2),
    pt(24, -2, 4),
    pt(-24, 2, 4),
    pt(2, 25, 3),
    pt(-2, -25, 3)
  ],
  waypoints: [
    pt(0, 4.5, 6),
    pt(0, -4.5, 6),
    pt(5, 0, 6),
    pt(-5, 0, 6),
    // 0-3 tower
    pt(11, 0, 5),
    pt(-11, 0, 5),
    // 4-5 tower bridges
    pt(22, 0, 4),
    pt(-22, 0, 4),
    // 6-7 side roofs
    pt(22, 9.6, 3),
    pt(22, -9.6, 3),
    pt(-22, 9.6, 3),
    pt(-22, -9.6, 3),
    // 8-11 side↔corner bridges
    pt(20, 20, 2),
    pt(20, -20, 2),
    pt(-20, 20, 2),
    pt(-20, -20, 2),
    // 12-15 corners
    pt(0, 23.5, 3),
    pt(0, -23.5, 3),
    // 16-17 north/south roofs
    pt(0, 20, 3),
    pt(0, -20, 3),
    // 18-19 jump pads
    pt(9, 22, 2.5),
    pt(-9, 22, 2.5),
    pt(9, -22, 2.5),
    pt(-9, -22, 2.5)
    // 20-23 roof↔corner bridges
  ],
  // Jump pads launch onto the tower
  extraLinks: [[18, 0], [19, 1]],
  killY: -12,
  theme: {
    sky: "#f4b183",
    fogNear: 70,
    fogFar: 230,
    hemiSky: "#ffe0c2",
    hemiGround: "#3d3342",
    hemiIntensity: 1.05,
    sun: "#ffb06a",
    sunIntensity: 2.8,
    sunPos: { x: -60, y: 30, z: -40 },
    palette: {
      concrete: { base: "#8b8f9a", minor: "#969aa5", major: "#a7abb5" },
      wall: { base: "#4a3f5c", minor: "#54486a", major: "#665a80" },
      metal: { base: "#3b4250", minor: "#454d5c", major: "#5a6475" }
    }
  }
};

// ../shared/src/maps/index.ts
var MAPS = {
  foundry: FOUNDRY,
  skyline: SKYLINE,
  canal: CANAL,
  bunker: BUNKER
};
var MAP_ORDER = ["foundry", "skyline", "canal", "bunker"];
function isMapId(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(MAPS, id);
}
__name(isMapId, "isMapId");
function getMap(id) {
  return isMapId(id) ? MAPS[id] : FOUNDRY;
}
__name(getMap, "getMap");
function nextMapId(current) {
  const i = MAP_ORDER.indexOf(current);
  return MAP_ORDER[(i + 1) % MAP_ORDER.length];
}
__name(nextMapId, "nextMapId");

// ../server/src/player.ts
var HISTORY_SIZE = 64;
var ServerPlayer = class {
  constructor(id, name, color, socket, brain, primary) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.socket = socket;
    this.brain = brain;
    this.primary = primary;
    this.pendingPrimary = primary;
  }
  id;
  name;
  color;
  socket;
  brain;
  static {
    __name(this, "ServerPlayer");
  }
  move = createMoveState(vec3());
  yaw = 0;
  pitch = 0;
  alive = false;
  health = PLAYER.maxHealth;
  kills = 0;
  deaths = 0;
  streak = 0;
  respawnAt = 0;
  spawnTime = 0;
  lastDamageTime = -99;
  // Networking
  inputs = [];
  lastSeq = 0;
  /** Number of inputs simulated — the player's own clock for fire-rate/reload checks. */
  inputTick = 0;
  joinTick = 0;
  viewTick = 0;
  events = [];
  // Server-side weapon validation state
  weapon = 0;
  ammo = WEAPON_ORDER.map((id) => WEAPONS[id].magSize);
  nextFireTick = 0;
  /** 0 = not reloading. For shell reloads this is just a "reloading" marker. */
  reloadEndTick = 0;
  reloadStartTick = 0;
  reloadAmmoStart = 0;
  equipEndTick = 0;
  /** Weapon indices this player may use (primary, pistol, knife). */
  loadout = [0, 4, 5];
  primary;
  /** Primary to use from the next respawn. */
  pendingPrimary;
  history = new Array(HISTORY_SIZE);
  get isBot() {
    return this.socket === null;
  }
  info() {
    return { id: this.id, name: this.name, color: this.color, isBot: this.isBot, kills: this.kills, deaths: this.deaths };
  }
  refillAmmo() {
    this.ammo = WEAPON_ORDER.map((id) => WEAPONS[id].magSize);
    this.reloadEndTick = 0;
    this.nextFireTick = 0;
  }
  record(tick) {
    const slot = tick % HISTORY_SIZE;
    const p = this.move.pos;
    this.history[slot] = { tick, pos: { x: p.x, y: p.y, z: p.z }, crouched: this.move.crouched, alive: this.alive };
  }
};

// ../server/src/socket.ts
var SOCKET_OPEN = 1;

// ../server/src/room.ts
var MAX_HUMANS = 8;
var BOT_FILL = 6;
var END_SCREEN_SEC = 10;
var MAX_QUEUED_INPUTS = 64;
var MAX_SOCKET_BUFFER = 512 * 1024;
var r2 = /* @__PURE__ */ __name((n) => Math.round(n * 100) / 100, "r2");
var Room = class {
  constructor(code, isPrivate, onEmpty, onPopulation = () => {
  }, initialMap) {
    this.code = code;
    this.isPrivate = isPrivate;
    this.onEmpty = onEmpty;
    this.onPopulation = onPopulation;
    this.map = isMapId(initialMap) ? getMap(initialMap) : getMap(isPrivate ? MAP_ORDER[0] : MAP_ORDER[Math.floor(Math.random() * MAP_ORDER.length)]);
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
      lineOfSight: /* @__PURE__ */ __name((a, b) => this.lineOfSight(a, b), "lineOfSight")
    };
    this.syncBots();
    this.start();
  }
  code;
  isPrivate;
  onEmpty;
  onPopulation;
  static {
    __name(this, "Room");
  }
  map;
  players = /* @__PURE__ */ new Map();
  tick = 0;
  phase = "running";
  phaseEndsTick = MATCH.durationSec * TICK_RATE;
  broadcast = [];
  interval = null;
  botWorld;
  get time() {
    return this.tick * TICK_DT;
  }
  get humans() {
    return [...this.players.values()].filter((p) => !p.isBot);
  }
  get hasSpace() {
    return this.humans.length < MAX_HUMANS;
  }
  // ───────────────────────── Lifecycle ─────────────────────────
  start() {
    let last = performance.now();
    let acc = 0;
    const step = 1e3 / TICK_RATE;
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
  stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }
  nextId() {
    for (let id = 1; id < 250; id++) if (!this.players.has(id)) return id;
    throw new Error("room full");
  }
  nextColor() {
    const used = new Set([...this.players.values()].map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[this.players.size % PLAYER_COLORS.length];
  }
  addHuman(socket, name, primary) {
    const p = new ServerPlayer(this.nextId(), name, this.nextColor(), socket, null, isPrimary(primary) ? primary : "rifle");
    p.joinTick = this.tick;
    this.players.set(p.id, p);
    this.broadcast.push({ t: "join", p: p.info() });
    const welcome = {
      type: "welcome",
      id: p.id,
      code: this.code,
      isPrivate: this.isPrivate,
      tick: this.tick,
      map: this.map.id,
      players: [...this.players.values()].map((o) => o.info()),
      match: this.matchInfo()
    };
    this.sendJson(p, welcome);
    this.spawn(p);
    this.syncBots();
    this.onPopulation(this);
    return p;
  }
  removePlayer(p) {
    if (!this.players.delete(p.id)) return;
    this.broadcast.push({ t: "leave", id: p.id });
    if (this.humans.length === 0) {
      this.stop();
      this.onEmpty(this);
      return;
    }
    this.syncBots();
    this.onPopulation(this);
  }
  /** Keeps the lobby lively: bots fill empty slots and leave as humans join. */
  syncBots() {
    const bots = [...this.players.values()].filter((p) => p.isBot);
    const want = Math.max(0, BOT_FILL - this.humans.length);
    for (let i = bots.length; i < want; i++) {
      const used = new Set([...this.players.values()].map((p) => p.name));
      const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot${i}`;
      const b = new ServerPlayer(this.nextId(), name, this.nextColor(), null, new BotBrain(), randomPrimary());
      this.players.set(b.id, b);
      this.broadcast.push({ t: "join", p: b.info() });
      this.spawn(b);
    }
    for (let i = want; i < bots.length; i++) {
      this.players.delete(bots[i].id);
      this.broadcast.push({ t: "leave", id: bots[i].id });
    }
  }
  setLoadout(p, primary) {
    if (isPrimary(primary)) p.pendingPrimary = primary;
  }
  queueInput(p, cmd) {
    const lastQueued = p.inputs.length ? p.inputs[p.inputs.length - 1].seq : p.lastSeq;
    if (cmd.seq <= lastQueued || p.inputs.length >= MAX_QUEUED_INPUTS) return;
    p.inputs.push(cmd);
  }
  // ───────────────────────── Simulation ─────────────────────────
  step() {
    this.tick++;
    for (const p of this.players.values()) {
      if (p.isBot) this.stepBot(p);
      else this.processInputs(p);
    }
    for (const p of this.players.values()) {
      if (p.alive && p.move.pos.y < this.map.killY) this.kill(p, null, false, "fell");
      if (p.alive && p.health < PLAYER.maxHealth && this.time - p.lastDamageTime > MATCH.regenDelay) {
        p.health = Math.min(PLAYER.maxHealth, p.health + MATCH.regenPerSec * TICK_DT);
      }
      if (!p.alive && this.phase === "running" && this.time >= p.respawnAt) this.spawn(p);
      p.record(this.tick);
    }
    if (this.tick >= this.phaseEndsTick) {
      if (this.phase === "running") this.endMatch();
      else this.restartMatch();
    }
    if (this.tick % SNAPSHOT_EVERY_TICKS === 0) this.flush();
  }
  processInputs(p) {
    const budget = this.tick - p.joinTick + 20 - p.inputTick;
    const n = Math.min(p.inputs.length > 3 ? 2 : 1, p.inputs.length, Math.max(0, budget));
    for (let i = 0; i < n; i++) this.applyInput(p, p.inputs.shift());
  }
  applyInput(p, cmd) {
    p.lastSeq = cmd.seq;
    p.inputTick++;
    p.viewTick = cmd.viewTick;
    const it = p.inputTick;
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
    for (const pellets of cmd.shots) this.handleShot(p, cmd, pellets, it);
    stepMovement(
      p.move,
      { forward: cmd.forward, right: cmd.right, jump: cmd.jump, crouch: cmd.crouch, yaw: cmd.yaw },
      TICK_DT,
      this.map.boxes,
      moveSpeedMult(p.weapon, cmd.ads),
      this.map.pads
    );
  }
  stepBot(b) {
    if (!b.alive || this.phase !== "running") return;
    const weapon = weaponByIndex(b.weapon);
    const d = b.brain.think(b, this.botWorld, TICK_DT, weapon);
    stepMovement(b.move, d.input, TICK_DT, this.map.boxes, BOT_TUNING.speedMult * weapon.moveMult, this.map.pads);
    if (d.fireAt) this.botFire(b, d.fireAt);
  }
  /** Other players' hitboxes as they were at `tick` (lag compensation). */
  targetsAt(tick) {
    const out = [];
    for (const o of this.players.values()) {
      if (!o.alive || this.time - o.spawnTime < MATCH.spawnProtection) continue;
      const h = o.history[tick % HISTORY_SIZE];
      if (h && h.tick === tick && h.alive) out.push({ id: o.id, pos: h.pos, crouched: h.crouched });
      else out.push({ id: o.id, pos: o.move.pos, crouched: o.move.crouched });
    }
    return out;
  }
  /** Advances (or completes) an in-progress reload on the player's own input clock. */
  updateReload(p, def, it) {
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
  handleShot(p, cmd, pellets, it) {
    if (this.phase !== "running" || pellets.length === 0) return;
    const w = p.weapon;
    const def = weaponByIndex(w);
    if (it < p.equipEndTick || it < p.nextFireTick) return;
    if (p.reloadEndTick > 0 && def.shellReload > 0 && p.ammo[w] > 0) p.reloadEndTick = 0;
    if (!def.melee && (p.reloadEndTick > 0 || p.ammo[w] <= 0)) return;
    if (!def.melee) p.ammo[w]--;
    p.nextFireTick = it + Math.floor(60 / def.rpm * TICK_RATE * 0.7);
    const aim = forwardFromAngles(cmd.yaw, cmd.pitch);
    const minDot = Math.cos(Math.min(1.2, maxSpread(def) + 0.2));
    const origin = eyeOf(p);
    const rewindTick = clamp(cmd.viewTick, this.tick - MAX_REWIND_TICKS, this.tick);
    const targets = this.targetsAt(rewindTick);
    const results = /* @__PURE__ */ new Map();
    const ends = [];
    if (def.melee) {
      const d = pellets[0];
      if (dot(d, aim) < minDot) return;
      const yaw = Math.atan2(-d.x, -d.z);
      const pitch = Math.asin(clamp(d.y, -1, 1));
      const hit = meleeTrace(origin, yaw, pitch, def.range, this.map.boxes, targets, p.id);
      this.broadcastExcept(p, { t: "shot", id: p.id, w: def.id, e: [] });
      if (hit.targetId >= 0) results.set(hit.targetId, { dmg: def.damage, head: false });
      this.applyResults(p, def, results);
      return;
    }
    for (const dir of pellets.slice(0, def.pellets)) {
      if (dot(dir, aim) < minDot) continue;
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
    this.broadcastExcept(p, { t: "shot", id: p.id, w: def.id, e: ends });
    this.applyResults(p, def, results);
  }
  applyResults(p, def, results) {
    for (const [id, r] of results) {
      const target = this.players.get(id);
      if (!target) continue;
      const res = this.damage(target, r.dmg, p, r.head, def.name);
      if (res !== "none") {
        p.events.push({ t: "hit", target: id, head: r.head, kill: res === "kill", dmg: Math.round(r.dmg) });
      }
    }
  }
  botFire(b, target) {
    const def = weaponByIndex(b.weapon);
    const origin = eyeOf(b);
    const targets = this.targetsAt(this.tick);
    const ends = [];
    const results = /* @__PURE__ */ new Map();
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
    this.broadcast.push({ t: "shot", id: b.id, w: def.id, e: ends });
    for (const [id, r] of results) {
      const victim = this.players.get(id);
      if (victim) this.damage(victim, r.dmg, b, r.head, def.name);
    }
  }
  lineOfSight(a, b) {
    const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) return true;
    return !raycastBoxes(a, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.05, this.map.boxes);
  }
  // ───────────────────────── Combat ─────────────────────────
  damage(target, amount, attacker, head, weapon) {
    if (!target.alive || this.phase !== "running") return "none";
    if (this.time - target.spawnTime < MATCH.spawnProtection) return "none";
    target.health -= amount;
    target.lastDamageTime = this.time;
    if (!target.isBot && attacker) {
      target.events.push({ t: "damage", by: attacker.id, amount: Math.round(amount), x: r2(attacker.move.pos.x), z: r2(attacker.move.pos.z) });
    }
    target.brain?.onDamaged(target, attacker);
    if (target.health <= 0) {
      this.kill(target, attacker, head, weapon);
      return "kill";
    }
    return "hit";
  }
  kill(target, attacker, head, weapon) {
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
    this.broadcast.push({ t: "kill", killer: killer ? killer.id : 0, victim: target.id, w: weapon, head });
    if (killer && killer.kills >= MATCH.killLimit) this.endMatch();
  }
  pickSpawn(p) {
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
  spawn(p) {
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
    p.loadout = loadoutFor(p.primary).map((id) => weaponIndex(id));
    p.weapon = p.loadout[0];
    p.equipEndTick = 0;
    p.refillAmmo();
    p.brain?.reset();
    this.broadcast.push({ t: "spawn", id: p.id, w: p.weapon });
  }
  // ───────────────────────── Match flow ─────────────────────────
  matchInfo() {
    return { phase: this.phase, map: this.map.id, timeLeft: Math.max(0, (this.phaseEndsTick - this.tick) * TICK_DT) };
  }
  endMatch() {
    if (this.phase === "ended") return;
    this.phase = "ended";
    this.phaseEndsTick = this.tick + END_SCREEN_SEC * TICK_RATE;
    const ranking = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).map((p) => ({ id: p.id, kills: p.kills, deaths: p.deaths }));
    this.broadcast.push({ t: "match", match: this.matchInfo(), ranking });
  }
  restartMatch() {
    this.phase = "running";
    this.map = getMap(nextMapId(this.map.id));
    this.phaseEndsTick = this.tick + MATCH.durationSec * TICK_RATE;
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.streak = 0;
    }
    this.broadcast.push({ t: "match", match: this.matchInfo() });
    for (const p of this.players.values()) this.spawn(p);
  }
  // ───────────────────────── Networking ─────────────────────────
  broadcastExcept(except, e) {
    for (const p of this.players.values()) if (p !== except && !p.isBot) p.events.push(e);
  }
  sendJson(p, msg) {
    const s = p.socket;
    if (s && s.readyState === SOCKET_OPEN) s.send(JSON.stringify(msg));
  }
  flush() {
    const shared = this.broadcast;
    this.broadcast = [];
    const all = [...this.players.values()];
    for (const p of all) {
      const s = p.socket;
      if (!s) continue;
      if (s.readyState !== SOCKET_OPEN) continue;
      if ((s.bufferedAmount ?? 0) > MAX_SOCKET_BUFFER) {
        s.close(4e3, "connection too slow");
        continue;
      }
      const events = shared.length ? [...shared, ...p.events] : p.events;
      p.events = [];
      if (events.length) s.send(JSON.stringify({ type: "events", events }));
      const snap = encodeSnapshot({
        tick: this.tick,
        ack: p.lastSeq,
        self: { alive: p.alive, health: p.health, move: p.move },
        entities: all.filter((o) => o !== p).map((o) => ({
          id: o.id,
          alive: o.alive,
          onGround: o.move.onGround,
          crouched: o.move.crouched,
          sliding: o.move.sliding,
          pos: o.move.pos,
          yaw: o.yaw,
          pitch: o.pitch,
          weapon: o.weapon
        }))
      });
      s.send(snap);
    }
  }
};

// ../server/src/session.ts
var MAX_MSGS_PER_SEC = 200;
var ClientSession = class {
  constructor(socket, resolveRoom, log = () => {
  }) {
    this.socket = socket;
    this.resolveRoom = resolveRoom;
    this.log = log;
  }
  socket;
  resolveRoom;
  log;
  static {
    __name(this, "ClientSession");
  }
  room = null;
  player = null;
  windowStart = 0;
  count = 0;
  send(m) {
    this.socket.send(JSON.stringify(m));
  }
  rateOk() {
    const now = Date.now();
    if (now - this.windowStart >= 1e3) {
      this.windowStart = now;
      this.count = 0;
    }
    if (++this.count > MAX_MSGS_PER_SEC) {
      this.socket.close(4002, "rate limit");
      return false;
    }
    return true;
  }
  onBinary(buf) {
    if (!this.rateOk() || !this.room || !this.player) return;
    const cmd = decodeInput(buf);
    if (cmd) this.room.queueInput(this.player, cmd);
  }
  onText(text) {
    if (!this.rateOk()) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ping") {
      this.send({ type: "pong", t: Number(msg.t) || 0 });
    } else if (msg.type === "loadout") {
      if (this.room && this.player) this.room.setLoadout(this.player, msg.primary);
    } else if (msg.type === "hello" && !this.player) {
      if (msg.version !== PROTOCOL_VERSION) {
        this.send({ type: "error", message: "Client is out of date \u2014 please refresh." });
        this.socket.close(4003, "version");
        return;
      }
      const room = this.resolveRoom(msg);
      if (typeof room === "string") {
        this.send({ type: "error", message: room });
        return;
      }
      if (!room.hasSpace) {
        this.send({ type: "error", message: "Room is full." });
        return;
      }
      this.room = room;
      this.player = room.addHuman(this.socket, sanitizeName(msg.name), msg.primary);
      this.log(`[room ${room.code}] ${this.player.name} joined (${room.humans.length} humans)`);
    }
  }
  onClose() {
    if (this.room && this.player) {
      this.log(`[room ${this.room.code}] ${this.player.name} left`);
      this.room.removePlayer(this.player);
    }
    this.player = null;
  }
};

// src/index.ts
var CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var MAX_HUMANS2 = 8;
var STALE_MS = 5 * 60 * 1e3;
function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return [...bytes].map((b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
__name(newCode, "newCode");
function rejectSocket(message) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();
  server.send(JSON.stringify({ type: "error", message }));
  server.close(4004, "rejected");
  return new Response(null, { status: 101, webSocket: client });
}
__name(rejectSocket, "rejectSocket");
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      const rooms = await env.LOBBY.get(env.LOBBY.idFromName("lobby")).stats();
      return Response.json({ ok: true, rooms });
    }
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const lobby = env.LOBBY.get(env.LOBBY.idFromName("lobby"));
      const mode = url.searchParams.get("mode");
      let code;
      let isPrivate = false;
      if (mode === "join") {
        const found = await lobby.lookup(String(url.searchParams.get("code") ?? ""));
        if (!found) return rejectSocket("Room not found or full.");
        code = found.code;
        isPrivate = found.isPrivate;
      } else if (mode === "create") {
        code = await lobby.reserve(true);
        isPrivate = true;
      } else {
        code = await lobby.reserve(false);
      }
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      const target = new URL("https://room/connect");
      target.searchParams.set("code", code);
      target.searchParams.set("private", isPrivate ? "1" : "0");
      const map = url.searchParams.get("map");
      if (mode === "create" && map) target.searchParams.set("map", map);
      return room.fetch(new Request(target, request));
    }
    return env.ASSETS.fetch(request);
  }
};
var Lobby = class extends DurableObject {
  static {
    __name(this, "Lobby");
  }
  rooms = /* @__PURE__ */ new Map();
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get("rooms");
      for (const r of saved ?? []) this.rooms.set(r.code, r);
    });
  }
  async save() {
    await this.ctx.storage.put("rooms", [...this.rooms.values()]);
  }
  prune() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (now - r.updated > STALE_MS && r.humans === 0) this.rooms.delete(code);
    }
  }
  /** Quick play: busiest public room with space, else a new one. Private: always new. */
  async reserve(isPrivate) {
    this.prune();
    let best = null;
    if (!isPrivate) {
      for (const r of this.rooms.values()) {
        if (r.isPrivate || r.humans + r.reserved >= MAX_HUMANS2) continue;
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
  async lookup(rawCode) {
    const code = rawCode.toUpperCase().trim();
    const r = this.rooms.get(code);
    if (!r || r.humans + r.reserved >= MAX_HUMANS2) return null;
    r.reserved++;
    r.updated = Date.now();
    await this.save();
    return { code: r.code, isPrivate: r.isPrivate };
  }
  async report(code, humans, isPrivate) {
    const r = this.rooms.get(code) ?? { code, isPrivate, humans: 0, reserved: 0, updated: 0 };
    r.humans = humans;
    r.reserved = 0;
    r.updated = Date.now();
    this.rooms.set(code, r);
    await this.save();
  }
  async remove(code) {
    this.rooms.delete(code);
    await this.save();
  }
  async stats() {
    this.prune();
    return [...this.rooms.values()].map((r) => ({ code: r.isPrivate ? "private" : r.code, humans: r.humans }));
  }
};
var GameRoom = class extends DurableObject {
  static {
    __name(this, "GameRoom");
  }
  room = null;
  lobby() {
    return this.env.LOBBY.get(this.env.LOBBY.idFromName("lobby"));
  }
  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code") ?? "XXXXX";
    const isPrivate = url.searchParams.get("private") === "1";
    const initialMap = url.searchParams.get("map") ?? void 0;
    if (!this.room) {
      this.room = new Room(
        code,
        isPrivate,
        (r) => {
          this.room = null;
          this.ctx.waitUntil(this.lobby().remove(r.code));
        },
        (r) => this.ctx.waitUntil(this.lobby().report(r.code, r.humans.length, r.isPrivate)),
        initialMap
      );
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const session = new ClientSession(server, () => this.room ?? "Room closed \u2014 try again.");
    const helloTimer = setTimeout(() => {
      if (!session.player) server.close(4001, "hello timeout");
    }, 5e3);
    server.addEventListener("message", (ev) => {
      if (typeof ev.data === "string") session.onText(ev.data);
      else session.onBinary(ev.data);
    });
    const closed = /* @__PURE__ */ __name(() => {
      clearTimeout(helloTimer);
      session.onClose();
    }, "closed");
    server.addEventListener("close", closed);
    server.addEventListener("error", closed);
    return new Response(null, { status: 101, webSocket: client });
  }
};

// ../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-VmvgNm/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-VmvgNm/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GameRoom,
  Lobby,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
