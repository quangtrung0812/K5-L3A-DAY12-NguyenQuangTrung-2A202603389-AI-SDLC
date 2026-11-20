import type { TuningConfig } from './types.js';

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const ISLAND_RADIUS = 38;
export const LANTERN_RING_RADIUS = 22;

export const JUMP_VELOCITY = 7.5;
export const GRAVITY = 20;

export const INITIAL_MOTE_COUNT = 20;
export const MOTE_RESPAWN_TICKS = 180;

export const INITIAL_SHADE_COUNT = 2;
export const SHADE_SPAWN_TICKS = 2100;
export const MAX_RANDOM_SHADES = 5;

export const TUNING: TuningConfig = {
  player_speed: 6,
  carry_capacity: 5,
  lantern_cost: 4,
  lantern_count_night1: 5,
  pickup_radius: 1.6,
  interact_radius: 2.6,
  pulse_cost: 1,
  pulse_radius: 7,
  night1_duration_s: 240,
  flames: 3,
  invuln_s: 1.5,
  hit_drop_ratio: 0.5,
  pulse_stun_s: 3,
  pulse_push_m: 6,
  pulse_cooldown_s: 3,
  safe_radius: 5.5,
  shade_speed: 4.2,
  shade_hit_radius: 1.2,
  fall_enabled: false,
  score: {
    per_mote: 10,
    per_lantern: 100,
    per_stun: 25,
    per_second_left: 5,
    per_flame_left: 50,
  },
};
