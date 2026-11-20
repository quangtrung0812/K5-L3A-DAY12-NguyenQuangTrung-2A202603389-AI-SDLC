export type Vec3 = [number, number, number];

export type GameState = 'playing' | 'won' | 'lost';

export type ShadeState = 'chase' | 'stunned';

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
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
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
}

export interface InputFrame {
  tick: number;
  move?: [number, number];
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
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
}

export interface ScenarioConfig {
  player?: {
    pos?: Vec3;
    carried?: number;
    flames?: number;
  };
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: Vec3[];
  shades?: ScenarioShade[];
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
  stunTicks: number;
}

export interface MoteEntity {
  id: string;
  pos: Vec3;
}

export interface PlayerEntity {
  pos: Vec3;
  vy: number;
  yawRad: number;
  flames: number;
  carried: number;
  invulnTicks: number;
  pulseCooldownTicks: number;
}

export type SimEvent =
  | { type: 'event'; tick: number; name: 'mote_picked'; data: { carried: number } }
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
      name: 'player_hit';
      data: { by: 'shade' | 'fall'; flames: number; dropped: number };
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
  state: GameState;
  time_left_s: number;
  score: number;
  player: {
    pos: Vec3;
    flames: number;
    carried: number;
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
  }[];
}

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GameState;
  score: number;
}
