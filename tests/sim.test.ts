import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDefaultInput,
  distXZ,
  LanternIslandSim,
  TICK_RATE,
  TUNING,
} from '../src/sim/index.js';
import {
  ContractFormatError,
  validateInputsFile,
  validateScenarioConfig,
} from '../src/headless/validation.js';

describe('Test Contract v1.0 & Core Simulation', () => {
  it('keeps src/sim/tuning.ts 100% synchronized with game.contract.json', () => {
    const raw = readFileSync(resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.0');
    expect(contract.tuning).toEqual(TUNING);
  });

  it('moves accurately along XZ with camera yaw rotation and diagonal normalization', () => {
    const sim = new LanternIslandSim({
      seed: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    // Move +Z at yaw 0 for 120 ticks (2.0s * 6 m/s = 12m)
    const input = createDefaultInput();
    input.move = [0, 1];
    input.cam_yaw_deg = 0;
    for (let i = 0; i < 120; i++) sim.step(input);
    expect(sim.getSnapshot().player.pos).toEqual([0, 0, 12]);

    // Move forward at yaw 90 deg -> x' = z*sin(90) = 1, z' = z*cos(90) = 0 -> +X for 60 ticks (+6m)
    input.cam_yaw_deg = 90;
    for (let i = 0; i < 60; i++) sim.step(input);
    expect(sim.getSnapshot().player.pos).toEqual([6, 0, 12]);

    // Diagonal [1, 1] normalized to length 1 -> moves exactly 6m in 60 ticks
    const startPos = [...sim.player.pos] as [number, number, number];
    input.cam_yaw_deg = 0;
    input.move = [1, 1];
    for (let i = 0; i < 60; i++) sim.step(input);
    expect(distXZ(startPos, sim.player.pos)).toBeCloseTo(6, 3);
  });

  it('handles jump on rising edge only and lands back at y = 0', () => {
    const sim = new LanternIslandSim({
      seed: 2,
      scenario: { random_motes: false, random_shades: false },
    });

    const input = createDefaultInput();
    input.jump = true;
    sim.step(input);
    expect(sim.player.pos[1]).toBeGreaterThan(0);

    let maxY = sim.player.pos[1];
    // Hold jump true until landed; should not auto-rejump while held
    for (let i = 0; i < 80; i++) {
      sim.step(input);
      maxY = Math.max(maxY, sim.player.pos[1]);
    }
    expect(maxY).toBeGreaterThan(1.0);
    expect(sim.player.pos[1]).toBe(0);
  });

  it('picks up motes within pickup_radius up to carry_capacity', () => {
    const sim = new LanternIslandSim({
      seed: 3,
      scenario: {
        random_motes: false,
        random_shades: false,
        motes: [
          [0, 0, 1.6], // boundary <= pickup_radius
          [0, 0, 1.61], // outside initially
          [0, 0, 0.5],
          [0, 0, 0.6],
          [0, 0, 0.7],
          [0, 0, 0.8],
          [0, 0, 0.9], // 6th mote exceeds carry_capacity 5
        ],
      },
    });

    const events = sim.step(createDefaultInput());
    const picked = events.filter((e) => e.name === 'mote_picked');
    expect(picked).toHaveLength(5);
    expect(sim.player.carried).toBe(TUNING.carry_capacity);
    expect(sim.score).toBe(5 * TUNING.score.per_mote);
    expect(sim.motes).toHaveLength(2);
  });

  it('supports partial deposit, lighting a lantern, and winning on all 5 lit without setup score', () => {
    const sim = new LanternIslandSim({
      seed: 4,
      scenario: {
        player: { pos: [0, 0, 23], carried: 2, flames: 3 },
        random_motes: false,
        random_shades: false,
        motes: [
          [0, 0, 23],
          [0, 0, 23],
          [0, 0, 23],
        ],
        lanterns: [
          { id: 'L1', lit: true },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', pos: [0, 0, 25], deposited: 0, lit: false },
        ],
        time_left_s: 100,
      },
    });

    // Setup emits no events and grants 0 score
    expect(sim.score).toBe(0);
    expect(sim.tick).toBe(0);

    // Tick 1: picks up 3 motes -> carried 5, then deposits 4 into L5 (within interact_radius 2.6) -> lights L5 & wins!
    const input = createDefaultInput();
    input.interact = true;
    const events = sim.step(input);

    expect(events.map((e) => e.name)).toEqual([
      'mote_picked',
      'mote_picked',
      'mote_picked',
      'deposit',
      'lantern_lit',
      'game_over',
    ]);
    expect(sim.state).toBe('won');
    expect(sim.player.carried).toBe(1);
    const expectedTimeBonus = Math.floor(sim.getTimeLeftS()) * TUNING.score.per_second_left;
    const expectedFlameBonus = 3 * TUNING.score.per_flame_left;
    expect(sim.score).toBe(
      3 * TUNING.score.per_mote + TUNING.score.per_lantern + expectedTimeBonus + expectedFlameBonus,
    );
  });

  it('pushes and stuns shades on pulse and respects pulse cooldown', () => {
    const sim = new LanternIslandSim({
      seed: 5,
      scenario: {
        player: { pos: [0, 0, 0], carried: 2, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [5, 0, 0] }],
      },
    });

    const input = createDefaultInput();
    input.pulse = true;
    const ev1 = sim.step(input);
    const pulseEv = ev1.find((e) => e.name === 'pulse');
    expect(pulseEv).toBeDefined();
    expect(pulseEv?.data).toEqual({ stunned_ids: ['S1'] });
    expect(sim.player.carried).toBe(1);
    expect(sim.shades[0].state).toBe('stunned');
    expect(sim.shades[0].pos[0]).toBeCloseTo(11, 2); // 5 + 6 push
    expect(sim.score).toBe(TUNING.score.per_stun);

    // Release and press pulse again while on cooldown -> ignored
    input.pulse = false;
    sim.step(input);
    input.pulse = true;
    const ev2 = sim.step(input);
    expect(ev2.find((e) => e.name === 'pulse')).toBeUndefined();
    expect(sim.player.carried).toBe(1);

    // Advance until stun expires (180 ticks total from tick 1 -> tick 181 resumes chase)
    input.pulse = false;
    for (let i = 0; i < 177; i++) sim.step(input);
    expect(sim.shades[0].state).toBe('stunned');
    sim.step(input);
    expect(sim.shades[0].state).toBe('chase');
  });

  it('keeps shades strictly outside lit lantern safe_radius', () => {
    const sim = new LanternIslandSim({
      seed: 6,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        shades: [{ id: 'S1', pos: [10, 0, 0] }],
      },
    });

    for (let i = 0; i < 300; i++) {
      const evs = sim.step(createDefaultInput());
      expect(evs.find((e) => e.name === 'player_hit')).toBeUndefined();
      expect(distXZ(sim.shades[0].pos, [0, 0, 0])).toBeGreaterThan(TUNING.safe_radius);
    }
    expect(sim.player.flames).toBe(3);
  });

  it('applies shade hit, mote drop, invulnerability window, and no_flames loss', () => {
    const sim = new LanternIslandSim({
      seed: 7,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [1.0, 0, 0] }],
      },
    });

    // Tick 1: first hit
    const ev1 = sim.step(createDefaultInput());
    const hit1 = ev1.find((e) => e.name === 'player_hit');
    expect(hit1?.data).toEqual({ by: 'shade', flames: 1, dropped: 2 });
    expect(sim.player.carried).toBe(2);

    // During invuln_s (90 ticks total: ticks 2..90) no second hit
    for (let i = 0; i < 89; i++) {
      const ev = sim.step(createDefaultInput());
      expect(ev.find((e) => e.name === 'player_hit')).toBeUndefined();
    }

    // Tick 91: invuln ends -> second hit -> game over no_flames
    const evFinal = sim.step(createDefaultInput());
    expect(evFinal.find((e) => e.name === 'player_hit')?.data).toEqual({
      by: 'shade',
      flames: 0,
      dropped: 1,
    });
    expect(evFinal.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'no_flames',
    });
    expect(sim.state).toBe('lost');
  });

  it('ends with dawn loss when time_left_s reaches 0', () => {
    const sim = new LanternIslandSim({
      seed: 8,
      scenario: {
        random_motes: false,
        random_shades: false,
        time_left_s: 1,
      },
    });

    for (let i = 0; i < TICK_RATE - 1; i++) {
      sim.step(createDefaultInput());
      expect(sim.state).toBe('playing');
    }
    const lastEvents = sim.step(createDefaultInput());
    expect(sim.state).toBe('lost');
    expect(lastEvents.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'dawn',
    });
  });

  it('is 100% deterministic across runs with identical seed', () => {
    const run = () => {
      const sim = new LanternIslandSim({ seed: 2026 });
      const out: string[] = [JSON.stringify(sim.getSnapshot())];
      const input = createDefaultInput();
      input.move = [0.5, 0.5];
      for (let i = 0; i < 300; i++) {
        const evs = sim.step(input);
        for (const e of evs) out.push(JSON.stringify(e));
        if ((i + 1) % 30 === 0) out.push(JSON.stringify(sim.getSnapshot()));
      }
      out.push(JSON.stringify(sim.getEndRecord()));
      return out.join('\n');
    };
    expect(run()).toBe(run());
  });

  it('rejects malformed inputs and scenarios with ContractFormatError', () => {
    expect(() =>
      validateInputsFile({
        frames: [
          { tick: 10, move: [0, 1] },
          { tick: 10, move: [0, 0] },
        ],
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateInputsFile({
        frames: [{ tick: 0, move: [2, 0] }],
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({
        time_left_s: -5,
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({
        shades: [{ id: '', pos: [1, 0, 0] }],
      }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({
        shades: [
          { id: 'S1', pos: [1, 0, 0] },
          { id: 'S1', pos: [5, 0, 0] },
        ],
      }),
    ).toThrow(ContractFormatError);
  });

  it('clamps player to visual island boundary in normal Night 1 gameplay', () => {
    const sim = new LanternIslandSim({ seed: 42 });
    const input = createDefaultInput();
    input.move = [0, 1];
    for (let i = 0; i < 600; i++) {
      sim.step(input);
    }
    const r = Math.hypot(sim.player.pos[0], sim.player.pos[2]);
    expect(r).toBeLessThanOrEqual(37.501);
  });

  it('handles terminal scenario setups and fractional time_left_s cleanly', () => {
    // Pre-filled deposited >= lantern_cost marks lantern lit without setup score
    const simAllLit = new LanternIslandSim({
      seed: 10,
      scenario: {
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', deposited: 4 },
        ],
        time_left_s: 10,
      },
    });
    expect(simAllLit.score).toBe(0);
    expect(simAllLit.lanterns.every((l) => l.lit)).toBe(true);
    const winEvs = simAllLit.step(createDefaultInput());
    expect(simAllLit.state).toBe('won');
    expect(winEvs.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'won',
      reason: 'all_lit',
    });

    // flames: 0 resolves on tick 1
    const simNoFlames = new LanternIslandSim({
      seed: 11,
      scenario: { player: { flames: 0 }, random_motes: false, random_shades: false },
    });
    const loseEvs = simNoFlames.step(createDefaultInput());
    expect(simNoFlames.state).toBe('lost');
    expect(loseEvs.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'no_flames',
    });

    // Fractional time_left_s = 2.02 -> 121.2 ticks -> still playing at tick 121, dawn at tick 122
    const simFrac = new LanternIslandSim({
      seed: 12,
      scenario: { random_motes: false, random_shades: false, time_left_s: 2.02 },
    });
    for (let i = 0; i < 121; i++) simFrac.step(createDefaultInput());
    expect(simFrac.state).toBe('playing');
    expect(simFrac.getTimeLeftS()).toBeGreaterThan(0);
    simFrac.step(createDefaultInput());
    expect(simFrac.state).toBe('lost');
    expect(simFrac.getTimeLeftS()).toBe(0);
  });

  it('spawns periodic shades in Night 1 and supports pulse with 0 or multiple shades', () => {
    const simMulti = new LanternIslandSim({
      seed: 13,
      scenario: {
        player: { pos: [0, 0, 0], carried: 3, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [
          { id: 'S1', pos: [4, 0, 0] },
          { id: 'S2', pos: [-5, 0, 0] },
          { id: 'S3', pos: [15, 0, 0] },
        ],
      },
    });
    const input = createDefaultInput();
    input.pulse = true;
    const evs = simMulti.step(input);
    expect(evs.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1', 'S2'] });
    expect(simMulti.score).toBe(2 * TUNING.score.per_stun);

    // Periodic shade_spawned fires at tick 2100 when random_shades is active
    const simSpawn = new LanternIslandSim({
      seed: 14,
      scenario: {
        player: { pos: [0, 0, 0], flames: 99 },
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        random_motes: false,
        random_shades: true,
        shades: [],
      },
    });
    let spawnedId: string | null = null;
    for (let i = 0; i < 2100; i++) {
      const stepEvs = simSpawn.step(createDefaultInput());
      const sp = stepEvs.find((e) => e.name === 'shade_spawned');
      if (sp) spawnedId = sp.data.id;
    }
    expect(spawnedId).toBe('S1');
  });
});
