import { SeededRng } from './prng.js';
import {
  DT,
  GRAVITY,
  INITIAL_MOTE_COUNT,
  INITIAL_SHADE_COUNT,
  ISLAND_RADIUS,
  JUMP_VELOCITY,
  LANTERN_RING_RADIUS,
  MAX_RANDOM_SHADES,
  MOTE_RESPAWN_TICKS,
  SHADE_SPAWN_TICKS,
  TICK_RATE,
  TUNING,
} from './tuning.js';
import type {
  EndRecord,
  GameOverReason,
  GameState,
  InputState,
  LanternEntity,
  MoteEntity,
  PlayerEntity,
  ScenarioConfig,
  ShadeEntity,
  SimEvent,
  SnapshotRecord,
  Vec3,
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

export function createDefaultInput(): InputState {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
  };
}

export interface SimOptions {
  seed: number;
  night?: number;
  scenario?: ScenarioConfig;
}

export class LanternIslandSim {
  readonly seed: number;
  readonly night: number;

  tick = 0;
  simTick = 0;
  state: GameState = 'playing';
  gameOverReason: GameOverReason | null = null;
  score = 0;

  player: PlayerEntity;
  lanterns: LanternEntity[];
  shades: ShadeEntity[] = [];
  motes: MoteEntity[] = [];

  private rng: SeededRng;
  private initialTimeLeftS: number;
  private totalDurationTicks: number;
  private randomMotes: boolean;
  private randomShades: boolean;
  private playableRadius: number;

  private prevInput: InputState = createDefaultInput();
  private nextMoteSeq = 1;
  private nextShadeSeq = 1;
  private usedShadeIds = new Set<string>();
  private moteRespawnCounter = 0;
  private shadeSpawnCounter = 0;

