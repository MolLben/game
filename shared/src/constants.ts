/** Fixed simulation rate. The future server will tick at this same rate. */
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Player body dimensions (meters). Feet position is the origin. */
export const PLAYER = {
  radius: 0.32,
  standHeight: 1.8,
  crouchHeight: 1.15,
  standEye: 1.62,
  crouchEye: 1.0,
  stepHeight: 0.55,
  maxHealth: 100,
} as const;

/**
 * Movement tuning. Quake-style acceleration model: ground friction + accel,
 * weak air control, momentum-preserving slide and slide-jump.
 */
export const MOVE = {
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
  slideCooldown: 0.9,
} as const;

export const MATCH = {
  killLimit: 25,
  durationSec: 480,
  respawnDelay: 3,
  spawnProtection: 1.0,
  regenDelay: 5,
  regenPerSec: 25,
} as const;
