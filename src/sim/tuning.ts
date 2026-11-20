import type { TuningConfig } from './types.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;

export const DASH_DURATION_TICKS = 12; // 0.2 s
export const DASH_COOLDOWN_TICKS = 90; // 1.5 s

export const PICKUP_HEIGHT_TOLERANCE = 1.5;
export const INTERACT_HEIGHT_TOLERANCE = 2.0;

export const INITIAL_MOTE_COUNT = 20;
export const MAX_MOTE_COUNT = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;
export const DROPPED_MOTE_TTL_TICKS = 480;

export const PULSE_CENTER_Y_OFFSET = 0.8;
export const PULSE_STUN_TICKS = 120; // 2.0 s
export const PULSE_KNOCKBACK_TICKS = 15;
export const PULSE_COOLDOWN_TICKS = 180; // 3.0 s

export const SAFE_PUSH_MAX_TICKS = 30;

export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_LEASH_RADIUS = 18.0;
export const SHADE_WANDER_SPEED = 2.0;
export const SHADE_NIGHT3_SPEED = 4.5;
export const SHADE_HIT_HEIGHT_TOLERANCE = 1.5;
export const SHADE_RECOIL_DISTANCE = 2.0;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_SPAWN_DELAY_TICKS = 300;
export const SHADE_SPAWNING_STATE_TICKS = 30;
export const SHADE_MIN_SPAWN_PLAYER_DIST = 15.0;

export const INVULN_TICKS = 90; // 1.5 s
export const FALL_Y_THRESHOLD = -10.0;
export const FALL_RESPAWN_TICKS = 60;

export const DRIFTER_SPEED = 7.0;
export const DRIFTER_IDLE_SPEED = 2.0;
export const DRIFTER_MAX_COUNT = 2;
export const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
export const DRIFTER_DETECT_RADIUS = 15.0;
export const DRIFTER_DETECT_MIN_CARRIED = 5;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_MAX_STEAL = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_DROP_FLEE_TICKS = 120;

export const CHARM_DURATION_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;
export const CHARM_PLAYER_SPEED = 7.2;

export const WIND_CYCLE_TICKS = 1800; // 30 s
export const WIND_DURATION_TICKS = 300; // 5 s
export const WIND_WARNING_TICKS = 120; // 2 s
export const WIND_PUSH_SPEED = 2.0;

export const TUNING: TuningConfig = {
  player_speed: 6,
  dash_speed: 14,
  dash_duration_s: 0.2,
  dash_cooldown_s: 1.5,
  carry_capacity: 10,
  lantern_cost: 10,
  lantern_count_night1: 5,
  pickup_radius: 1,
  interact_radius: 2,
  pulse_cost: 3,
  pulse_radius: 5,
  night1_duration_s: 300,
  night2_duration_s: 330,
  night3_duration_s: 360,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 3,
  safe_radius: 6,
  shade_speed: 4,
  shade_hit_radius: 1,
  fall_enabled: true,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 5,
    per_second_left: 2,
    per_flame_left: 50,
  },
};

/** Standardized Phase 2 color palette (max 10% RGB deviation). */
export const PALETTE = {
  sky: '#0E1430',
  fog: '#1B2350',
  grass: '#2F5D50',
  sand: '#C9B48A',
  wood: '#6B4A2F',
  cloudSea: '#12384A',
  lanternLit: '#FFB347',
  lanternCore: '#FFE9B0',
  lanternUnlit: '#5B5F6E',
  moteCore: '#FFF6C2',
  moteHalo: '#FFE58A',
  shadeBody: '#120A1A',
  shadeEdge: '#7A3CFF',
  shadeStunned: '#3A3450',
  mayCloak: '#E8E2D0',
  mayScarfAndCharm: '#C8102E',
  goldAccent: '#F2C14E',
  drifter: '#8FA3B8',
  uiDanger: '#FF5A5F',
  uiText: '#F5F1E6',
} as const;
