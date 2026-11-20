import { getNightMap, type NightMapDef } from './maps.js';
import { SeededRng } from './prng.js';
import {
  CHARM_DURATION_TICKS,
  CHARM_PLAYER_SPEED,
  CHARM_RESPAWN_TICKS,
  DASH_COOLDOWN_TICKS,
  DASH_DURATION_TICKS,
  DRIFTER_DETECT_MIN_CARRIED,
  DRIFTER_DETECT_RADIUS,
  DRIFTER_DROP_FLEE_TICKS,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_COUNT,
  DRIFTER_MAX_STEAL,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_SPEED,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_RESPAWN_TICKS,
  FALL_Y_THRESHOLD,
  GRAVITY,
  INITIAL_MOTE_COUNT,
  INTERACT_HEIGHT_TOLERANCE,
  INVULN_TICKS,
  JUMP_VELOCITY,
  MAX_MOTE_COUNT,
  MOTE_SPAWN_INTERVAL_TICKS,
  PICKUP_HEIGHT_TOLERANCE,
  PULSE_CENTER_Y_OFFSET,
  PULSE_COOLDOWN_TICKS,
  PULSE_KNOCKBACK_TICKS,
  PULSE_STUN_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SHADE_DETECT_RADIUS,
  SHADE_HIT_HEIGHT_TOLERANCE,
  SHADE_LEASH_RADIUS,
  SHADE_MIN_SPAWN_PLAYER_DIST,
  SHADE_RECOIL_DISTANCE,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWN_DELAY_TICKS,
  SHADE_SPAWNING_STATE_TICKS,
  SHADE_WANDER_SPEED,
  TICK_RATE,
  TUNING,
  WIND_CYCLE_TICKS,
  WIND_DURATION_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARNING_TICKS,
} from './tuning.js';
import type {
  CharmEntity,
  DrifterEntity,
  EndRecord,
  GameOverReason,
  GameState,
  InputState,
  LanternEntity,
  MoteEntity,
  NightNumber,
  PlayerEntity,
  ScenarioConfig,
  ShadeEntity,
  SimEvent,
  SnapshotRecord,
  Vec3,
  WindState,
} from './types.js';

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundVec3(v: Vec3): Vec3 {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function compareEntityId(a: string, b: string): number {
  const ma = /^([A-Za-z]+)(\d+)$/.exec(a);
  const mb = /^([A-Za-z]+)(\d+)$/.exec(b);
  if (ma && mb && ma[1] === mb[1]) {
    return Number.parseInt(ma[2], 10) - Number.parseInt(mb[2], 10);
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createDefaultInput(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}

export interface SimOptions {
  seed: number;
  night?: NightNumber;
  scenario?: ScenarioConfig;
}

export class LanternIslandSim {
  readonly seed: number;
  readonly night: NightNumber;
  readonly map: NightMapDef;

  tick = 0;
  simTick = 0;
  state: GameState = 'playing';
  gameOverReason: GameOverReason | null = null;
  score = 0;

  player: PlayerEntity;
  lanterns: LanternEntity[];
  shades: ShadeEntity[] = [];
  motes: MoteEntity[] = [];
  drifters: DrifterEntity[] = [];
  charms: CharmEntity[] = [];
  wind: WindState = { active: false, warning: false, dirDeg: 0, ticksLeft: 0 };

  private rng: SeededRng;
  private initialTimeLeftS: number;
  private totalDurationTicks: number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private randomDrifters: boolean;
  private windEnabled: boolean;
  private nightStartEmitted = false;
  private nextWindDirDeg = 0;

  private prevInput: InputState = createDefaultInput();
  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private nextDrifterSeq = 1;
  private usedMoteIds = new Set<string>();
  private usedShadeIds = new Set<string>();
  private usedDrifterIds = new Set<string>();

  constructor(options: SimOptions) {
    this.seed = options.seed;
    this.night = options.night ?? 1;
    this.map = getNightMap(this.night);
    this.rng = new SeededRng(this.seed);

    const scenario = options.scenario;

    this.initialTimeLeftS = scenario?.time_left_s ?? this.map.durationS;
    this.totalDurationTicks = Math.max(0, Math.ceil(this.initialTimeLeftS * TICK_RATE - 1e-9));
    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;
    this.randomDrifters = scenario?.random_drifters ?? this.map.hasDrifters;
    this.windEnabled = scenario?.wind_enabled ?? this.map.hasWind;

    // 1. Initialize standardized lanterns for this night
    this.lanterns = this.map.lanterns.map((l) => ({
      id: l.id,
      pos: [l.pos[0], l.pos[1], l.pos[2]],
      lit: false,
      deposited: 0,
    }));

    if (scenario?.lanterns) {
      for (const override of scenario.lanterns) {
        const target = this.lanterns.find((l) => l.id === override.id);
        if (!target) continue;
        if (override.pos !== undefined) {
          target.pos = [override.pos[0], override.pos[1], override.pos[2]];
        }
        if (override.deposited !== undefined) {
          target.deposited = override.deposited;
        }
        if (override.lit !== undefined) {
          target.lit = override.lit;
          if (override.lit && override.deposited === undefined) {
            target.deposited = Math.max(target.deposited, TUNING.lantern_cost);
          }
        } else if (target.deposited >= TUNING.lantern_cost) {
          target.lit = true;
        }
      }
    }

    // 2. Initialize player
    const startPos: Vec3 = scenario?.player?.pos
      ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
      : [...this.map.playerSpawn];
    const startSurface = this.map.getSurfaceY(startPos[0], startPos[2]);
    const grounded = startSurface !== null && Math.abs(startPos[1] - startSurface) <= 0.05;

    this.player = {
      pos: startPos,
      vel: [0, 0, 0],
      grounded,
      yawRad: 0, // facing +Z
      flames: scenario?.player?.flames ?? TUNING.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: scenario?.player?.invuln_ticks ?? 0,
      dashActiveTicks: 0,
      dashDir: [0, 1],
      dashCdTicks: scenario?.player?.dash_cd_ticks ?? 0,
      pulseCdTicks: scenario?.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario?.player?.charm_ticks ?? 0,
      launchActive: false,
      launchVel: [0, 0],
      fallRespawnTicks: 0,
    };

    // 3. Initialize motes (20 distinct points at start if randomMotes)
    if (scenario?.motes !== undefined) {
      for (const m of scenario.motes) {
        if (!Array.isArray(m) && m.id) this.usedMoteIds.add(m.id);
      }
      for (const m of scenario.motes) {
        if (Array.isArray(m)) {
          this.motes.push({
            id: this.allocMoteId(),
            pos: [m[0], m[1], m[2]],
            kind: 'random',
            ttlTicks: null,
            pickableFromTick: 0,
          });
        } else {
          const kind = m.kind ?? 'random';
          const ttlTicks =
            m.ttl_ticks !== undefined
              ? m.ttl_ticks
              : m.ttl_s !== undefined
                ? m.ttl_s === null
                  ? null
                  : Math.round(m.ttl_s * TICK_RATE)
                : kind === 'dropped'
                  ? DROPPED_MOTE_TTL_TICKS
                  : null;
          this.motes.push({
            id: m.id ?? this.allocMoteId(),
            pos: [m.pos[0], m.pos[1], m.pos[2]],
            kind,
            ttlTicks,
            pickableFromTick: 0,
          });
        }
      }
    } else if (this.randomMotes) {
      this.spawnInitialRandomMotes();
    }

    // 4. Initialize shades (default Night starts with 0 shades; 2 spawn at tick 300)
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        if (s.id) this.usedShadeIds.add(s.id);
      }
      for (const s of scenario.shades) {
        const pos: Vec3 = [s.pos[0], s.pos[1], s.pos[2]];
        const initialState =
          s.state ?? (distXZ(pos, this.player.pos) <= SHADE_DETECT_RADIUS ? 'chase' : 'wander');
        const defaultTicks =
          initialState === 'stunned'
            ? PULSE_STUN_TICKS
            : initialState === 'recoil'
              ? SHADE_RECOIL_TICKS
              : initialState === 'spawning'
                ? SHADE_SPAWNING_STATE_TICKS
                : 0;
        this.shades.push({
          id: s.id ?? this.allocShadeId(),
          pos,
          state: initialState,
          stateTicksLeft: s.state_ticks_left ?? defaultTicks,
          knockbackTicks: 0,
          knockbackDir: [1, 0],
          recoilDir: [1, 0],
          safePushTicks: 0,
          wanderTarget: null,
        });
      }
    }

    // 5. Initialize drifters
    if (scenario?.drifters !== undefined) {
      for (const d of scenario.drifters) {
        if (d.id) this.usedDrifterIds.add(d.id);
      }
      for (const d of scenario.drifters) {
        const stolen = d.stolen ?? 0;
        const state = d.state ?? 'idle';
        this.drifters.push({
          id: d.id ?? this.allocDrifterId(),
          pos: [d.pos[0], d.pos[1], d.pos[2]],
          state,
          stolen,
          hasStolen: stolen > 0 || state === 'flee',
          fleeTicks: d.flee_ticks ?? (state === 'flee' ? DRIFTER_FLEE_TICKS : 0),
          orbitAngle: this.rng.range(0, Math.PI * 2),
        });
      }
    }

    // 6. Initialize charms
    if (scenario?.charms !== undefined) {
      for (const c of scenario.charms) {
        const fallback = this.map.charms.find((mc) => mc.id === c.id);
        const pos: Vec3 = c.pos
          ? [c.pos[0], c.pos[1], c.pos[2]]
          : fallback
            ? [...fallback.pos]
            : [0, 0, 0];
        const available = c.available ?? true;
        const respawnTicks =
          c.respawn_ticks !== undefined
            ? c.respawn_ticks
            : c.respawn_s !== undefined
              ? Math.round(c.respawn_s * TICK_RATE)
              : available
                ? 0
                : CHARM_RESPAWN_TICKS;
        this.charms.push({
          id: c.id,
          pos,
          available,
          respawnTicks,
        });
      }
    } else {
      this.charms = this.map.charms.map((c) => ({
        id: c.id,
        pos: [...c.pos],
        available: true,
        respawnTicks: 0,
      }));
    }

    // Pre-roll first wind direction deterministically if wind enabled
    if (this.windEnabled) {
      this.nextWindDirDeg = round3(this.rng.range(0, 360));
    }
  }

  getTimeLeftS(): number {
    return Math.max(0, round3(this.initialTimeLeftS - this.simTick / TICK_RATE));
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: this.getTimeLeftS(),
      score: this.score,
      wind: {
        active: this.wind.active,
        dir_deg: round3(this.wind.dirDeg),
      },
      player: {
        pos: roundVec3(this.player.pos),
        vel: roundVec3(this.player.vel),
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        invuln: this.player.invulnTicks > 0,
        dash_cd_s: round3(this.player.dashCdTicks / TICK_RATE),
        pulse_cd_s: round3(this.player.pulseCdTicks / TICK_RATE),
        charm_s: round3(this.player.charmTicks / TICK_RATE),
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundVec3(l.pos),
        lit: l.lit,
        deposited: l.deposited,
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundVec3(s.pos),
        state: s.state,
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundVec3(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE),
      })),
      drifters: this.drifters
        .filter((d) => d.state !== 'removed')
        .map((d) => ({
          id: d.id,
          pos: roundVec3(d.pos),
          state: d.state as Exclude<DrifterEntity['state'], 'removed'>,
          stolen: d.stolen,
        })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / TICK_RATE),
      })),
    };
  }

  getEndRecord(): EndRecord {
    return {
      type: 'end',
      ticks: this.tick,
      state: this.state,
      score: this.score,
    };
  }

  step(input: InputState): SimEvent[] {
    if (this.state === 'won' || this.state === 'lost') {
      return [];
    }

    const events: SimEvent[] = [];
    this.tick += 1;

    // ── STEP 1: Read input (handle pause first) ──
    const pausePressed = input.pause && !this.prevInput.pause;
    if (pausePressed) {
      if (this.state === 'playing') {
        this.state = 'paused';
        this.syncPrevInput(input);
        events.push({ type: 'event', tick: this.tick, name: 'paused', data: {} });
        return events;
      } else if (this.state === 'paused') {
        this.state = 'playing';
        events.push({ type: 'event', tick: this.tick, name: 'resumed', data: {} });
      }
    }

    if (this.state === 'paused') {
      this.syncPrevInput(input);
      return events;
    }

    this.simTick += 1;

    if (!this.nightStartEmitted) {
      this.nightStartEmitted = true;
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'night_start',
        data: { night: this.night },
      });
    }

    // Detect rising edges for gameplay actions
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    const dashPressed = input.dash && !this.prevInput.dash;
    this.syncPrevInput(input);

    // Guard terminal scenario setup on tick 1
    if (this.simTick === 1 && (this.player.flames <= 0 || this.lanterns.every((l) => l.lit) || this.initialTimeLeftS <= 0)) {
      this.evaluateWinLoss(events);
      return events;
    }

    // ── STEP 2: Decrement counters (time via simTick, cooldowns, invuln, stun, charm, TTL, charm respawn, drifter flee, wind) ──
    const charmActiveThisTick = this.player.charmTicks > 0;
    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.dashCdTicks > 0) this.player.dashCdTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;
    if (this.player.dashActiveTicks > 0) this.player.dashActiveTicks -= 1;

    if (this.player.fallRespawnTicks > 0) {
      this.player.fallRespawnTicks -= 1;
      if (this.player.fallRespawnTicks === 0) {
        this.player.pos = [...this.map.playerSpawn];
        this.player.vel = [0, 0, 0];
        this.player.grounded = true;
        this.player.launchActive = false;
        this.player.dashActiveTicks = 0;
        this.player.invulnTicks = INVULN_TICKS;
      }
    }

    // Shade timers (spawning & stunned exit in Step 2; recoil completes its 60th retreat step in Step 8)
    for (const shade of this.shades) {
      if (shade.state === 'spawning' || shade.state === 'stunned') {
        if (shade.stateTicksLeft > 0) shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft <= 0) {
          const prevState = shade.state;
          shade.stateTicksLeft = 0;
          shade.knockbackTicks = 0;
          const d = distXZ(shade.pos, this.player.pos);
          const canChase =
            this.player.fallRespawnTicks === 0 &&
            this.player.flames > 0 &&
            d <= (prevState === 'spawning' ? SHADE_DETECT_RADIUS : SHADE_LEASH_RADIUS);
          shade.state = canChase ? 'chase' : 'wander';
        }
      }
      if (shade.safePushTicks > 0) {
        shade.safePushTicks -= 1;
      }
    }

    // Drifter flee timers
    for (const drifter of this.drifters) {
      if (drifter.state === 'flee') {
        drifter.fleeTicks -= 1;
        if (drifter.fleeTicks <= 0) {
          drifter.fleeTicks = 0;
          drifter.state = 'removed';
        }
      }
    }
    this.drifters = this.drifters.filter((d) => d.state !== 'removed');

    // Dropped mote TTL
    if (this.motes.length > 0) {
      this.motes = this.motes.filter((m) => {
        if (m.ttlTicks === null) return true;
        m.ttlTicks -= 1;
        return m.ttlTicks > 0;
      });
    }

    // Charm respawn timers
    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks -= 1;
        if (charm.respawnTicks <= 0) {
          charm.respawnTicks = 0;
          charm.available = true;
        }
      }
    }

    // Night 3 Wind cycle (every 30s = 1800 ticks, lasts 5s = 300 ticks, warned 2s = 120 ticks ahead)
    if (this.windEnabled) {
      const cyclePos = this.simTick % WIND_CYCLE_TICKS;
      if (this.simTick >= WIND_CYCLE_TICKS && cyclePos === 0) {
        this.wind.active = true;
        this.wind.warning = false;
        this.wind.dirDeg = this.nextWindDirDeg;
        this.wind.ticksLeft = WIND_DURATION_TICKS;
        this.nextWindDirDeg = round3(this.rng.range(0, 360));
      } else if (this.wind.active) {
        this.wind.ticksLeft -= 1;
        if (this.wind.ticksLeft <= 0) {
          this.wind.active = false;
          this.wind.ticksLeft = 0;
        }
      }
      this.wind.warning =
        !this.wind.active && cyclePos >= WIND_CYCLE_TICKS - WIND_WARNING_TICKS && cyclePos < WIND_CYCLE_TICKS;
    } else {
      this.wind.active = false;
      this.wind.warning = false;
    }

    // ── STEP 3: Move Mây (jump, dash, launchpad, wind) & check fall (Y < -10) ──
    const isAliveOnMap = this.player.fallRespawnTicks === 0 && this.player.flames > 0;
    if (isAliveOnMap) {
      let mx = input.move[0];
      let mz = input.move[1];
      const moveLen = Math.hypot(mx, mz);
      if (moveLen > 1) {
        mx /= moveLen;
        mz /= moveLen;
      }
      const theta = (input.cam_yaw_deg * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const wx = mx * cosT + mz * sinT;
      const wz = -mx * sinT + mz * cosT;
      const hasMove = Math.hypot(wx, wz) > 1e-6;

      // Dash activation
      const canDash =
        dashPressed &&
        this.player.dashActiveTicks === 0 &&
        (charmActiveThisTick || this.player.dashCdTicks === 0);
      if (canDash) {
        const wLen = Math.hypot(wx, wz);
        this.player.dashDir =
          wLen > 1e-6
            ? [wx / wLen, wz / wLen]
            : [Math.sin(this.player.yawRad), Math.cos(this.player.yawRad)];
        this.player.yawRad = Math.atan2(this.player.dashDir[0], this.player.dashDir[1]);
        this.player.dashActiveTicks = DASH_DURATION_TICKS;
        this.player.dashCdTicks = charmActiveThisTick ? 0 : DASH_COOLDOWN_TICKS;
        this.player.launchActive = false;
        this.player.vel[1] = 0;
        events.push({ type: 'event', tick: this.tick, name: 'dash', data: {} });
      }

      let vx = 0;
      let vz = 0;
      let vy = this.player.vel[1];

      if (this.player.dashActiveTicks > 0) {
        vx = this.player.dashDir[0] * TUNING.dash_speed;
        vz = this.player.dashDir[1] * TUNING.dash_speed;
        vy = 0; // Air dash maintains constant height
      } else if (this.player.launchActive) {
        vx = this.player.launchVel[0];
        vz = this.player.launchVel[1];
      } else {
        const speed = charmActiveThisTick ? CHARM_PLAYER_SPEED : TUNING.player_speed;
        vx = wx * speed;
        vz = wz * speed;
        if (hasMove) {
          this.player.yawRad = Math.atan2(wx, wz);
        }
        if (jumpPressed && this.player.grounded) {
          vy = JUMP_VELOCITY;
          this.player.grounded = false;
        }
      }

      // Apply Night 3 wind push (2 m/s horizontally)
      if (this.wind.active) {
        const windRad = (this.wind.dirDeg * Math.PI) / 180;
        vx += Math.cos(windRad) * WIND_PUSH_SPEED;
        vz += Math.sin(windRad) * WIND_PUSH_SPEED;
      }

      // Horizontal integration with map walls/ramps/tower collision
      const targetX = this.player.pos[0] + vx * DT;
      const targetZ = this.player.pos[2] + vz * DT;
      const moved = this.map.resolveMove(this.player.pos, targetX, targetZ, true);
      const actualVx = (moved.x - this.player.pos[0]) / DT;
      const actualVz = (moved.z - this.player.pos[2]) / DT;
      this.player.pos[0] = moved.x;
      this.player.pos[2] = moved.z;

      // Vertical integration
      const surfaceY = this.map.getSurfaceY(this.player.pos[0], this.player.pos[2]);
      if (this.player.dashActiveTicks > 0) {
        // Keep exact altitude during dash, unless ascending a ramp beneath feet
        if (surfaceY !== null && this.player.pos[1] < surfaceY) {
          this.player.pos[1] = surfaceY;
          this.player.grounded = true;
        } else {
          this.player.grounded = surfaceY !== null && Math.abs(this.player.pos[1] - surfaceY) <= 0.02;
        }
        vy = 0;
      } else {
        const prevY = this.player.pos[1];
        if (!this.player.grounded || surfaceY === null || prevY > surfaceY + 0.05 || vy > 0) {
          vy -= GRAVITY * DT;
          this.player.pos[1] += vy * DT;
        }

        if (surfaceY !== null && this.player.pos[1] <= surfaceY && vy <= 0) {
          this.player.pos[1] = surfaceY;
          vy = 0;
          this.player.grounded = true;
          this.player.launchActive = false;
        } else if (surfaceY !== null && this.player.grounded && Math.abs(this.player.pos[1] - surfaceY) <= 0.48) {
          // Smoothly follow ramp slope while walking up or down
          this.player.pos[1] = surfaceY;
          vy = 0;
          this.player.grounded = true;
        } else {
          this.player.grounded = false;
        }
      }

      this.player.vel = [actualVx, vy, actualVz];

      // Launchpad trigger check
      if (!this.player.launchActive && this.player.dashActiveTicks === 0) {
        for (const pad of this.map.launchpads) {
          if (
            distXZ(this.player.pos, pad.pos) <= pad.radius &&
            Math.abs(this.player.pos[1] - pad.pos[1]) <= 0.6
          ) {
            this.player.launchActive = true;
            this.player.launchVel = [pad.vx, pad.vz];
            this.player.vel = [pad.vx, pad.vy, pad.vz];
            this.player.grounded = false;
            break;
          }
        }
      }

      // Fall off island check (Y < -10): ignores invuln, triggers once
      if (this.player.pos[1] < FALL_Y_THRESHOLD) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const lost = this.player.carried;
        this.player.carried = 0;
        this.player.vel = [0, 0, 0];
        this.player.grounded = false;
        this.player.dashActiveTicks = 0;
        this.player.launchActive = false;
        events.push({
          type: 'event',
          tick: this.tick,
          name: 'player_hit',
          data: { by: 'fall', flames: this.player.flames, dropped: 0, lost },
        });
        if (this.player.flames > 0) {
          this.player.fallRespawnTicks = FALL_RESPAWN_TICKS;
        }
      }
    }

    // ── STEP 4: Pick up motes and charms ──
    const canInteractWorld = this.player.fallRespawnTicks === 0 && this.player.flames > 0;
    if (canInteractWorld) {
      if (this.player.carried < TUNING.carry_capacity && this.motes.length > 0) {
        const remaining: MoteEntity[] = [];
        for (const mote of this.motes) {
          if (
            this.player.carried < TUNING.carry_capacity &&
            this.simTick >= mote.pickableFromTick &&
            distXZ(this.player.pos, mote.pos) <= TUNING.pickup_radius &&
            Math.abs(this.player.pos[1] - mote.pos[1]) <= PICKUP_HEIGHT_TOLERANCE
          ) {
            this.player.carried += 1;
            events.push({
              type: 'event',
              tick: this.tick,
              name: 'mote_picked',
              data: { carried: this.player.carried },
            });
          } else {
            remaining.push(mote);
          }
        }
        this.motes = remaining;
      }

      for (const charm of this.charms) {
        if (
          charm.available &&
          distXZ(this.player.pos, charm.pos) <= TUNING.pickup_radius &&
          Math.abs(this.player.pos[1] - charm.pos[1]) <= PICKUP_HEIGHT_TOLERANCE
        ) {
          charm.available = false;
          charm.respawnTicks = CHARM_RESPAWN_TICKS;
          this.player.charmTicks = CHARM_DURATION_TICKS;
          this.player.dashCdTicks = 0;
          events.push({
            type: 'event',
            tick: this.tick,
            name: 'charm_picked',
            data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS },
          });
        }
      }
    }

    // ── STEP 5: Interact with lanterns ──
    if (canInteractWorld && interactPressed && this.player.carried > 0) {
      let bestLantern: LanternEntity | null = null;
      let bestDist = Infinity;
      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        if (Math.abs(this.player.pos[1] - lantern.pos[1]) > INTERACT_HEIGHT_TOLERANCE) continue;
        const d = distXZ(this.player.pos, lantern.pos);
        if (d <= TUNING.interact_radius) {
          if (
            d < bestDist - 1e-9 ||
            (Math.abs(d - bestDist) <= 1e-9 && bestLantern && compareEntityId(lantern.id, bestLantern.id) < 0)
          ) {
            bestDist = d;
            bestLantern = lantern;
          }
        }
      }

      if (bestLantern) {
        const need = Math.max(0, TUNING.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, need);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
          this.score += amount * TUNING.score.per_mote;
          events.push({
            type: 'event',
            tick: this.tick,
            name: 'deposit',
            data: {
              lantern_id: bestLantern.id,
              amount,
              deposited: bestLantern.deposited,
            },
          });

          if (bestLantern.deposited >= TUNING.lantern_cost) {
            bestLantern.lit = true;
            this.score += TUNING.score.per_lantern;
            events.push({
              type: 'event',
              tick: this.tick,
              name: 'lantern_lit',
              data: { lantern_id: bestLantern.id },
            });

            // Mark shades currently inside this newly lit lantern's 6m safe zone for <=30-tick pushout
            for (const shade of this.shades) {
              if (distXZ(shade.pos, bestLantern.pos) < TUNING.safe_radius) {
                shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
              }
            }
          }
        }
      }
    }

    // ── STEP 6: Update safe zones ──
    for (const shade of this.shades) {
      if (shade.safePushTicks > 0) {
        let insideAny = false;
        for (const lantern of this.lanterns) {
          if (!lantern.lit) continue;
          const dx = shade.pos[0] - lantern.pos[0];
          const dz = shade.pos[2] - lantern.pos[2];
          const d = Math.hypot(dx, dz);
          const targetEdge = TUNING.safe_radius + 0.02;
          if (d < targetEdge) {
            insideAny = true;
            const ux = d > 1e-6 ? dx / d : 1;
            const uz = d > 1e-6 ? dz / d : 0;
            const remaining = targetEdge - d;
            const stepLen = Math.min(remaining, Math.max(remaining / shade.safePushTicks, targetEdge / SAFE_PUSH_MAX_TICKS));
            const nextX = shade.pos[0] + ux * stepLen;
            const nextZ = shade.pos[2] + uz * stepLen;
            const pushed = this.map.resolveMove(shade.pos, nextX, nextZ, false);
            shade.pos[0] = pushed.x;
            shade.pos[2] = pushed.z;
            const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
            if (sy !== null) shade.pos[1] = sy;
          }
        }
        if (!insideAny) {
          shade.safePushTicks = 0;
        }
      } else {
        this.blockShadeOutsideSafeZones(shade);
      }
    }

    // ── STEP 7: Pulse (Tỏa Sáng) ──
    if (
      canInteractWorld &&
      pulsePressed &&
      this.player.pulseCdTicks === 0 &&
      this.player.carried >= TUNING.pulse_cost
    ) {
      this.player.carried -= TUNING.pulse_cost;
      this.player.pulseCdTicks = PULSE_COOLDOWN_TICKS;

      const pulseCenter: Vec3 = [
        this.player.pos[0],
        this.player.pos[1] + PULSE_CENTER_Y_OFFSET,
        this.player.pos[2],
      ];

      const stunnedIds: string[] = [];
      const sortedShades = [...this.shades].sort((a, b) => compareEntityId(a.id, b.id));
      for (const shade of sortedShades) {
        if (shade.state === 'spawning') continue;
        if (dist3D(pulseCenter, shade.pos) <= TUNING.pulse_radius) {
          const dx = shade.pos[0] - this.player.pos[0];
          const dz = shade.pos[2] - this.player.pos[2];
          const dXZ = Math.hypot(dx, dz);
          const ux = dXZ > 1e-6 ? dx / dXZ : 1;
          const uz = dXZ > 1e-6 ? dz / dXZ : 0;

          shade.state = 'stunned';
          shade.stateTicksLeft = PULSE_STUN_TICKS;
          shade.knockbackTicks = PULSE_KNOCKBACK_TICKS;
          shade.knockbackDir = [ux, uz];
          stunnedIds.push(shade.id);
          this.score += TUNING.score.per_stun;
        }
      }

      events.push({
        type: 'event',
        tick: this.tick,
        name: 'pulse',
        data: { stunned_ids: stunnedIds },
      });

      // Pulse effect on Drifters (emit drifter_drop after pulse for causal order)
      const sortedDrifters = [...this.drifters].sort((a, b) => compareEntityId(a.id, b.id));
      for (const drifter of sortedDrifters) {
        if (drifter.state === 'removed') continue;
        if (dist3D(pulseCenter, drifter.pos) <= TUNING.pulse_radius) {
          if (drifter.state === 'chase') {
            drifter.state = 'flee';
            drifter.fleeTicks = DRIFTER_FLEE_TICKS;
          } else if (drifter.state === 'flee' && drifter.stolen > 0) {
            const dropAmt = drifter.stolen;
            const groundY = this.map.getSurfaceY(drifter.pos[0], drifter.pos[2]) ?? 0;
            for (let i = 0; i < dropAmt; i++) {
              this.motes.push({
                id: this.allocMoteId(),
                pos: [round3(drifter.pos[0]), groundY, round3(drifter.pos[2])],
                kind: 'dropped',
                ttlTicks: DROPPED_MOTE_TTL_TICKS,
                pickableFromTick: this.simTick + 1,
              });
            }
            drifter.stolen = 0;
            drifter.fleeTicks = DRIFTER_DROP_FLEE_TICKS;
            events.push({
              type: 'event',
              tick: this.tick,
              name: 'drifter_drop',
              data: { drifter_id: drifter.id, amount: dropAmt },
            });
          }
        }
      }
    }

    // ── STEP 8: Move Shades and Drifters ──
    for (const shade of this.shades) {
      if (shade.safePushTicks > 0) continue;

      if (shade.state === 'stunned') {
        if (shade.knockbackTicks > 0) {
          const stepDist = TUNING.pulse_push_m / PULSE_KNOCKBACK_TICKS;
          const nextX = shade.pos[0] + shade.knockbackDir[0] * stepDist;
          const nextZ = shade.pos[2] + shade.knockbackDir[1] * stepDist;
          const moved = this.map.resolveMove(shade.pos, nextX, nextZ, false);
          shade.pos[0] = moved.x;
          shade.pos[2] = moved.z;
          const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
          if (sy !== null) shade.pos[1] = sy;
          if (moved.blocked) {
            shade.knockbackTicks = 0;
          } else {
            shade.knockbackTicks -= 1;
          }
          this.blockShadeOutsideSafeZones(shade);
        }
      } else if (shade.state === 'recoil') {
        const stepDist = SHADE_RECOIL_DISTANCE / SHADE_RECOIL_TICKS;
        const nextX = shade.pos[0] + shade.recoilDir[0] * stepDist;
        const nextZ = shade.pos[2] + shade.recoilDir[1] * stepDist;
        const moved = this.map.resolveMove(shade.pos, nextX, nextZ, false);
        shade.pos[0] = moved.x;
        shade.pos[2] = moved.z;
        const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
        if (sy !== null) shade.pos[1] = sy;
        this.blockShadeOutsideSafeZones(shade);

        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft <= 0) {
          shade.stateTicksLeft = 0;
          const d = distXZ(shade.pos, this.player.pos);
          shade.state = canInteractWorld && d <= SHADE_LEASH_RADIUS ? 'chase' : 'wander';
        }
        continue;
      } else if (shade.state === 'wander') {
        if (canInteractWorld && distXZ(shade.pos, this.player.pos) <= SHADE_DETECT_RADIUS) {
          shade.state = 'chase';
          shade.wanderTarget = null;
        } else {
          if (
            !shade.wanderTarget ||
            Math.hypot(shade.wanderTarget[0] - shade.pos[0], shade.wanderTarget[1] - shade.pos[2]) < 1.0
          ) {
            const pts = this.map.shadeSpawnPoints;
            const pick = pts[Math.floor(this.rng.next() * pts.length)];
            shade.wanderTarget = [pick[0], pick[2]];
          }
          const dx = shade.wanderTarget[0] - shade.pos[0];
          const dz = shade.wanderTarget[1] - shade.pos[2];
          const d = Math.hypot(dx, dz);
          if (d > 1e-6) {
            const stepDist = Math.min(d, SHADE_WANDER_SPEED * DT);
            const moved = this.map.resolveMove(
              shade.pos,
              shade.pos[0] + (dx / d) * stepDist,
              shade.pos[2] + (dz / d) * stepDist,
              false,
            );
            shade.pos[0] = moved.x;
            shade.pos[2] = moved.z;
            const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
            if (sy !== null) shade.pos[1] = sy;
            if (moved.blocked) shade.wanderTarget = null;
            this.blockShadeOutsideSafeZones(shade);
          }
        }
      }

      if (shade.state === 'chase') {
        const dPlayer = distXZ(shade.pos, this.player.pos);
        if (!canInteractWorld || dPlayer > SHADE_LEASH_RADIUS) {
          shade.state = 'wander';
        } else if (dPlayer > 1e-6) {
          const dx = this.player.pos[0] - shade.pos[0];
          const dz = this.player.pos[2] - shade.pos[2];
          const stepDist = Math.min(dPlayer, this.map.shadeSpeed * DT);
          const moved = this.map.resolveMove(
            shade.pos,
            shade.pos[0] + (dx / dPlayer) * stepDist,
            shade.pos[2] + (dz / dPlayer) * stepDist,
            false,
          );
          shade.pos[0] = moved.x;
          shade.pos[2] = moved.z;
          const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
          if (sy !== null) shade.pos[1] = sy;
          this.blockShadeOutsideSafeZones(shade);
        }
      }
    }

    // Move Drifters (Gió Lạc)
    for (const drifter of this.drifters) {
      if (drifter.state === 'removed') continue;

      if (drifter.state === 'idle') {
        if (
          canInteractWorld &&
          !drifter.hasStolen &&
          this.player.carried >= DRIFTER_DETECT_MIN_CARRIED &&
          distXZ(drifter.pos, this.player.pos) <= DRIFTER_DETECT_RADIUS
        ) {
          drifter.state = 'chase';
        } else {
          drifter.orbitAngle += 0.35 * DT;
          drifter.pos[0] += Math.cos(drifter.orbitAngle) * DRIFTER_IDLE_SPEED * DT;
          drifter.pos[2] += Math.sin(drifter.orbitAngle) * DRIFTER_IDLE_SPEED * DT;
        }
      }

      if (drifter.state === 'chase') {
        if (
          !canInteractWorld ||
          this.player.carried < DRIFTER_DETECT_MIN_CARRIED ||
          distXZ(drifter.pos, this.player.pos) > DRIFTER_DETECT_RADIUS
        ) {
          drifter.state = 'idle';
        } else {
          const dx = this.player.pos[0] - drifter.pos[0];
          const dz = this.player.pos[2] - drifter.pos[2];
          const d = Math.hypot(dx, dz);
          if (d > 1e-6) {
            const stepDist = Math.min(d, DRIFTER_SPEED * DT);
            drifter.pos[0] += (dx / d) * stepDist;
            drifter.pos[2] += (dz / d) * stepDist;
          }
          drifter.pos[1] = this.player.pos[1];
        }
      } else if (drifter.state === 'flee') {
        const dx = drifter.pos[0] - this.player.pos[0];
        const dz = drifter.pos[2] - this.player.pos[2];
        const d = Math.hypot(dx, dz);
        const ux = d > 1e-6 ? dx / d : 1;
        const uz = d > 1e-6 ? dz / d : 0;
        drifter.pos[0] += ux * DRIFTER_SPEED * DT;
        drifter.pos[2] += uz * DRIFTER_SPEED * DT;
      }
    }

    // ── STEP 9: Collisions — Drifter steal FIRST, then Shade hit (ascending id order) ──
    if (canInteractWorld) {
      const sortedDrifters = [...this.drifters].sort((a, b) => compareEntityId(a.id, b.id));
      for (const drifter of sortedDrifters) {
        if (
          drifter.state === 'chase' &&
          !drifter.hasStolen &&
          distXZ(drifter.pos, this.player.pos) <= DRIFTER_STEAL_RADIUS
        ) {
          const amount = Math.min(DRIFTER_MAX_STEAL, this.player.carried);
          if (amount > 0) {
            this.player.carried -= amount;
            drifter.stolen = amount;
            drifter.hasStolen = true;
            drifter.state = 'flee';
            drifter.fleeTicks = DRIFTER_FLEE_TICKS;
            events.push({
              type: 'event',
              tick: this.tick,
              name: 'drifter_steal',
              data: { drifter_id: drifter.id, amount, carried: this.player.carried },
            });
          }
        }
      }

      // Shade hit (max 1 per tick; ignored while invuln or shade not active/pushing)
      if (this.player.invulnTicks === 0) {
        const sortedShades = [...this.shades].sort((a, b) => compareEntityId(a.id, b.id));
        const hitter = sortedShades.find(
          (s) =>
            (s.state === 'chase' || s.state === 'wander') &&
            s.safePushTicks === 0 &&
            distXZ(s.pos, this.player.pos) <= TUNING.shade_hit_radius &&
            Math.abs(s.pos[1] - this.player.pos[1]) <= SHADE_HIT_HEIGHT_TOLERANCE,
        );

        if (hitter) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          const dropped = Math.floor(this.player.carried * TUNING.hit_drop_ratio);
          this.player.carried -= dropped;
          this.player.invulnTicks = INVULN_TICKS;

          // Spawn dropped motes on 1.5–2.5m ring around Mây (pickable from next tick)
          for (let i = 0; i < dropped; i++) {
            const dropPos = this.findDropPosition(this.player.pos);
            this.motes.push({
              id: this.allocMoteId(),
              pos: dropPos,
              kind: 'dropped',
              ttlTicks: DROPPED_MOTE_TTL_TICKS,
              pickableFromTick: this.simTick + 1,
            });
          }

          // Hitting shade recoils 2m over 60 ticks
          const rdx = hitter.pos[0] - this.player.pos[0];
          const rdz = hitter.pos[2] - this.player.pos[2];
          const rd = Math.hypot(rdx, rdz);
          hitter.state = 'recoil';
          hitter.stateTicksLeft = SHADE_RECOIL_TICKS;
          hitter.recoilDir = rd > 1e-6 ? [rdx / rd, rdz / rd] : [1, 0];

          events.push({
            type: 'event',
            tick: this.tick,
            name: 'player_hit',
            data: { by: 'shade', flames: this.player.flames, dropped },
          });
        }
      }
    }

    // ── STEP 10: Scheduled spawns (interactable from next tick) ──
    if (
      this.randomMotes &&
      this.simTick > 0 &&
      this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
      this.motes.length < MAX_MOTE_COUNT
    ) {
      this.spawnOneRandomMote(this.simTick + 1);
    }

    if (this.randomShades) {
      let spawnCount = 0;
      if (this.simTick === SHADE_SPAWN_DELAY_TICKS) {
        spawnCount = 2;
      } else if (
        this.simTick > SHADE_SPAWN_DELAY_TICKS &&
        (this.simTick - SHADE_SPAWN_DELAY_TICKS) % this.map.shadeSpawnIntervalTicks === 0
      ) {
        spawnCount = 1;
      }

      for (let i = 0; i < spawnCount && this.shades.length < this.map.maxShades; i++) {
        const spawned = this.spawnOneRandomShade();
        if (spawned) {
          events.push({
            type: 'event',
            tick: this.tick,
            name: 'shade_spawned',
            data: { id: spawned.id },
          });
        }
      }
    }

    if (
      this.randomDrifters &&
      this.simTick > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0 &&
      this.drifters.length < DRIFTER_MAX_COUNT
    ) {
      this.spawnOneRandomDrifter();
    }

    // ── STEP 11: Evaluate win/loss (no_flames > all_lit > dawn) ──
    this.evaluateWinLoss(events);

    return events;
  }

  private evaluateWinLoss(events: SimEvent[]): void {
    if (this.player.flames <= 0) {
      this.state = 'lost';
      this.gameOverReason = 'no_flames';
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'no_flames' },
      });
      return;
    }

    if (this.lanterns.every((l) => l.lit)) {
      this.state = 'won';
      this.gameOverReason = 'all_lit';
      const timeBonus = Math.floor(this.getTimeLeftS()) * TUNING.score.per_second_left;
      const flameBonus = this.player.flames * TUNING.score.per_flame_left;
      this.score += timeBonus + flameBonus;
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'won', reason: 'all_lit' },
      });
      return;
    }

    if (this.simTick >= this.totalDurationTicks) {
      this.state = 'lost';
      this.gameOverReason = 'dawn';
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'dawn' },
      });
    }
  }

  private blockShadeOutsideSafeZones(shade: ShadeEntity): void {
    const minDist = TUNING.safe_radius + 0.02;
    for (let pass = 0; pass < 3; pass++) {
      let pushed = false;
      for (const lantern of this.lanterns) {
        if (!lantern.lit) continue;
        const dx = shade.pos[0] - lantern.pos[0];
        const dz = shade.pos[2] - lantern.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < minDist) {
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          const nextX = lantern.pos[0] + ux * minDist;
          const nextZ = lantern.pos[2] + uz * minDist;
          const clamped = this.map.resolveMove(shade.pos, nextX, nextZ, false);
          shade.pos[0] = clamped.x;
          shade.pos[2] = clamped.z;
          const sy = this.map.getSurfaceY(shade.pos[0], shade.pos[2]);
          if (sy !== null) shade.pos[1] = sy;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  private findDropPosition(origin: Vec3): Vec3 {
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(1.5, 2.5);
      const x = round3(origin[0] + Math.cos(angle) * radius);
      const z = round3(origin[2] + Math.sin(angle) * radius);
      const sy = this.map.getSurfaceY(x, z);
      if (sy !== null && !this.map.isObstacle(x, z, sy) && Math.abs(sy - origin[1]) <= 1.5) {
        return [x, sy, z];
      }
    }
    const baseY = this.map.getSurfaceY(origin[0], origin[2]) ?? origin[1];
    return [round3(origin[0]), baseY, round3(origin[2])];
  }

  private syncPrevInput(input: InputState): void {
    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
      dash: input.dash,
      pause: input.pause,
    };
  }

  private allocMoteId(): string {
    while (this.usedMoteIds.has(`M${this.nextMoteSeq}`)) {
      this.nextMoteSeq += 1;
    }
    const id = `M${this.nextMoteSeq}`;
    this.usedMoteIds.add(id);
    this.nextMoteSeq += 1;
    return id;
  }

  private allocShadeId(): string {
    while (this.usedShadeIds.has(`S${this.nextShadeSeq}`)) {
      this.nextShadeSeq += 1;
    }
    const id = `S${this.nextShadeSeq}`;
    this.usedShadeIds.add(id);
    this.nextShadeSeq += 1;
    return id;
  }

  private allocDrifterId(): string {
    while (this.usedDrifterIds.has(`D${this.nextDrifterSeq}`)) {
      this.nextDrifterSeq += 1;
    }
    const id = `D${this.nextDrifterSeq}`;
    this.usedDrifterIds.add(id);
    this.nextDrifterSeq += 1;
    return id;
  }

  private getFreeMoteSpawnPoints(): Vec3[] {
    return this.map.moteSpawnPoints.filter(
      (pt) =>
        !this.motes.some(
          (m) => distXZ(m.pos, pt) < 0.35 && Math.abs(m.pos[1] - pt[1]) < 0.5,
        ),
    );
  }

  private spawnInitialRandomMotes(): void {
    const pool = [...this.map.moteSpawnPoints];
    const count = Math.min(INITIAL_MOTE_COUNT, pool.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.rng.next() * pool.length);
      const [pt] = pool.splice(idx, 1);
      this.motes.push({
        id: this.allocMoteId(),
        pos: [pt[0], pt[1], pt[2]],
        kind: 'random',
        ttlTicks: null,
        pickableFromTick: 0,
      });
    }
  }

  private spawnOneRandomMote(pickableFromTick: number): void {
    const free = this.getFreeMoteSpawnPoints();
    if (free.length === 0) return;
    const pt = free[Math.floor(this.rng.next() * free.length)];
    this.motes.push({
      id: this.allocMoteId(),
      pos: [pt[0], pt[1], pt[2]],
      kind: 'random',
      ttlTicks: null,
      pickableFromTick,
    });
  }

  private spawnOneRandomShade(): ShadeEntity | null {
    const valid = this.map.shadeSpawnPoints.filter(
      (pt) =>
        distXZ(pt, this.player.pos) >= SHADE_MIN_SPAWN_PLAYER_DIST &&
        !this.lanterns.some((l) => l.lit && distXZ(pt, l.pos) <= TUNING.safe_radius) &&
        !this.shades.some((s) => distXZ(s.pos, pt) < 1.0),
    );
    if (valid.length === 0) return null;
    const pt = valid[Math.floor(this.rng.next() * valid.length)];
    const shade: ShadeEntity = {
      id: this.allocShadeId(),
      pos: [pt[0], pt[1], pt[2]],
      state: 'spawning',
      stateTicksLeft: SHADE_SPAWNING_STATE_TICKS,
      knockbackTicks: 0,
      knockbackDir: [1, 0],
      recoilDir: [1, 0],
      safePushTicks: 0,
      wanderTarget: null,
    };
    this.shades.push(shade);
    return shade;
  }

  private spawnOneRandomDrifter(): DrifterEntity | null {
    const valid = this.map.shadeSpawnPoints.filter(
      (pt) => distXZ(pt, this.player.pos) >= SHADE_MIN_SPAWN_PLAYER_DIST,
    );
    const pool = valid.length > 0 ? valid : this.map.shadeSpawnPoints;
    if (pool.length === 0) return null;
    const pt = pool[Math.floor(this.rng.next() * pool.length)];
    const drifter: DrifterEntity = {
      id: this.allocDrifterId(),
      pos: [pt[0], pt[1], pt[2]],
      state: 'idle',
      stolen: 0,
      hasStolen: false,
      fleeTicks: 0,
      orbitAngle: this.rng.range(0, Math.PI * 2),
    };
    this.drifters.push(drifter);
    return drifter;
  }
}
