export type Vec3 = [number, number, number];

export type NightNumber = 1 | 2 | 3;

export type GameState = 'playing' | 'paused' | 'won' | 'lost';

export type ShadeState = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned';

export type DrifterState = 'idle' | 'chase' | 'flee' | 'removed';

export type MoteKind = 'random' | 'dropped';

export type GameOverReason = 'all_lit' | 'dawn' | 'no_flames';

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface TuningConfig {
  player_speed: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface InputState {
  move: [number, number];
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
  dash: boolean;
  pause: boolean;
}

export interface InputFrame {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3;
  state?: ShadeState;
  state_ticks_left?: number;
}

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3;
  state?: Exclude<DrifterState, 'removed'>;
  stolen?: number;
  flee_ticks?: number;
}

export interface ScenarioCharm {
  id: string;
  pos?: Vec3;
  available?: boolean;
  respawn_s?: number;
  respawn_ticks?: number;
}

export type ScenarioMote =
  | Vec3
  | {
      id?: string;
      pos: Vec3;
      kind?: MoteKind;
      ttl_s?: number | null;
      ttl_ticks?: number | null;
    };

export interface ScenarioConfig {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
    invuln_ticks?: number;
    dash_cd_ticks?: number;
    pulse_cd_ticks?: number;
    charm_ticks?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface LanternEntity {
  id: string;
  pos: Vec3;
  lit: boolean;
  deposited: number;
}

export interface ShadeEntity {
  id: string;
  pos: Vec3;
  state: ShadeState;
  stateTicksLeft: number;
  knockbackTicks: number;
  knockbackDir: [number, number];
  recoilDir: [number, number];
  safePushTicks: number;
  wanderTarget: [number, number] | null;
}

export interface DrifterEntity {
  id: string;
  pos: Vec3;
  state: DrifterState;
  stolen: number;
  hasStolen: boolean;
  fleeTicks: number;
  orbitAngle: number;
}

export interface CharmEntity {
  id: string;
  pos: Vec3;
  available: boolean;
  respawnTicks: number;
}

export interface MoteEntity {
  id: string;
  pos: Vec3;
  kind: MoteKind;
  ttlTicks: number | null;
  pickableFromTick: number;
}

export interface WindState {
  active: boolean;
  warning: boolean;
  dirDeg: number;
  ticksLeft: number;
}

export interface PlayerEntity {
  pos: Vec3;
  vel: Vec3;
  grounded: boolean;
  yawRad: number;
  flames: number;
  carried: number;
  invulnTicks: number;
  dashActiveTicks: number;
  dashDir: [number, number];
  dashCdTicks: number;
  pulseCdTicks: number;
  charmTicks: number;
  launchActive: boolean;
  launchVel: [number, number];
  fallRespawnTicks: number;
}

export type SimEvent =
  | { type: 'event'; tick: number; name: 'night_start'; data: { night: NightNumber } }
  | { type: 'event'; tick: number; name: 'paused'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'resumed'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'dash'; data: Record<string, never> }
  | { type: 'event'; tick: number; name: 'mote_picked'; data: { carried: number } }
  | {
      type: 'event';
      tick: number;
      name: 'charm_picked';
      data: { charm_id: string; charm_ticks: number };
    }
  | {
      type: 'event';
      tick: number;
      name: 'deposit';
      data: { lantern_id: string; amount: number; deposited: number };
    }
  | { type: 'event'; tick: number; name: 'lantern_lit'; data: { lantern_id: string } }
  | { type: 'event'; tick: number; name: 'pulse'; data: { stunned_ids: string[] } }
  | {
      type: 'event';
      tick: number;
      name: 'drifter_steal';
      data: { drifter_id: string; amount: number; carried: number };
    }
  | {
      type: 'event';
      tick: number;
      name: 'drifter_drop';
      data: { drifter_id: string; amount: number };
    }
  | {
      type: 'event';
      tick: number;
      name: 'player_hit';
      data:
        | { by: 'shade'; flames: number; dropped: number }
        | { by: 'fall'; flames: number; dropped: number; lost: number };
    }
  | { type: 'event'; tick: number; name: 'shade_spawned'; data: { id: string } }
  | {
      type: 'event';
      tick: number;
      name: 'game_over';
      data: { result: 'won' | 'lost'; reason: GameOverReason };
    };

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightNumber;
  state: GameState;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3;
    vel: Vec3;
    grounded: boolean;
    flames: number;
    carried: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: {
    id: string;
    pos: Vec3;
    lit: boolean;
    deposited: number;
  }[];
  shades: {
    id: string;
    pos: Vec3;
    state: ShadeState;
  }[];
  motes_active: number;
  motes: {
    id: string;
    pos: Vec3;
    kind: MoteKind;
    ttl_s: number | null;
  }[];
  drifters: {
    id: string;
    pos: Vec3;
    state: Exclude<DrifterState, 'removed'>;
    stolen: number;
  }[];
  charms: {
    id: string;
    available: boolean;
    respawn_s: number;
  }[];
}

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}
