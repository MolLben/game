import { MOVE, PLAYER } from './constants';
import type { Box, JumpPad } from './map';
import { type Vec3, vec3 } from './math';
import { moveAxis, overlapsAny } from './physics';

export interface MoveInput {
  /** -1..1 */
  forward: number;
  /** -1..1 */
  right: number;
  jump: boolean;
  crouch: boolean;
  yaw: number;
}

export interface MoveState {
  pos: Vec3;
  vel: Vec3;
  onGround: boolean;
  crouched: boolean;
  sliding: boolean;
  slideTime: number;
  slideCooldown: number;
  slideRequest: boolean;
  prevCrouch: boolean;
}

export interface MoveEvents {
  jumped: boolean;
  landed: boolean;
  landSpeed: number;
  slideStarted: boolean;
  /** Launched by a jump pad this step. */
  launched: boolean;
}

export function createMoveState(pos: Vec3): MoveState {
  return {
    pos: vec3(pos.x, pos.y, pos.z),
    vel: vec3(),
    onGround: false,
    crouched: false,
    sliding: false,
    slideTime: 0,
    slideCooldown: 0,
    slideRequest: false,
    prevCrouch: false,
  };
}

export function bodyHeight(s: MoveState): number {
  return s.crouched ? PLAYER.crouchHeight : PLAYER.standHeight;
}

export function eyeHeight(s: MoveState): number {
  return s.crouched ? PLAYER.crouchEye : PLAYER.standEye;
}

function accelerate(vel: Vec3, wx: number, wz: number, wishSpeed: number, accel: number, dt: number) {
  const current = vel.x * wx + vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  const a = Math.min(accel * wishSpeed * dt, add);
  vel.x += a * wx;
  vel.z += a * wz;
}

function applyFriction(vel: Vec3, friction: number, dt: number) {
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

function endSlide(s: MoveState) {
  s.sliding = false;
  s.slideCooldown = MOVE.slideCooldown;
}

/**
 * Advances one fixed simulation step. Deterministic given the same inputs,
 * so the server can run the exact same code for authoritative movement.
 */
export function stepMovement(
  s: MoveState,
  input: MoveInput,
  dt: number,
  boxes: readonly Box[],
  speedMult = 1,
  pads: readonly JumpPad[] = [],
): MoveEvents {
  const ev: MoveEvents = { jumped: false, landed: false, landSpeed: 0, slideStarted: false, launched: false };
  const wasGround = s.onGround;
  s.slideCooldown = Math.max(0, s.slideCooldown - dt);

  // Wish direction from input + yaw
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

  // Crouch / uncrouch (needs headroom)
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

  // Slide start: crouch pressed while moving fast (also queues in air → slide on landing)
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

  // Jump (slide-jump keeps momentum)
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

  // Collide, one axis at a time
  const h = bodyHeight(s);
  const canStep = wasGround && !ev.jumped;
  if (moveAxis(s.pos, 'x', s.vel.x * dt, h, boxes, canStep)) s.vel.x = 0;
  if (moveAxis(s.pos, 'z', s.vel.z * dt, h, boxes, canStep)) s.vel.z = 0;
  const vyBefore = s.vel.y;
  s.onGround = false;
  if (moveAxis(s.pos, 'y', s.vel.y * dt, h, boxes, false)) {
    if (s.vel.y < 0) s.onGround = true;
    s.vel.y = 0;
  }

  // Snap down stairs / small drops instead of briefly going airborne
  if (!s.onGround && wasGround && !ev.jumped && s.vel.y <= 0) {
    const y0 = s.pos.y;
    if (moveAxis(s.pos, 'y', -PLAYER.stepHeight, h, boxes, false)) {
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

  // Jump pads: standing on one sets your velocity (applied from the next step)
  if (s.onGround) {
    for (const p of pads) {
      if (
        s.pos.x >= p.min.x && s.pos.x <= p.max.x &&
        s.pos.z >= p.min.z && s.pos.z <= p.max.z &&
        Math.abs(s.pos.y - p.max.y) < 0.15
      ) {
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
