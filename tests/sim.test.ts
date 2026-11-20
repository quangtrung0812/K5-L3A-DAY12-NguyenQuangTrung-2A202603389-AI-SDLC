import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  createDefaultInput,
  DASH_COOLDOWN_TICKS,
  DASH_DURATION_TICKS,
  distXZ,
  DROPPED_MOTE_TTL_TICKS,
  FALL_RESPAWN_TICKS,
  INVULN_TICKS,
  LanternIslandSim,
  PULSE_STUN_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SHADE_RECOIL_TICKS,
  TUNING,
} from '../src/sim/index.js';
import {
  ContractFormatError,
  validateInputsFile,
  validateScenarioConfig,
} from '../src/headless/validation.js';

describe('Test Contract v1.1 — Standardized Core & Phase 1 Regression', () => {
  it('keeps src/sim/tuning.ts 100% synchronized with game.contract.json v1.1', () => {
    const raw = readFileSync(resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.1');
    expect(contract.tuning).toEqual(TUNING);
  });

  it('moves accurately along XZ with camera yaw rotation and diagonal normalization', () => {
    const sim = new LanternIslandSim({
      seed: 1,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    const input = createDefaultInput();
    input.move = [0, 1];
    input.cam_yaw_deg = 0;
    for (let i = 0; i < 120; i++) sim.step(input);
    expect(sim.getSnapshot().player.pos).toEqual([0, 0, 12]);

    input.cam_yaw_deg = 90;
    for (let i = 0; i < 60; i++) sim.step(input);
    expect(sim.getSnapshot().player.pos).toEqual([6, 0, 12]);

    const startPos = [...sim.player.pos] as [number, number, number];
    input.cam_yaw_deg = 0;
    input.move = [1, 1];
    for (let i = 0; i < 60; i++) sim.step(input);
    expect(distXZ(startPos, sim.player.pos)).toBeCloseTo(6, 3);
  });

  it('handles jump (7.0 m/s, g=-20) on rising edge only and lands at y = 0', () => {
    const sim = new LanternIslandSim({
      seed: 2,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    const input = createDefaultInput();
    input.jump = true;
    sim.step(input);
    expect(sim.player.pos[1]).toBeGreaterThan(0);
    expect(sim.player.grounded).toBe(false);

    let maxY = sim.player.pos[1];
    for (let i = 0; i < 70; i++) {
      sim.step(input);
      maxY = Math.max(maxY, sim.player.pos[1]);
    }
    // Peak height for v0=7, g=20 is ~1.225m
    expect(maxY).toBeGreaterThan(1.1);
    expect(maxY).toBeLessThan(1.3);
    expect(sim.player.pos[1]).toBe(0);
    expect(sim.player.grounded).toBe(true);
  });

  it('picks up motes within XZ <= 1.0m and |dy| <= 1.5m up to carry_capacity 10', () => {
    const motes: [number, number, number][] = [
      [0, 0, 1.0], // boundary <= 1.0
      [0, 0, 1.05], // outside XZ
      [0, 2.0, 0.2], // outside |dy| <= 1.5
    ];
    for (let i = 0; i < 11; i++) motes.push([0, 0, 0.2]);

    const sim = new LanternIslandSim({
      seed: 3,
      night: 1,
      scenario: { random_motes: false, random_shades: false, motes },
    });

    const events = sim.step(createDefaultInput());
    const picked = events.filter((e) => e.name === 'mote_picked');
    expect(picked).toHaveLength(10);
    expect(sim.player.carried).toBe(10);
    // Standardized Phase 2 scoring: +10 on deposit, NOT pickup
    expect(sim.score).toBe(0);
    expect(sim.motes).toHaveLength(4);
  });

  it('scores +10 per deposited mote, +100 per lit lantern, and wins on all lit with bonus', () => {
    const sim = new LanternIslandSim({
      seed: 4,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 23.5], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
        time_left_s: 100,
      },
    });

    expect(sim.score).toBe(0);
    const input = createDefaultInput();
    input.interact = true;
    const events = sim.step(input);

    expect(events.map((e) => e.name)).toEqual([
      'night_start',
      'deposit',
      'lantern_lit',
      'game_over',
    ]);
    expect(sim.state).toBe('won');
    // 10 * 10 (deposit) + 100 (lantern) + floor(99.983) * 2 (time) + 3 * 50 (flames) = 100 + 100 + 198 + 150 = 548
    expect(sim.score).toBe(548);
  });

  it('executes 3D pulse (cost 3, r=5m from y+0.8, 15-tick 4m push, 120-tick stun, +5 score even on re-stun)', () => {
    const sim = new LanternIslandSim({
      seed: 5,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [4.5, 0, 0], state: 'chase' }],
      },
    });

    const input = createDefaultInput();
    input.pulse = true;
    const ev1 = sim.step(input);
    expect(ev1.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(sim.player.carried).toBe(3);
    expect(sim.score).toBe(5);
    expect(sim.shades[0].state).toBe('stunned');

    // Run 14 more ticks (total 15 knockback ticks -> +4m from 4.5 to ~8.5)
    input.pulse = false;
    for (let i = 0; i < 14; i++) sim.step(input);
    expect(sim.shades[0].pos[0]).toBeCloseTo(8.5, 2);

    // Still stunned through tick 120, recovers at tick 121
    for (let i = 0; i < PULSE_STUN_TICKS - 15; i++) sim.step(input);
    expect(sim.shades[0].state).toBe('stunned');
    sim.step(input);
    expect(sim.shades[0].state).toBe('chase');
  });

  it('drops physical motes on shade hit, triggers shade recoil 60 ticks, and obeys invuln 90 ticks', () => {
    const sim = new LanternIslandSim({
      seed: 6,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 2 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [0.8, 0, 0], state: 'chase' }],
      },
    });

    const ev1 = sim.step(createDefaultInput());
    expect(ev1.find((e) => e.name === 'player_hit')?.data).toEqual({
      by: 'shade',
      flames: 1,
      dropped: 2,
    });
    expect(sim.player.carried).toBe(2);
    expect(sim.player.invulnTicks).toBe(INVULN_TICKS);
    expect(sim.shades[0].state).toBe('recoil');
    expect(sim.shades[0].stateTicksLeft).toBe(SHADE_RECOIL_TICKS);

    const droppedMotes = sim.motes.filter((m) => m.kind === 'dropped');
    expect(droppedMotes).toHaveLength(2);
    expect(droppedMotes[0].ttlTicks).toBe(DROPPED_MOTE_TTL_TICKS);
  });

  it('pushes shades inside newly lit lantern safe_radius (6m) out within <= 30 ticks without damage', () => {
    const sim = new LanternIslandSim({
      seed: 7,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 0], deposited: 0, lit: false }],
        shades: [{ id: 'S1', pos: [1.0, 0, 0], state: 'chase' }],
      },
    });

    const input = createDefaultInput();
    input.interact = true;
    const ev1 = sim.step(input);
    expect(ev1.find((e) => e.name === 'lantern_lit')).toBeDefined();
    expect(ev1.find((e) => e.name === 'player_hit')).toBeUndefined();

    input.interact = false;
    for (let i = 0; i < SAFE_PUSH_MAX_TICKS; i++) {
      const evs = sim.step(input);
      expect(evs.find((e) => e.name === 'player_hit')).toBeUndefined();
    }
    expect(distXZ(sim.shades[0].pos, [0, 0, 0])).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(sim.player.flames).toBe(3);
  });
});

