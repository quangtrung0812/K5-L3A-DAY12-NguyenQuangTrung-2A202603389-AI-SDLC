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
  FUEL_UNITS_PER_POINT,
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

describe('Test Contract v1.2 — Core Sync & Non-Replaced Phase 1–2 Regression', () => {
  it('keeps src/sim/tuning.ts 100% synchronized with game.contract.json v1.2', () => {
    const raw = readFileSync(resolve(process.cwd(), 'game.contract.json'), 'utf8');
    const contract = JSON.parse(raw);
    expect(contract.contract_version).toBe('1.2');
    expect(contract.tuning).toEqual(TUNING);
    expect(TUNING.night1_duration_s).toBe(240);
    expect(TUNING.night2_duration_s).toBe(270);
    expect(TUNING.night3_duration_s).toBe(300);
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
    expect(maxY).toBeGreaterThan(1.1);
    expect(maxY).toBeLessThan(1.3);
    expect(sim.player.pos[1]).toBe(0);
    expect(sim.player.grounded).toBe(true);
  });

  it('picks up motes within XZ <= 1.0m and |dy| <= 1.5m up to initial carry_capacity 10', () => {
    const motes: [number, number, number][] = [
      [0, 0, 1.0],
      [0, 0, 1.05],
      [0, 2.0, 0.2],
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
    expect(sim.score).toBe(0);
    expect(sim.motes).toHaveLength(4);
  });

  // UPDATED FOR PHASE 3 (see ADR-001): lighting all 5 lanterns no longer ends the night early (all_lit removed)
  it('[Updated v1.2] lighting all 5 lanterns scores +5/mote +100 first-light, emits relight:false, grows capacity, and keeps playing until dawn', () => {
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

    const input = createDefaultInput();
    input.interact = true;
    const events = sim.step(input);

    expect(events.map((e) => e.name)).toEqual(['night_start', 'deposit', 'lantern_lit']);
    expect(events.find((e) => e.name === 'lantern_lit')?.data).toEqual({
      lantern_id: 'L1',
      relight: false,
    });
    expect(sim.state).toBe('playing');
    expect(sim.getCarryCapacity()).toBe(12);
    // 10 * 5 (deposit) + 100 (first light) = 150
    expect(sim.score).toBe(150);
  });

  it('executes 3D pulse (cost 3, r=5m from y+0.8, 15-tick 4m push, 120-tick stun, +5 normal; exits stun to wander)', () => {
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

    input.pulse = false;
    for (let i = 0; i < 14; i++) sim.step(input);
    expect(sim.shades[0].pos[0]).toBeCloseTo(8.5, 2);

    // Still stunned through tick 120; at tick 121 exits to wander (and detects player at 8.5m <= 12m)
    for (let i = 0; i < PULSE_STUN_TICKS - 15; i++) sim.step(input);
    expect(sim.shades[0].state).toBe('stunned');
    sim.step(input);
    expect(sim.shades[0].state).toBe('chase');

    // Verify stun exit > 12m goes to wander (not chase via old 18m leash)
    const simFar = new LanternIslandSim({
      seed: 51,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        shades: [{ id: 'S1', pos: [14, 0, 0], state: 'stunned', state_ticks_left: 1 }],
      },
    });
    simFar.step(createDefaultInput());
    expect(simFar.shades[0].state).toBe('wander');
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

  it('keeps Phase 2 Dash, Wind Charm, Launchpad/Fall, Drifter, Night 3 Wind & Pause regression green', () => {
    // 1. Air dash preserves Y & exact 2.8m
    const simDash = new LanternIslandSim({
      seed: 20,
      night: 1,
      scenario: { random_motes: false, random_shades: false },
    });
    const dIn = createDefaultInput();
    dIn.jump = true;
    simDash.step(dIn);
    dIn.jump = false;
    for (let i = 0; i < 9; i++) simDash.step(dIn);
    const airY = simDash.player.pos[1];
    dIn.dash = true;
    simDash.step(dIn);
    expect(simDash.player.dashCdTicks).toBe(DASH_COOLDOWN_TICKS);
    dIn.dash = false;
    for (let i = 0; i < DASH_DURATION_TICKS - 1; i++) {
      simDash.step(dIn);
      expect(simDash.player.pos[1]).toBeCloseTo(airY, 4);
    }
    expect(simDash.player.pos[2]).toBeCloseTo(2.8, 3);

    // 2. Wind Charm 600t + 2700t respawn
    const simCharm = new LanternIslandSim({
      seed: 21,
      night: 2,
      scenario: {
        player: { pos: [35, 0, 0] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });
    simCharm.step(createDefaultInput());
    expect(simCharm.charms[0].respawnTicks).toBe(CHARM_RESPAWN_TICKS);
    expect(simCharm.player.charmTicks).toBe(CHARM_DURATION_TICKS);

    // 3. Night 2 launchpad + fall + 60t respawn
    const simFall = new LanternIslandSim({
      seed: 22,
      night: 2,
      scenario: {
        player: { pos: [20, 0, 18], carried: 4, flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
      },
    });
    for (let i = 0; i < 100; i++) simFall.step(createDefaultInput());
    expect(Math.hypot(simFall.player.pos[0] - 70, simFall.player.pos[2])).toBeLessThan(28);
    const walkOff = createDefaultInput();
    walkOff.move = [0, 1];
    let fell = false;
    for (let i = 0; i < 400; i++) {
      if (simFall.step(walkOff).some((e) => e.name === 'player_hit')) {
        fell = true;
        break;
      }
    }
    expect(fell).toBe(true);
    expect(simFall.player.fallRespawnTicks).toBe(FALL_RESPAWN_TICKS);

    // 4. Drifter steal & pulse drop
    const simDrift = new LanternIslandSim({
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
    for (let i = 0; i < 60; i++) {
      if (simDrift.step(createDefaultInput()).some((e) => e.name === 'drifter_steal')) break;
    }
    expect(simDrift.drifters[0].stolen).toBe(3);
    const pIn = createDefaultInput();
    pIn.pulse = true;
    expect(simDrift.step(pIn).some((e) => e.name === 'drifter_drop')).toBe(true);

    // 5. Night 3 ramp, Tier 2 launchpad, Bell Tower & Wind
    const simPad = new LanternIslandSim({
      seed: 25,
      night: 3,
      scenario: {
        player: { pos: [0, 3, 13] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: true,
      },
    });
    for (let i = 0; i < 80; i++) simPad.step(createDefaultInput());
    expect(simPad.player.pos[1]).toBeCloseTo(6, 2);
    for (let i = 0; i < 1720; i++) simPad.step(createDefaultInput());
    expect(simPad.wind.active).toBe(true);

    // 6. Pause freezes sim_tick, time_left_s AND lantern fuel
    const simPause = new LanternIslandSim({
      seed: 27,
      night: 1,
      scenario: {
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', lit: true, fuel: 80 }],
      },
    });
    for (let i = 0; i < 10; i++) simPause.step(createDefaultInput());
    const fuelBeforePause = simPause.lanterns[0].fuelUnits;
    const pauseIn = createDefaultInput();
    pauseIn.pause = true;
    simPause.step(pauseIn);
    pauseIn.pause = false;
    for (let i = 0; i < 60; i++) simPause.step(pauseIn);
    expect(simPause.state).toBe('paused');
    expect(simPause.lanterns[0].fuelUnits).toBe(fuelBeforePause);
  });

  it('preserves all Phase 2 QA edge cases: natural ID S2<S10, exact 2.0m recoil, re-stun +5, Night 3 ramp & tower, chase drifter pulse', () => {
    // 1. Natural ID ordering: S2 hits before S10
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
    simRecoil.step(createDefaultInput());
    const xAfterHit = simRecoil.shades[0].pos[0];
    for (let i = 0; i < 60; i++) simRecoil.step(createDefaultInput());
    expect(simRecoil.shades[0].pos[0] - xAfterHit).toBeCloseTo(2.0, 3);
    expect(simRecoil.shades[0].state).toBe('chase');

    // 3. Re-stunning an already stunned shade still grants +5 score & refreshes stun to 120 ticks
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

    // 4. Night 3 ramp climb (Y=0 -> Y=3) & Bell Tower cylinder (r=2) collision block
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

    const simTower = new LanternIslandSim({
      seed: 28,
      night: 3,
      scenario: {
        player: { pos: [0, 6, 5] },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
      },
    });
    const towardTower = createDefaultInput();
    towardTower.move = [0, -1];
    for (let i = 0; i < 120; i++) simTower.step(towardTower);
    expect(Math.hypot(simTower.player.pos[0], simTower.player.pos[2])).toBeGreaterThanOrEqual(2.0);

    // 5. Pulsing a chasing drifter forces flee without stealing or dropping
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
    const evChasePulse = simDrifterChase.step(pIn);
    expect(evChasePulse.find((e) => e.name === 'drifter_steal')).toBeUndefined();
    expect(evChasePulse.find((e) => e.name === 'drifter_drop')).toBeUndefined();
    expect(simDrifterChase.drifters[0].state).toBe('flee');
  });
});

describe('Phase 3 New Features — Lantern Fuel, Shade Drain, Dawn Win, Capacity & Scoring v1.2', () => {
  it('tracks lantern fuel in exact 1/60 integer units, refuels with ceil((100-fuel)/10), and ignores full-fuel lanterns', () => {
    const sim = new LanternIslandSim({
      seed: 301,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 8, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 100 }],
      },
    });

    // At tick 0 fuel = 100; after 600 ticks (10s) fuel must be exact 90.0 (5400 units)
    for (let i = 0; i < 600; i++) sim.step(createDefaultInput());
    expect(sim.lanterns[0].fuelUnits).toBe(5400);
    expect(sim.getSnapshot().lanterns[0].fuel).toBe(90);

    // On tick 601, Step 2 decays 1 unit -> 5399 (89.9833), so ceil((6000-5399)/600) = 2 motes used!
    const actIn = createDefaultInput();
    actIn.interact = true;
    const evRefuel = sim.step(actIn);
    const rf = evRefuel.find((e) => e.name === 'refuel');
    expect(rf?.data).toEqual({ lantern_id: 'L1', amount: 2, fuel: 100 });
    expect(sim.player.carried).toBe(6);
    expect(sim.score).toBe(10); // 2 * 5

    // Verify full-fuel lantern (exact 6000 units at Step 5) is skipped in favor of eligible unlit L2
    const simFull = new LanternIslandSim({
      seed: 302,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 24.5], lit: true, fuel: 100 },
          { id: 'L2', pos: [0, 0, 25.5], lit: false, deposited: 0 },
        ],
      },
    });
    // Set L1 to 6001 units so after Step 2 (-1 decay) it sits at exact 6000 (100.0 full) during Step 5
    simFull.lanterns[0].fuelUnits = 6001;
    const iFull = createDefaultInput();
    iFull.interact = true;
    const evFull = simFull.step(iFull);
    expect(evFull.find((e) => e.name === 'refuel')).toBeUndefined();
    expect(evFull.find((e) => e.name === 'deposit')?.data).toEqual({
      lantern_id: 'L2',
      amount: 5,
      deposited: 5,
    });

    // Verify exact 10-fuel boundary: fuel = 90.0 (5400 units) uses exact 1 mote (no float ceil error)
    const simExact = new LanternIslandSim({
      seed: 303,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 5, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 90 }],
      },
    });
    simExact.lanterns[0].fuelUnits = 5401; // becomes exact 5400 (90.0) in Step 2 -> ceil(600/600) = 1
    const iExact = createDefaultInput();
    iExact.interact = true;
    const evExact = simExact.step(iExact);
    expect(evExact.find((e) => e.name === 'refuel')?.data).toEqual({
      lantern_id: 'L1',
      amount: 1,
      fuel: 100,
    });
  });

  it('extinguishes lantern at fuel <= 0 with lantern_out and relights for 5 motes (+40 bonus, relight:true, relit_count+1)', () => {
    const sim = new LanternIslandSim({
      seed: 304,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 1, ever_lit: true }],
      },
    });

    let outTick = -1;
    for (let t = 1; t <= 65; t++) {
      const evs = sim.step(createDefaultInput());
      if (evs.some((e) => e.name === 'lantern_out')) {
        outTick = t;
        break;
      }
    }
    expect(outTick).toBe(60); // 1.0 fuel = 60 units -> 0 at exact tick 60
    const snapOut = sim.getSnapshot().lanterns[0];
    expect(snapOut.lit).toBe(false);
    expect(snapOut.fuel).toBe(0);
    expect(snapOut.deposited).toBe(0);
    expect(snapOut.ever_lit).toBe(true);

    // Relight costs only 5 motes -> leaves 1 mote carried, scores 5*5 + 40 = 65, relit_count = 1
    const relightIn = createDefaultInput();
    relightIn.interact = true;
    const evRelight = sim.step(relightIn);
    expect(evRelight.find((e) => e.name === 'deposit')?.data).toEqual({
      lantern_id: 'L1',
      amount: 5,
      deposited: 5,
    });
    expect(evRelight.find((e) => e.name === 'lantern_lit')?.data).toEqual({
      lantern_id: 'L1',
      relight: true,
    });
    expect(sim.player.carried).toBe(1);
    expect(sim.score).toBe(65);
    const snapRelit = sim.getSnapshot().lanterns[0];
    expect(snapRelit.lit).toBe(true);
    expect(snapRelit.fuel).toBe(100);
    expect(snapRelit.relit_count).toBe(1);
    expect(sim.getCarryCapacity()).toBe(12);
  });

  it('keeps safe zone active at exact fuel=30, drops it below 30, drives shade drain (5/s + stacking + fuel_drain/60t), awards +15 on pulse, and pushes out on refuel >=30', () => {
    // 1. Exact fuel = 30.0 STILL blocks shade (set 30 + 1/60 so after Step 2 decay it is exact 30.0 = 1800 units)
    const simSafe30 = new LanternIslandSim({
      seed: 305,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 25], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 30 }],
        shades: [{ id: 'S1', pos: [6.2, 0, 25], state: 'chase' }],
      },
    });
    simSafe30.lanterns[0].fuelUnits = 1801; // becomes exact 1800 (30.0) in Step 2
    simSafe30.step(createDefaultInput());
    expect(simSafe30.lanterns[0].fuelUnits).toBe(1800);
    expect(simSafe30.isLanternSafeActive(simSafe30.lanterns[0])).toBe(true);
    expect(distXZ(simSafe30.shades[0].pos, [0, 0, 25])).toBeGreaterThanOrEqual(TUNING.safe_radius);

    // 2. Fuel < 30 loses safe zone -> 2 wandering shades enter drain, stack drain (1 + 5 + 5 = 11/s), emit fuel_drain at tick 60
    const simDrain = new LanternIslandSim({
      seed: 306,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
        shades: [
          { id: 'S1', pos: [1, 0, 25], state: 'drain', target_lantern_id: 'L1' },
          { id: 'S2', pos: [-1, 0, 25], state: 'drain', target_lantern_id: 'L1' },
        ],
      },
    });
    const drainEvs: unknown[] = [];
    for (let t = 0; t < 60; t++) {
      for (const e of simDrain.step(createDefaultInput())) {
        if (e.name === 'fuel_drain') drainEvs.push(e.data);
      }
    }
    // 25 - (1 + 5 + 5) = 14.0 exact (840 units)
    expect(simDrain.lanterns[0].fuelUnits).toBe(14 * FUEL_UNITS_PER_POINT);
    expect(drainEvs).toEqual([
      { lantern_id: 'L1', shade_id: 'S1', fuel: 14 },
      { lantern_id: 'L1', shade_id: 'S2', fuel: 14 },
    ]);

    // 3. Pulsing a draining shade awards TOTAL +15 (not +5 and not +20)
    const simPulseDrain = new LanternIslandSim({
      seed: 307,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 22], carried: 6, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 20 }],
        shades: [{ id: 'S1', pos: [0, 0, 25], state: 'drain', target_lantern_id: 'L1' }],
      },
    });
    const pIn = createDefaultInput();
    pIn.pulse = true;
    const evPD = simPulseDrain.step(pIn);
    expect(evPD.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(simPulseDrain.score).toBe(15);
    expect(simPulseDrain.shades[0].state).toBe('stunned');

    // 4. Refueling lantern from < 30 to >= 30 kicks draining shade to wander & pushes it outside 6m within <= 30 ticks (0 dmg)
    const simRefuelPush = new LanternIslandSim({
      seed: 308,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 24], carried: 3, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 22 }],
        shades: [{ id: 'S1', pos: [0.5, 0, 25], state: 'drain', target_lantern_id: 'L1' }],
      },
    });
    const rIn = createDefaultInput();
    rIn.interact = true;
    simRefuelPush.step(rIn); // +30 fuel -> ~52 >= 30 -> activates pushout!
    expect(simRefuelPush.shades[0].state).toBe('wander');
    rIn.interact = false;
    for (let i = 0; i < SAFE_PUSH_MAX_TICKS; i++) {
      const evs = simRefuelPush.step(rIn);
      expect(evs.find((e) => e.name === 'player_hit')).toBeUndefined();
    }
    expect(distXZ(simRefuelPush.shades[0].pos, [0, 0, 25])).toBeGreaterThanOrEqual(TUNING.safe_radius);
    expect(simRefuelPush.player.flames).toBe(3);

    // 5. Draining shade switches to chase when Mây enters <= 6m
    const simAggro = new LanternIslandSim({
      seed: 309,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 19.5], carried: 0, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 20 }],
        shades: [{ id: 'S1', pos: [0, 0, 25], state: 'drain', target_lantern_id: 'L1' }],
      },
    });
    simAggro.step(createDefaultInput());
    expect(simAggro.shades[0].state).toBe('chase');
  });

  it('evaluates dawn survival win (>= ceil(0.6*N)) with dawn_survived bonus, dawn loss (< threshold), and no_flames priority on final tick', () => {
    // 1. Night 1: 3/5 lit at dawn -> WON (dawn_survived)
    const simWin = new LanternIslandSim({
      seed: 310,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 2 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: true, fuel: 20 },
          { id: 'L4', lit: false },
          { id: 'L5', lit: false },
        ],
        time_left_s: 2, // 120 ticks -> each loses 2.0 fuel -> 78, 48, 18
      },
    });
    let winReason: string | null = null;
    for (let i = 0; i < 120; i++) {
      const ev = simWin.step(createDefaultInput()).find((e) => e.name === 'game_over');
      if (ev && ev.name === 'game_over') winReason = ev.data.reason;
    }
    expect(simWin.state).toBe('won');
    expect(winReason).toBe('dawn_survived');
    // Score: (50+78) + (50+48) + (50+18) + (2*50) = 128 + 98 + 68 + 100 = 394 (NO time bonus)
    expect(simWin.score).toBe(394);

    // 2. Night 1: 2/5 lit at dawn -> LOST (dawn)
    const simLoss = new LanternIslandSim({
      seed: 311,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 50 },
          { id: 'L3', lit: false },
          { id: 'L4', lit: false },
          { id: 'L5', lit: false },
        ],
        time_left_s: 1,
      },
    });
    for (let i = 0; i < 60; i++) simLoss.step(createDefaultInput());
    expect(simLoss.state).toBe('lost');
    expect(simLoss.gameOverReason).toBe('dawn');

    // 3. Final tick tie: flames hits 0 on exact dawn tick -> MUST lose no_flames even with 3/5 lit!
    const simTieFlame = new LanternIslandSim({
      seed: 312,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 1 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 90 },
          { id: 'L2', lit: true, fuel: 90 },
          { id: 'L3', lit: true, fuel: 90 },
        ],
        shades: [{ id: 'S1', pos: [0.5, 0, 0], state: 'chase' }],
        time_left_s: 1 / 60,
      },
    });
    const evTie = simTieFlame.step(createDefaultInput());
    expect(simTieFlame.state).toBe('lost');
    expect(evTie.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'no_flames',
    });
  });

  it('grows carry capacity 10 + 2*successful_lights capped at 20 (scenario pre-lit does not count)', () => {
    const sim = new LanternIslandSim({
      seed: 313,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 0, successful_lights: 4 },
        lanterns: [
          { id: 'L1', lit: true },
          { id: 'L2', lit: true },
        ],
        random_motes: false,
        random_shades: false,
      },
    });
    expect(sim.getSnapshot().player.capacity).toBe(18);
    sim.player.successfulLights = 6;
    expect(sim.getSnapshot().player.capacity).toBe(20);
  });

  it('validates Contract v1.2 scenario fields strictly', () => {
    expect(() =>
      validateScenarioConfig({ lanterns: [{ id: 'L1', lit: true, fuel: 150 }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({ lanterns: [{ id: 'L1', ever_lit: 'yes' }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({ player: { successful_lights: -1 } }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateScenarioConfig({ shades: [{ pos: [0, 0, 0], state: 'drain', target_lantern_id: '' }] }),
    ).toThrow(ContractFormatError);

    expect(() =>
      validateInputsFile({ frames: [{ tick: 0, dash: 'yes' }] }),
    ).toThrow(ContractFormatError);

    const valid = validateScenarioConfig({
      player: { successful_lights: 2 },
      lanterns: [{ id: 'L1', lit: true, fuel: 25, ever_lit: true }],
      shades: [{ pos: [0, 0, 25], state: 'drain', target_lantern_id: 'L1' }],
    });
    expect(valid.shades?.[0].state).toBe('drain');
  });

  it('covers Phase 3 tiebreaks & dawn edge cases: interact ID tiebreak, wander weak-lantern tiebreak, chase does not switch, Night 2/3 thresholds, final-tick lantern_out', () => {
    // 1. Interact equal-distance tiebreak picks smaller ID (L1 over L2)
    const simTieInteract = new LanternIslandSim({
      seed: 320,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], carried: 4, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [1.5, 0, 0], lit: false, deposited: 0 },
          { id: 'L2', pos: [-1.5, 0, 0], lit: false, deposited: 0 },
        ],
      },
    });
    const actIn = createDefaultInput();
    actIn.interact = true;
    const evTieInt = simTieInteract.step(actIn);
    expect(evTieInt.find((e) => e.name === 'deposit')?.data).toEqual({
      lantern_id: 'L1',
      amount: 4,
      deposited: 4,
    });

    // 2. Shade wander chooses smaller ID on equal-distance weak lanterns; chasing shade ignores weak lantern
    const simShadeTarget = new LanternIslandSim({
      seed: 321,
      night: 1,
      scenario: {
        player: { pos: [0, 0, -25], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [5, 0, 20], lit: true, fuel: 20 },
          { id: 'L2', pos: [-5, 0, 20], lit: true, fuel: 20 },
        ],
        shades: [{ id: 'S1', pos: [0, 0, 20], state: 'wander' }],
      },
    });
    simShadeTarget.step(createDefaultInput());
    expect(simShadeTarget.shades[0].targetLanternId).toBe('L1');
    expect(simShadeTarget.shades[0].pos[0]).toBeGreaterThan(0);

    const simChaseNoSwitch = new LanternIslandSim({
      seed: 322,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 10], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 20 }],
        shades: [{ id: 'S1', pos: [0, 0, 24], state: 'chase' }],
      },
    });
    simChaseNoSwitch.step(createDefaultInput());
    expect(simChaseNoSwitch.shades[0].state).toBe('chase');
    expect(simChaseNoSwitch.shades[0].pos[2]).toBeLessThan(24);

    // 3. Night 2 (4/6) & Night 3 (5/7) dawn win thresholds
    const simN2 = new LanternIslandSim({
      seed: 323,
      night: 2,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 },
          { id: 'L4', lit: true, fuel: 80 },
        ],
        time_left_s: 1 / 60,
      },
    });
    expect(simN2.getWinLitThreshold()).toBe(4);
    simN2.step(createDefaultInput());
    expect(simN2.state).toBe('won');
    expect(simN2.gameOverReason).toBe('dawn_survived');

    const simN3 = new LanternIslandSim({
      seed: 324,
      night: 3,
      scenario: {
        player: { pos: [0, 0, -12], flames: 3 },
        random_motes: false,
        random_shades: false,
        random_drifters: false,
        wind_enabled: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 },
          { id: 'L4', lit: true, fuel: 80 },
          { id: 'L5', lit: true, fuel: 80 },
        ],
        time_left_s: 1 / 60,
      },
    });
    expect(simN3.getWinLitThreshold()).toBe(5);
    simN3.step(createDefaultInput());
    expect(simN3.state).toBe('won');
    expect(simN3.gameOverReason).toBe('dawn_survived');

    // 4. Lantern extinguishing in Step 2 on the exact final dawn tick drops lit count 3 -> 2 -> loses dawn!
    const simFinalTickOut = new LanternIslandSim({
      seed: 325,
      night: 1,
      scenario: {
        player: { pos: [0, 0, 0], flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', lit: true, fuel: 80 },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 1 / 60 },
        ],
        time_left_s: 1 / 60,
      },
    });
    const evFinalOut = simFinalTickOut.step(createDefaultInput());
    expect(evFinalOut.find((e) => e.name === 'lantern_out')?.data).toEqual({ lantern_id: 'L3' });
    expect(simFinalTickOut.state).toBe('lost');
    expect(simFinalTickOut.gameOverReason).toBe('dawn');
  });
});