  constructor(options: SimOptions) {
    this.seed = options.seed;
    this.night = options.night ?? 1;
    this.rng = new SeededRng(this.seed);

    const scenario = options.scenario;

    this.initialTimeLeftS = scenario?.time_left_s ?? TUNING.night1_duration_s;
    this.totalDurationTicks = Math.max(0, Math.ceil(this.initialTimeLeftS * TICK_RATE - 1e-9));
    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;

    // 1. Initialize 5 default lanterns on a circle
    this.lanterns = [];
    for (let i = 0; i < TUNING.lantern_count_night1; i++) {
      const angle = (i * 2 * Math.PI) / TUNING.lantern_count_night1;
      const x = round3(Math.cos(angle) * LANTERN_RING_RADIUS);
      const z = round3(Math.sin(angle) * LANTERN_RING_RADIUS);
      this.lanterns.push({
        id: `L${i + 1}`,
        pos: [x, 0, z],
        lit: false,
        deposited: 0,
      });
    }

    // Apply scenario lantern overrides (no events, no score during setup)
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
    this.player = {
      pos: scenario?.player?.pos
        ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
        : [0, 0, 0],
      vy: 0,
      yawRad: 0,
      flames: scenario?.player?.flames ?? TUNING.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
    };

    // 3. Initialize motes
    if (scenario?.motes !== undefined) {
      for (const p of scenario.motes) {
        this.motes.push({
          id: this.allocMoteId(),
          pos: [p[0], p[1], p[2]],
        });
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_MOTE_COUNT; i++) {
        this.motes.push(this.spawnRandomMote());
      }
    }

    // 4. Initialize shades
    if (scenario?.shades !== undefined) {
      for (const s of scenario.shades) {
        if (s.id) this.usedShadeIds.add(s.id);
      }
      for (const s of scenario.shades) {
        this.shades.push({
          id: s.id ?? this.allocShadeId(),
          pos: [s.pos[0], s.pos[1], s.pos[2]],
          state: 'chase',
          stunTicks: 0,
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_SHADE_COUNT; i++) {
        this.shades.push(this.spawnRandomShade());
      }
    }

    // 5. Compute playable boundary (fixed to visual island in normal play; expands for distant scenario entities)
    if (scenario) {
      let maxDist = Math.hypot(this.player.pos[0], this.player.pos[2]);
      for (const l of this.lanterns) {
        maxDist = Math.max(maxDist, Math.hypot(l.pos[0], l.pos[2]));
      }
      for (const m of this.motes) {
        maxDist = Math.max(maxDist, Math.hypot(m.pos[0], m.pos[2]));
      }
      for (const s of this.shades) {
        maxDist = Math.max(maxDist, Math.hypot(s.pos[0], s.pos[2]));
      }
      this.playableRadius = Math.max(ISLAND_RADIUS - 0.5, maxDist + 10);
    } else {
      this.playableRadius = ISLAND_RADIUS - 0.5;
    }
  }

  getTimeLeftS(): number {
    return Math.max(0, round3(this.initialTimeLeftS - this.tick / TICK_RATE));
  }

  getSnapshot(): SnapshotRecord {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: this.getTimeLeftS(),
      score: this.score,
      player: {
        pos: roundVec3(this.player.pos),
        flames: this.player.flames,
        carried: this.player.carried,
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
    if (this.state !== 'playing') {
      return [];
    }

    const events: SimEvent[] = [];
    this.tick += 1;
    this.simTick += 1;

    // 0. Guard pre-existing terminal states from scenario setup (no events on tick 0, resolve cleanly on tick 1)
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
      return events;
    }
    if (this.player.flames <= 0) {
      this.state = 'lost';
      this.gameOverReason = 'no_flames';
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'no_flames' },
      });
      return events;
    }
    if (this.initialTimeLeftS <= 0) {
      this.state = 'lost';
      this.gameOverReason = 'dawn';
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'dawn' },
      });
      return events;
    }

    // 1. Decrement active cooldowns/timers at start of tick
    if (this.player.invulnTicks > 0) {
      this.player.invulnTicks -= 1;
    }
    if (this.player.pulseCooldownTicks > 0) {
      this.player.pulseCooldownTicks -= 1;
    }
    for (const shade of this.shades) {
      if (shade.state === 'stunned') {
        shade.stunTicks -= 1;
        if (shade.stunTicks <= 0) {
          shade.stunTicks = 0;
          shade.state = 'chase';
        }
      }
    }

    // 2. Detect rising edges on boolean actions
    const jumpPressed = input.jump && !this.prevInput.jump;
    const interactPressed = input.interact && !this.prevInput.interact;
    const pulsePressed = input.pulse && !this.prevInput.pulse;
    this.prevInput = {
      move: [input.move[0], input.move[1]],
      cam_yaw_deg: input.cam_yaw_deg,
      jump: input.jump,
      interact: input.interact,
      pulse: input.pulse,
    };

    // 3. Player horizontal & vertical movement
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

    this.player.pos[0] += wx * TUNING.player_speed * DT;
    this.player.pos[2] += wz * TUNING.player_speed * DT;
    if (Math.hypot(wx, wz) > 1e-6) {
      this.player.yawRad = Math.atan2(wx, wz);
    }
    this.clampToIsland(this.player.pos);

    if (jumpPressed && this.player.pos[1] <= 0) {
      this.player.vy = JUMP_VELOCITY;
    }
    if (this.player.pos[1] > 0 || this.player.vy > 0) {
      this.player.vy -= GRAVITY * DT;
      this.player.pos[1] += this.player.vy * DT;
      if (this.player.pos[1] <= 0) {
        this.player.pos[1] = 0;
        this.player.vy = 0;
      }
    }

    // 4. Mote pickups (XZ distance <= pickup_radius)
    if (this.player.carried < TUNING.carry_capacity && this.motes.length > 0) {
      const remaining: MoteEntity[] = [];
      for (const mote of this.motes) {
        if (
          this.player.carried < TUNING.carry_capacity &&
          distXZ(this.player.pos, mote.pos) <= TUNING.pickup_radius
        ) {
          this.player.carried += 1;
          this.score += TUNING.score.per_mote;
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

    // 5. Interact: deposit light into nearest unlit lantern within interact_radius
    if (interactPressed && this.player.carried > 0) {
      let bestLantern: LanternEntity | null = null;
      let bestDist = Infinity;
      for (const lantern of this.lanterns) {
        if (lantern.lit) continue;
        const d = distXZ(this.player.pos, lantern.pos);
        if (d <= TUNING.interact_radius && d < bestDist) {
          bestDist = d;
          bestLantern = lantern;
        }
      }

      if (bestLantern) {
        const need = Math.max(0, TUNING.lantern_cost - bestLantern.deposited);
        const amount = Math.min(this.player.carried, need);
        if (amount > 0) {
          this.player.carried -= amount;
          bestLantern.deposited += amount;
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

            // Immediately push any shades out of newly lit lantern's safe zone
            for (const shade of this.shades) {
              this.enforceSafeZones(shade.pos);
              this.clampToIsland(shade.pos);
            }

            // Check victory
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
              return events;
            }
          }
        }
      }
    }

    // 6. Pulse: spend light to push and stun shades within pulse_radius
    if (
      pulsePressed &&
      this.player.pulseCooldownTicks === 0 &&
      this.player.carried >= TUNING.pulse_cost
    ) {
      this.player.carried -= TUNING.pulse_cost;
      this.player.pulseCooldownTicks = Math.round(TUNING.pulse_cooldown_s * TICK_RATE);
      const stunTicks = Math.round(TUNING.pulse_stun_s * TICK_RATE);
      const stunnedIds: string[] = [];

      for (const shade of this.shades) {
        const d = distXZ(this.player.pos, shade.pos);
        if (d <= TUNING.pulse_radius) {
          const ux = d > 1e-6 ? (shade.pos[0] - this.player.pos[0]) / d : 1;
          const uz = d > 1e-6 ? (shade.pos[2] - this.player.pos[2]) / d : 0;
          shade.pos[0] += ux * TUNING.pulse_push_m;
          shade.pos[2] += uz * TUNING.pulse_push_m;
          this.enforceSafeZones(shade.pos);
          this.clampToIsland(shade.pos);

          shade.state = 'stunned';
          shade.stunTicks = stunTicks;
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
    }

    // 7. Update shades (chase player while respecting lit lantern safe zones)
    for (const shade of this.shades) {
      if (shade.state === 'chase') {
        const dx = this.player.pos[0] - shade.pos[0];
        const dz = this.player.pos[2] - shade.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) {
          const stepDist = Math.min(d, TUNING.shade_speed * DT);
          shade.pos[0] += (dx / d) * stepDist;
          shade.pos[2] += (dz / d) * stepDist;
        }
        this.enforceSafeZones(shade.pos);
        this.clampToIsland(shade.pos);
      }
    }

    // 8. Shade collision with player
    if (this.player.invulnTicks === 0) {
      const hittingShade = this.shades.find(
        (s) => s.state !== 'stunned' && distXZ(s.pos, this.player.pos) <= TUNING.shade_hit_radius,
      );
      if (hittingShade) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const dropped = Math.floor(this.player.carried * TUNING.hit_drop_ratio);
        this.player.carried -= dropped;
        this.player.invulnTicks = Math.round(TUNING.invuln_s * TICK_RATE);
        events.push({
          type: 'event',
          tick: this.tick,
          name: 'player_hit',
          data: {
            by: 'shade',
            flames: this.player.flames,
            dropped,
          },
        });

        if (this.player.flames <= 0) {
          this.state = 'lost';
          this.gameOverReason = 'no_flames';
          events.push({
            type: 'event',
            tick: this.tick,
            name: 'game_over',
            data: { result: 'lost', reason: 'no_flames' },
          });
          return events;
        }
      }
    }

    // 9. Periodic random spawning (disabled when scenario sets random_* = false)
    if (this.randomMotes && this.motes.length < INITIAL_MOTE_COUNT) {
      this.moteRespawnCounter += 1;
      if (this.moteRespawnCounter >= MOTE_RESPAWN_TICKS) {
        this.moteRespawnCounter = 0;
        this.motes.push(this.spawnRandomMote());
      }
    }

    if (this.randomShades && this.shades.length < MAX_RANDOM_SHADES) {
      this.shadeSpawnCounter += 1;
      if (this.shadeSpawnCounter >= SHADE_SPAWN_TICKS) {
        this.shadeSpawnCounter = 0;
        const newShade = this.spawnRandomShade();
        this.shades.push(newShade);
        events.push({
          type: 'event',
          tick: this.tick,
          name: 'shade_spawned',
          data: { id: newShade.id },
        });
      }
    }

    // 10. Check dawn timeout
    if (this.tick >= this.totalDurationTicks) {
      this.state = 'lost';
      this.gameOverReason = 'dawn';
      events.push({
        type: 'event',
        tick: this.tick,
        name: 'game_over',
        data: { result: 'lost', reason: 'dawn' },
      });
    }

    return events;
  }

  private clampToIsland(pos: Vec3): void {
    const r = Math.hypot(pos[0], pos[2]);
    if (r > this.playableRadius) {
      const scale = this.playableRadius / r;
      pos[0] *= scale;
      pos[2] *= scale;
    }
  }

  private enforceSafeZones(pos: Vec3): void {
    const minDist = TUNING.safe_radius + 0.02;
    for (let pass = 0; pass < 3; pass++) {
      let pushed = false;
      for (const lantern of this.lanterns) {
        if (!lantern.lit) continue;
        const dx = pos[0] - lantern.pos[0];
        const dz = pos[2] - lantern.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < minDist) {
          const ux = d > 1e-6 ? dx / d : 1;
          const uz = d > 1e-6 ? dz / d : 0;
          pos[0] = lantern.pos[0] + ux * minDist;
          pos[2] = lantern.pos[2] + uz * minDist;
          pushed = true;
        }
      }
      if (!pushed) break;
    }
  }

  private allocMoteId(): string {
    const id = `M${this.nextMoteSeq}`;
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

  private spawnRandomMote(): MoteEntity {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(this.rng.next()) * (ISLAND_RADIUS - 5) + 4;
      const clampedR = Math.min(radius, ISLAND_RADIUS - 3);
      const pos: Vec3 = [round3(Math.cos(angle) * clampedR), 0, round3(Math.sin(angle) * clampedR)];

      if (distXZ(pos, this.player.pos) < TUNING.pickup_radius + 2.0) continue;
      if (this.lanterns.some((l) => distXZ(pos, l.pos) < 2.0)) continue;
      return { id: this.allocMoteId(), pos };
    }
    const fallbackAngle = this.rng.range(0, Math.PI * 2);
    return {
      id: this.allocMoteId(),
      pos: [round3(Math.cos(fallbackAngle) * 14), 0, round3(Math.sin(fallbackAngle) * 14)],
    };
  }

  private spawnRandomShade(): ShadeEntity {
    for (let attempt = 0; attempt < 40; attempt++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(22, ISLAND_RADIUS - 4);
      const pos: Vec3 = [round3(Math.cos(angle) * radius), 0, round3(Math.sin(angle) * radius)];

      if (distXZ(pos, this.player.pos) < 18) continue;
      if (this.lanterns.some((l) => l.lit && distXZ(pos, l.pos) <= TUNING.safe_radius + 1)) {
        continue;
      }
      return {
        id: this.allocShadeId(),
        pos,
        state: 'chase',
        stunTicks: 0,
      };
    }
    const fallbackPos: Vec3 = [28, 0, 0];
    this.enforceSafeZones(fallbackPos);
    return {
      id: this.allocShadeId(),
      pos: fallbackPos,
      state: 'chase',
      stunTicks: 0,
    };
  }
}