describe('Phase 2 New Features — Dash, Charm, Drifters, 3 Nights, Fall, Pause & Wind', () => {
  it('executes dash (14 m/s, 12 ticks, 90-tick cd) and preserves Y altitude during air dash', () => {
    const sim = new LanternIslandSim({
      seed: 20,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });

    // Jump first, wait 10 ticks to rise in air, then dash forward
    const input = createDefaultInput();
    input.jump = true;
    sim.step(input);
    input.jump = false;
    for (let i = 0; i < 9; i++) sim.step(input);
    const airY = sim.player.pos[1];
    expect(airY).toBeGreaterThan(0.5);

    input.dash = true;
    const dashEvs = sim.step(input);
    expect(dashEvs.find((e) => e.name === 'dash')).toBeDefined();
    expect(sim.player.dashCdTicks).toBe(DASH_COOLDOWN_TICKS);
    input.dash = false;

    for (let i = 0; i < DASH_DURATION_TICKS - 1; i++) {
      sim.step(input);
      expect(sim.player.pos[1]).toBeCloseTo(airY, 4);
    }
    // 12 ticks * 14 m/s / 60 = 2.8m exact
    expect(sim.player.pos[2]).toBeCloseTo(2.8, 3);
  });

  it('activates Wind Charm (7.2 m/s, zero dash cooldown, 600 ticks, respawn 2700 ticks)', () => {
    const sim = new LanternIslandSim({
      seed: 21,
      night: 2,
      scenario: {
        player: { pos: [35, 0, 0] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    const ev1 = sim.step(createDefaultInput());
    expect(ev1.find((e) => e.name === 'charm_picked')?.data).toEqual({
      charm_id: 'C1',
      charm_ticks: CHARM_DURATION_TICKS,
    });
    expect(sim.charms[0].available).toBe(false);
    expect(sim.charms[0].respawnTicks).toBe(CHARM_RESPAWN_TICKS);

    // Move along +X on bridge for 60 ticks -> 7.2 m/s
    const input = createDefaultInput();
    input.move = [1, 0];
    for (let i = 0; i < 60; i++) sim.step(input);
    expect(sim.player.pos[0]).toBeCloseTo(35 + 7.2, 2);

    // Dash has 0 cooldown while charm active
    input.move = [0, 0];
    input.dash = true;
    sim.step(input);
    expect(sim.player.dashCdTicks).toBe(0);
  });

  it('launches Mây from Night 2 launchpad onto Island B and handles falling off island + 60-tick respawn', () => {
    const sim = new LanternIslandSim({
      seed: 22,
      night: 2,
      scenario: {
        player: { pos: [20, 0, 18], carried: 4, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });

    // Step 1 triggers launchpad (20,0,18) -> Island B (70,0,0)
    for (let i = 0; i < 100; i++) sim.step(createDefaultInput());
    expect(sim.player.grounded).toBe(true);
    expect(sim.player.pos[1]).toBe(0);
    // Should land inside Island B (radius 28 around x=70)
    expect(Math.hypot(sim.player.pos[0] - 70, sim.player.pos[2])).toBeLessThan(28);

    // Walk off Island B (+Z edge) into void to test fall (Y < -10) -> lose 1 flame + all carried + 60 tick respawn + 90 tick invuln
    const walkOff = createDefaultInput();
    walkOff.move = [0, 1];
    let fallHit: unknown = null;
    for (let i = 0; i < 400; i++) {
      const evs = sim.step(walkOff);
      const hit = evs.find((e) => e.name === 'player_hit');
      if (hit) {
        fallHit = hit.data;
        break;
      }
    }
    expect(fallHit).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 4 });
    expect(sim.player.carried).toBe(0);
    expect(sim.player.fallRespawnTicks).toBe(FALL_RESPAWN_TICKS);

    for (let i = 0; i < FALL_RESPAWN_TICKS; i++) sim.step(createDefaultInput());
    expect(sim.player.pos).toEqual([0, 0, 0]);
    expect(sim.player.invulnTicks).toBe(INVULN_TICKS);
  });

  it('runs Drifter (Gió Lạc) chase, steal ignoring invuln/safe_radius, and pulse-triggered drifter_drop', () => {
    const sim = new LanternIslandSim({
      seed: 23,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, invuln_ticks: 90 },
        lanterns: [{ id: 'L1', pos: [0, 0, 0], lit: true }],
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [3, 0, 0], state: 'idle', stolen: 0 }],
      },
    });

    let stole = false;
    for (let i = 0; i < 60; i++) {
      const evs = sim.step(createDefaultInput());
      const st = evs.find((e) => e.name === 'drifter_steal');
      if (st) {
        expect(st.data).toEqual({ drifter_id: 'D1', amount: 3, carried: 3 });
        stole = true;
        break;
      }
    }
    expect(stole).toBe(true);
    expect(sim.drifters[0].state).toBe('flee');
    expect(sim.drifters[0].stolen).toBe(3);

    // Pulse immediately while fleeing drifter is still within 5m -> drops all 3 stolen motes
    const pulseIn = createDefaultInput();
    pulseIn.pulse = true;
    const evDrop = sim.step(pulseIn);
    expect(evDrop.find((e) => e.name === 'drifter_drop')?.data).toEqual({
      drifter_id: 'D1',
      amount: 3,
    });
    expect(sim.motes.filter((m) => m.kind === 'dropped')).toHaveLength(3);
  });

  it('supports Night 3 3-tier island: ramp climb, launchpad to Tier 2, Bell Tower block, and wind gusts', () => {
    // 1. Climb 30 deg ramp from r=30 (Y=0) to r=24 (Y=3)
    const rad30 = (30 * Math.PI) / 180;
    const simRamp = new LanternIslandSim({
      seed: 24,
      night: 3,
      scenario: {
        player: { pos: [Math.cos(rad30) * 30.5, 0, Math.sin(rad30) * 30.5] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
      },
    });
    const climbIn = createDefaultInput();
    climbIn.move = [-Math.cos(rad30), -Math.sin(rad30)];
    for (let i = 0; i < 80; i++) simRamp.step(climbIn);
    expect(simRamp.player.pos[1]).toBeCloseTo(3, 1);

    // 2. Launchpad at (0, 3, 13) -> lands on Tier 2 (Y=6)
    const simPad = new LanternIslandSim({
      seed: 25,
      night: 3,
      scenario: {
        player: { pos: [0, 3, 13] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
      },
    });
    for (let i = 0; i < 80; i++) simPad.step(createDefaultInput());
    expect(simPad.player.pos[1]).toBeCloseTo(6, 2);
    expect(Math.hypot(simPad.player.pos[0], simPad.player.pos[2])).toBeLessThanOrEqual(8);

    // 3. Bell tower cylinder r=2 blocks entry on Tier 2
    const towardTower = createDefaultInput();
    towardTower.move = [0, -1];
    for (let i = 0; i < 120; i++) simPad.step(towardTower);
    expect(Math.hypot(simPad.player.pos[0], simPad.player.pos[2])).toBeGreaterThanOrEqual(2.0);

    // 4. Wind activates at tick 1800 and pushes player at 2 m/s
    const simWind = new LanternIslandSim({
      seed: 26,
      night: 3,
      scenario: {
        player: { pos: [0, 0, -25] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: true,
      },
    });
    for (let i = 0; i < 1799; i++) simWind.step(createDefaultInput());
    expect(simWind.wind.active).toBe(false);
    const posBefore = [...simWind.player.pos] as [number, number, number];
    for (let i = 0; i < 60; i++) simWind.step(createDefaultInput());
    expect(simWind.wind.active).toBe(true);
    expect(distXZ(posBefore, simWind.player.pos)).toBeCloseTo(2.0, 2);
  });

  it('freezes sim_tick, timers and spawns on pause and resumes cleanly', () => {
    const sim = new LanternIslandSim({
      seed: 27,
      night: 1,
      scenario: { random_motes: false, random_shades: false, time_left_s: 100 },
    });

    for (let i = 0; i < 10; i++) sim.step(createDefaultInput());
    expect(sim.tick).toBe(10);
    expect(sim.simTick).toBe(10);

    const pIn = createDefaultInput();
    pIn.pause = true;
    const evPause = sim.step(pIn);
    expect(evPause.find((e) => e.name === 'paused')).toBeDefined();
    expect(sim.state).toBe('paused');
    expect(sim.tick).toBe(11);
    expect(sim.simTick).toBe(10);
    const frozenTime = sim.getTimeLeftS();

    pIn.pause = false;
    for (let i = 0; i < 30; i++) sim.step(pIn);
    expect(sim.tick).toBe(41);
    expect(sim.simTick).toBe(10);
    expect(sim.getTimeLeftS()).toBe(frozenTime);

    pIn.pause = true;
    const evResume = sim.step(pIn);
    expect(evResume.find((e) => e.name === 'resumed')).toBeDefined();
    expect(sim.state).toBe('playing');
    expect(sim.simTick).toBe(11);

    // Repeated pause -> release -> resume cycle keeps movement & skills responsive
    const releaseIn = createDefaultInput();
    sim.step(releaseIn);
    const pauseAgain = createDefaultInput();
    pauseAgain.pause = true;
    sim.step(pauseAgain);
    expect(sim.state).toBe('paused');
    sim.step(releaseIn); // release while paused
    sim.step(pauseAgain); // resume via rising edge
    expect(sim.state).toBe('playing');
    const dashAfterResume = createDefaultInput();
    dashAfterResume.dash = true;
    const evDash = sim.step(dashAfterResume);
    expect(evDash.find((e) => e.name === 'dash')).toBeDefined();
    expect(sim.player.pos[2]).toBeGreaterThan(0);
  });

  it('validates v1.1 scenario/inputs strictly', () => {
    expect(() =>
      validateScenarioConfig({ shades: [{ pos: [1, 0, 0], state: 'bogus_state' }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateInputsFile({ frames: [{ tick: 0, dash: 'yes' }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({ drifters: [{ pos: [1, 0, 0], state: 'invalid' }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({
        motes: [
          { id: 'M1', pos: [1, 0, 0] },
          { id: 'M1', pos: [2, 0, 0] },
        ],
      }),
    ).toThrow(ContractFormatError);
  });

  it('fixes QA edge cases: natural ID order S2<S10, exact 2.0m recoil, 600t charm + 2700t respawn, re-stun +5, win/loss priority', () => {
    // 1. Natural ID ordering: S2 must hit before S10 (not lexicographic S10 < S2)
    const simOrder = new LanternIslandSim({
      seed: 31,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [
          { id: 'S10', pos: [0.5, 0, 0], state: 'chase' },
          { id: 'S2', pos: [-0.5, 0, 0], state: 'chase' },
        ],
      },
    });
    simOrder.step(createDefaultInput());
    expect(simOrder.shades.find((s) => s.id === 'S2')?.state).toBe('recoil');
    expect(simOrder.shades.find((s) => s.id === 'S10')?.state).toBe('chase');

    // 2. Exact 60-step recoil = 2.000 m
    const simRecoil = new LanternIslandSim({
      seed: 32,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [1.0, 0, 0], state: 'chase' }],
      },
    });
    simRecoil.step(createDefaultInput()); // hit at tick 1 -> recoil starts
    const xAfterHit = simRecoil.shades[0].pos[0];
    for (let i = 0; i < 60; i++) simRecoil.step(createDefaultInput());
    expect(simRecoil.shades[0].pos[0] - xAfterHit).toBeCloseTo(2.0, 3);
    expect(simRecoil.shades[0].state).toBe('chase');

    // 3. Re-stunning an already stunned shade still grants +5 score & refreshes stun
    const simRestun = new LanternIslandSim({
      seed: 33,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [3, 0, 0], state: 'stunned', state_ticks_left: 50 }],
      },
    });
    const pIn = createDefaultInput();
    pIn.pulse = true;
    const evP = simRestun.step(pIn);
    expect(evP.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(simRestun.score).toBe(5);
    expect(simRestun.shades[0].stateTicksLeft).toBe(PULSE_STUN_TICKS);

    // 4. Exact 600-tick Wind Charm + 2700-tick respawn (step off charm pad so respawn stays visible)
    const simCharm = new LanternIslandSim({
      seed: 34,
      night: 2,
      scenario: {
        player: { pos: [35, 0, 0], charm_ticks: 0 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });
    simCharm.step(createDefaultInput()); // picks C1 at tick 1 -> 600 ticks
    // Walk away from [35,0,0] for 30 ticks at 7.2 m/s (+3.6m along bridge)
    const stepAway = createDefaultInput();
    stepAway.move = [1, 0];
    for (let i = 0; i < 30; i++) simCharm.step(stepAway);
    expect(simCharm.player.pos[0]).toBeCloseTo(35 + 3.6, 2);
    for (let i = 0; i < 570; i++) simCharm.step(createDefaultInput());
    expect(simCharm.player.charmTicks).toBe(0);
    for (let i = 0; i < CHARM_RESPAWN_TICKS - 600; i++) simCharm.step(createDefaultInput());
    expect(simCharm.charms[0].available).toBe(true);

    // 5. Win on exact timeout tick (all_lit beats dawn when flames > 0)
    const simTie = new LanternIslandSim({
      seed: 35,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 10, flames: 1 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
        time_left_s: 1 / 60,
      },
    });
    const actIn = createDefaultInput();
    actIn.interact = true;
    const evTie = simTie.step(actIn);
    expect(simTie.state).toBe('won');
    expect(evTie.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'won',
      reason: 'all_lit',
    });

    // 6. Pulse on chasing drifter forces flee without stealing; flee disappears at exact T+120 after drop
    const simDrifterChase = new LanternIslandSim({
      seed: 36,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], carried: 6 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        drifters: [{ id: 'D1', pos: [4, 0, 0], state: 'chase', stolen: 0 }],
      },
    });
    const pulseIn = createDefaultInput();
    pulseIn.pulse = true;
    const evChasePulse = simDrifterChase.step(pulseIn);
    expect(evChasePulse.find((e) => e.name === 'drifter_steal')).toBeUndefined();
    expect(evChasePulse.find((e) => e.name === 'drifter_drop')).toBeUndefined();
    expect(simDrifterChase.drifters[0].state).toBe('flee');
  });
});
