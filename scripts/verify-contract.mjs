import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, 'game.contract.json'), 'utf8'));
const [cmdBin, ...cmdBaseArgs] = contract.headless_cmd.split(/\s+/);
const outDir = resolve(root, 'tmp/verify-phase3');
mkdirSync(outDir, { recursive: true });

const VALID_SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain']);
const VALID_GAME_OVER_REASONS = new Set(['dawn_survived', 'dawn', 'no_flames']);

function runHeadless(extraArgs) {
  return spawnSync(cmdBin, [...cmdBaseArgs, ...extraArgs], {
    cwd: root,
    encoding: 'utf8',
  });
}

function parseJsonl(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const lines = raw.trim().split('\n');
  const records = lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Invalid JSON on line ${i + 1} of ${filePath}: ${err.message}`);
    }
  });
  return { raw, records };
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function validateJsonlV12(records, snapshotEvery, expectedNight, expectedLanternCount) {
  assert(records.length >= 2, 'JSONL must contain at least tick 0 snapshot and end record');
  assert(records[0].type === 'snapshot' && records[0].tick === 0, 'First record must be snapshot at tick 0');
  const last = records[records.length - 1];
  assert(last.type === 'end', 'Last record must be end');
  assert(['playing', 'paused', 'won', 'lost'].includes(last.state), `Invalid end state: ${last.state}`);

  for (const r of records) {
    if (r.type === 'snapshot') {
      assert(r.tick % snapshotEvery === 0, `Snapshot tick ${r.tick} not divisible by ${snapshotEvery}`);
      assert(r.night === expectedNight, `Snapshot night ${r.night} !== ${expectedNight}`);
      assert(r.wind && typeof r.wind.active === 'boolean' && typeof r.wind.dir_deg === 'number', 'Missing wind object');
      assert(Array.isArray(r.player.vel) && r.player.vel.length === 3, 'Missing player.vel');
      assert(typeof r.player.grounded === 'boolean', 'Missing player.grounded');
      assert(typeof r.player.capacity === 'number' && r.player.capacity >= 10 && r.player.capacity <= 20, 'Invalid player.capacity');
      assert(typeof r.player.invuln === 'boolean', 'Missing player.invuln');
      assert(typeof r.player.dash_cd_s === 'number', 'Missing player.dash_cd_s');
      assert(typeof r.player.pulse_cd_s === 'number', 'Missing player.pulse_cd_s');
      assert(typeof r.player.charm_s === 'number', 'Missing player.charm_s');
      assert(Array.isArray(r.lanterns) && r.lanterns.length === expectedLanternCount, `Expected ${expectedLanternCount} lanterns`);
      for (const l of r.lanterns) {
        assert(typeof l.fuel === 'number' && l.fuel >= 0 && l.fuel <= 100, `Invalid lantern fuel: ${l.fuel}`);
        if (!l.lit) assert(l.fuel === 0, `Unlit lantern must have fuel=0, got ${l.fuel}`);
        assert(typeof l.ever_lit === 'boolean', 'Missing lantern.ever_lit');
        assert(typeof l.relit_count === 'number' && l.relit_count >= 0, 'Missing lantern.relit_count');
      }
      assert(Array.isArray(r.motes) && r.motes.length === r.motes_active, 'motes must match motes_active');
      for (const m of r.motes) {
        assert(m.kind === 'random' || m.kind === 'dropped', `Invalid mote kind: ${m.kind}`);
        assert('ttl_s' in m, 'Missing mote.ttl_s');
      }
      assert(Array.isArray(r.drifters), 'Missing drifters array');
      assert(Array.isArray(r.charms), 'Missing charms array');
      for (const s of r.shades) {
        assert(VALID_SHADE_STATES.has(s.state), `Invalid shade state: ${s.state}`);
      }
    } else if (r.type === 'event') {
      if (r.name === 'lantern_lit') {
        assert(typeof r.data.relight === 'boolean', 'lantern_lit must include boolean relight');
      } else if (r.name === 'game_over') {
        assert(VALID_GAME_OVER_REASONS.has(r.data.reason), `Invalid game_over reason: ${r.data.reason}`);
      }
    }
  }
}

const checks = [];

function runCheck(id, category, description, fn) {
  try {
    const detail = fn();
    checks.push({ id, category, description, status: 'PASS', detail });
    console.log(`[PASS] ${id}: ${description} — ${detail}`);
  } catch (err) {
    checks.push({ id, category, description, status: 'FAIL', detail: err.message });
    console.error(`[FAIL] ${id}: ${description} — ${err.message}`);
    process.exitCode = 1;
  }
}

// ── PHASE 1 REGRESSION (UPDATED FOR CONTRACT V1.2 WHERE REPLACED) ──
runCheck('R01', 'Phase 1–2 Regression', 'Move + camera yaw + mote pickup & initial carry_capacity=10', () => {
  const out = resolve(outDir, 's01.jsonl');
  const res = runHeadless([
    '--seed', '101', '--night', '1',
    '--scenario', 'tests/scenarios/s01_move_pickup.scenario.json',
    '--inputs', 'tests/scenarios/s01_move_pickup.inputs.json',
    '--ticks', '200', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const picked = records.filter((r) => r.type === 'event' && r.name === 'mote_picked');
  assert(picked.length === 10, `Expected 10 motes picked, got ${picked.length}`);
  const snap180 = records.find((r) => r.type === 'snapshot' && r.tick === 180);
  assert(snap180.player.pos[0] === 6 && snap180.player.pos[2] === 12, `Unexpected pos: ${JSON.stringify(snap180.player.pos)}`);
  assert(snap180.player.carried === 10 && snap180.player.capacity === 10 && snap180.motes_active === 1, 'Carry cap 10 not respected');
  return `pos=[6,0,12], carried=10/10, motes_left=1`;
});

// UPDATED FOR CONTRACT V1.2 (ADR-001): lighting 5th lantern no longer ends night early (all_lit removed)
runCheck('R02', 'Phase 1–2 Regression (v1.2)', 'Deposit 10 motes + light 5th lantern -> relight:false, score=150, capacity=12, NO early win', () => {
  const out = resolve(outDir, 's02.jsonl');
  const res = runHeadless([
    '--seed', '102', '--night', '1',
    '--scenario', 'tests/scenarios/s02_light_and_win.scenario.json',
    '--inputs', 'tests/scenarios/s02_light_and_win.inputs.json',
    '--ticks', '140', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const litEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert(litEv && litEv.tick === 101 && litEv.data.relight === false, `Unexpected lantern_lit: ${JSON.stringify(litEv)}`);
  const end = records.at(-1);
  assert(end.state === 'playing' && end.ticks === 140, `Must NOT win early in v1.2, got ${JSON.stringify(end)}`);
  // 10*5 deposit + 100 first-light = 150
  assert(end.score === 150, `Expected v1.2 score 150, got ${end.score}`);
  const snap120 = records.find((r) => r.type === 'snapshot' && r.tick === 120);
  assert(snap120.player.capacity === 12, `Expected capacity 12 after 1 light, got ${snap120.player.capacity}`);
  return `lit@101 (relight=false), state=playing (no early win), score=150, capacity=12`;
});

runCheck('R03', 'Phase 1–2 Regression', 'Shade chase + hit + physical dropped motes + recoil + loss (no_flames)', () => {
  const out = resolve(outDir, 's03.jsonl');
  const res = runHeadless([
    '--seed', '103', '--night', '1',
    '--scenario', 'tests/scenarios/s03_shade_hit_lose.scenario.json',
    '--ticks', '400', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert(hits.length === 2, `Expected 2 hits, got ${hits.length}`);
  assert(hits[1].tick - hits[0].tick >= 90, `Invuln violated: gap=${hits[1].tick - hits[0].tick}`);
  const snapAfterHit = records.find((r) => r.type === 'snapshot' && r.tick > hits[0].tick && r.tick < hits[0].tick + 30);
  assert(snapAfterHit.shades[0].state === 'recoil', `Expected shade recoil, got ${snapAfterHit.shades[0].state}`);
  assert(snapAfterHit.motes.some((m) => m.kind === 'dropped'), 'Expected physical dropped motes');
  assert(records.at(-1).state === 'lost', 'Expected lost');
  return `hits@${hits[0].tick}&${hits[1].tick}, recoil+dropped verified, lost(no_flames)`;
});

runCheck('R04', 'Phase 1–2 Regression', 'Pulse (3D r=5m, cost 3) pushes 4m in 15 ticks & stuns 120 ticks (+5 score)', () => {
  const out = resolve(outDir, 's04.jsonl');
  const res = runHeadless([
    '--seed', '104', '--night', '1',
    '--scenario', 'tests/scenarios/s04_pulse_stun.scenario.json',
    '--inputs', 'tests/scenarios/s04_pulse_stun.inputs.json',
    '--ticks', '160', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const pulse = records.find((r) => r.type === 'event' && r.name === 'pulse');
  assert(pulse && pulse.tick === 6 && pulse.data.stunned_ids[0] === 'S1', 'Missing pulse event');
  const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
  const snap140 = records.find((r) => r.type === 'snapshot' && r.tick === 140);
  assert(snap30.shades[0].state === 'stunned' && snap30.shades[0].pos[0] > 7.5, 'Shade not knocked back/stunned');
  assert(snap140.shades[0].state === 'chase', 'Shade did not recover after 120 ticks');
  assert(records.at(-1).score === 5, `Expected score 5, got ${records.at(-1).score}`);
  return `pulse@tick=6, shade x=${snap30.shades[0].pos[0]}m (stunned), recovered@tick=140, score=5`;
});

runCheck('R05', 'Phase 1–2 Regression', 'Lit lantern safe_radius (6m, fuel>=30) blocks outside shade completely', () => {
  const out = resolve(outDir, 's05.jsonl');
  const res = runHeadless([
    '--seed', '105', '--night', '1',
    '--scenario', 'tests/scenarios/s05_safe_radius.scenario.json',
    '--ticks', '300', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  assert(records.filter((r) => r.type === 'event' && r.name === 'player_hit').length === 0, 'Unexpected hit');
  const minDist = Math.min(
    ...records.filter((r) => r.type === 'snapshot').map((s) => Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2])),
  );
  assert(minDist > contract.tuning.safe_radius, `Shade entered safe_radius: ${minDist}`);
  return `minDist=${minDist.toFixed(3)}m > 6.0m, hits=0`;
});

runCheck('R06', 'Phase 1–2 Regression', 'Dawn timeout with < 3/5 lit ends game lost(dawn) at exact tick 120', () => {
  const out = resolve(outDir, 's06.jsonl');
  const res = runHeadless([
    '--seed', '106', '--night', '1',
    '--scenario', 'tests/scenarios/s06_dawn_timeout.scenario.json',
    '--ticks', '200', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const end = records.at(-1);
  assert(end.state === 'lost' && end.ticks === 120, `Expected lost@120, got ${JSON.stringify(end)}`);
  return `lost(dawn) at exact tick=${end.ticks}`;
});

// ── PHASE 2 REGRESSION SCENARIOS ──
runCheck('P2-01', 'Phase 1–2 Regression', 'Dash + Wind Charm (C1) zero-cooldown chain dash on Night 2', () => {
  const out = resolve(outDir, 'p2_s01.jsonl');
  const res = runHeadless([
    '--seed', '201', '--night', '2',
    '--scenario', 'tests/scenarios/p2_s01_dash_charm.scenario.json',
    '--inputs', 'tests/scenarios/p2_s01_dash_charm.inputs.json',
    '--ticks', '40', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 2, 6);
  const charmEv = records.find((r) => r.type === 'event' && r.name === 'charm_picked');
  const dashEvs = records.filter((r) => r.type === 'event' && r.name === 'dash');
  assert(charmEv && charmEv.data.charm_id === 'C1' && charmEv.data.charm_ticks === 600, 'Missing charm_picked');
  assert(dashEvs.length === 2, `Expected 2 chained dashes with zero cd, got ${dashEvs.length}`);
  const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
  assert(snap30.player.charm_s > 9 && snap30.player.dash_cd_s === 0, 'Charm/dash_cd snapshot mismatch');
  return `charm C1 picked, 2 dashes in 15 ticks (cd=0s), pos.x=${snap30.player.pos[0]}m`;
});

runCheck('P2-02', 'Phase 1–2 Regression', 'Night 2 launchpad A->B + fall off island (Y<-10) + 60-tick respawn', () => {
  const out = resolve(outDir, 'p2_s02.jsonl');
  const res = runHeadless([
    '--seed', '202', '--night', '2',
    '--scenario', 'tests/scenarios/p2_s02_launchpad_fall.scenario.json',
    '--inputs', 'tests/scenarios/p2_s02_launchpad_fall.inputs.json',
    '--ticks', '520', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 2, 6);
  const snap100 = records.find((r) => r.type === 'snapshot' && r.tick === 100);
  assert(snap100.player.pos[0] > 45 && snap100.player.grounded, `Did not land on Island B: ${JSON.stringify(snap100.player.pos)}`);
  const fallEv = records.find((r) => r.type === 'event' && r.name === 'player_hit' && r.data.by === 'fall');
  assert(fallEv && fallEv.data.lost === 5 && fallEv.data.flames === 2, `Wrong fall hit: ${JSON.stringify(fallEv)}`);
  const snapEnd = records.filter((r) => r.type === 'snapshot').at(-1);
  assert(snapEnd.player.pos[0] === 0 && snapEnd.player.pos[2] === 0, `Did not respawn at origin: ${JSON.stringify(snapEnd.player.pos)}`);
  return `landed B@x=${snap100.player.pos[0]}, fall@tick=${fallEv.tick}(lost=5), respawned@[0,0,0]`;
});

runCheck('P2-03', 'Phase 1–2 Regression', 'Drifter (Gió Lạc) steals ignoring invuln & drops all on Pulse', () => {
  const out = resolve(outDir, 'p2_s03.jsonl');
  const res = runHeadless([
    '--seed', '203', '--night', '2',
    '--scenario', 'tests/scenarios/p2_s03_drifter.scenario.json',
    '--inputs', 'tests/scenarios/p2_s03_drifter.inputs.json',
    '--ticks', '60', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 2, 6);
  const steal = records.find((r) => r.type === 'event' && r.name === 'drifter_steal');
  const drop = records.find((r) => r.type === 'event' && r.name === 'drifter_drop');
  assert(steal && steal.data.amount === 3 && steal.data.carried === 3, 'Missing drifter_steal');
  assert(drop && drop.data.amount === 3, 'Missing drifter_drop on pulse');
  const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
  assert(snap30.motes.filter((m) => m.kind === 'dropped').length === 3, 'Dropped motes not in snapshot');
  return `steal@tick=${steal.tick}(amt=3), pulse->drop@tick=${drop.tick}(amt=3)`;
});

runCheck('P2-04', 'Phase 1–2 Regression', 'Night 3 Tier 1->Tier 2 launchpad + periodic Wind activation (tick 1800)', () => {
  const out = resolve(outDir, 'p2_s04.jsonl');
  const res = runHeadless([
    '--seed', '204', '--night', '3',
    '--scenario', 'tests/scenarios/p2_s04_night3_wind.scenario.json',
    '--ticks', '1860', '--snapshot-every', '60', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 60, 3, 7);
  const snap60 = records.find((r) => r.type === 'snapshot' && r.tick === 60);
  assert(snap60.player.pos[1] === 6 && snap60.player.grounded, `Did not land on Tier 2 Y=6: ${JSON.stringify(snap60.player.pos)}`);
  const snap1800 = records.find((r) => r.type === 'snapshot' && r.tick === 1800);
  assert(snap1800.wind.active === true, 'Wind did not activate at tick 1800');
  return `landed Tier 2 y=6@[${snap60.player.pos.join(',')}], wind active@1800 dir=${snap1800.wind.dir_deg}°`;
});

runCheck('P2-05', 'Phase 1–2 Regression', 'Pause freezes sim_tick & time_left_s, emits paused/resumed', () => {
  const out = resolve(outDir, 'p2_s05.jsonl');
  const res = runHeadless([
    '--seed', '205', '--night', '1',
    '--scenario', 'tests/scenarios/p2_s05_pause.scenario.json',
    '--inputs', 'tests/scenarios/p2_s05_pause.inputs.json',
    '--ticks', '60', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const pEv = records.find((r) => r.type === 'event' && r.name === 'paused');
  const rEv = records.find((r) => r.type === 'event' && r.name === 'resumed');
  assert(pEv && pEv.tick === 11 && rEv && rEv.tick === 41, 'Wrong pause/resume ticks');
  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
  assert(snap20.state === 'paused' && snap20.sim_tick === 10 && snap30.sim_tick === 10, 'sim_tick did not freeze');
  assert(snap20.time_left_s === snap30.time_left_s, 'time_left_s did not freeze');
  return `paused@11, frozen sim_tick=10 at wall ticks 20&30, resumed@41`;
});

runCheck('P2-06', 'Phase 1–2 Regression', 'Safe zone pushes inside shade out to >=6m within <=30 ticks (0 dmg)', () => {
  const out = resolve(outDir, 'p2_s06.jsonl');
  const res = runHeadless([
    '--seed', '206', '--night', '1',
    '--scenario', 'tests/scenarios/p2_s06_safe_pushout.scenario.json',
    '--inputs', 'tests/scenarios/p2_s06_safe_pushout.inputs.json',
    '--ticks', '40', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  assert(records.filter((r) => r.type === 'event' && r.name === 'player_hit').length === 0, 'Shade dealt damage during pushout');
  const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
  const d30 = Math.hypot(snap30.shades[0].pos[0], snap30.shades[0].pos[2]);
  assert(d30 >= 6.0, `Shade not pushed outside 6m by tick 30: dist=${d30}`);
  return `0 damage during pushout, dist@tick30=${d30.toFixed(3)}m >= 6.0m`;
});

// ── PHASE 3 NEW FEATURE SCENARIOS (CONTRACT V1.2) ──
runCheck('P3-01', 'Phase 3 Feature', 'Lantern fuel decay (1/s) + refuel (+10/mote, +5 score) to 100', () => {
  const out = resolve(outDir, 'p3_s01.jsonl');
  const res = runHeadless([
    '--seed', '301', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s01_fuel_refuel.scenario.json',
    '--inputs', 'tests/scenarios/p3_s01_fuel_refuel.inputs.json',
    '--ticks', '80', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const refuels = records.filter((r) => r.type === 'event' && r.name === 'refuel');
  // Tick 61: fuel dropped from 75 by 61/60 (~73.983) -> ceil((100-73.983)/10) = 3 motes -> fuel=100, +15 score
  // Tick 66: fuel dropped by 5/60 (~99.917) -> 1 mote -> fuel=100, +5 score (total 20)
  assert(refuels.length === 2, `Expected 2 refuel events, got ${refuels.length}`);
  assert(refuels[0].data.amount === 3 && refuels[0].data.fuel === 100, `Bad refuel[0]: ${JSON.stringify(refuels[0])}`);
  assert(records.at(-1).score === 20, `Expected score 20, got ${records.at(-1).score}`);
  return `refuel#1@61(amt=3->100), refuel#2@66(amt=1->100), score=20`;
});

runCheck('P3-02', 'Phase 3 Feature', 'Fuel reaches 0 -> lantern_out + relight costs 5 motes (relight:true, +40 bonus)', () => {
  const out = resolve(outDir, 'p3_s02.jsonl');
  const res = runHeadless([
    '--seed', '302', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s02_out_relight.scenario.json',
    '--inputs', 'tests/scenarios/p3_s02_out_relight.inputs.json',
    '--ticks', '80', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const outEv = records.find((r) => r.type === 'event' && r.name === 'lantern_out');
  const litEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit');
  assert(outEv && outEv.tick === 60 && outEv.data.lantern_id === 'L1', `Missing lantern_out@60: ${JSON.stringify(outEv)}`);
  assert(litEv && litEv.tick === 66 && litEv.data.relight === true, `Missing relight@66: ${JSON.stringify(litEv)}`);
  const snap80 = records.find((r) => r.type === 'snapshot' && r.tick === 80);
  assert(snap80.lanterns[0].relit_count === 1 && snap80.player.carried === 1 && snap80.player.capacity === 12, 'Relight state mismatch');
  assert(records.at(-1).score === 65, `Expected relight score 65 (5*5+40), got ${records.at(-1).score}`);
  return `lantern_out@60, relight@66(cost=5, relit_count=1, cap=12), score=65`;
});

runCheck('P3-03', 'Phase 3 Feature', 'Shade wander -> weak lantern drain (5/s, fuel_drain/60t) -> aggro <=6m + refuel >=30', () => {
  const out = resolve(outDir, 'p3_s03.jsonl');
  const res = runHeadless([
    '--seed', '303', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s03_shade_drain.scenario.json',
    '--inputs', 'tests/scenarios/p3_s03_shade_drain.inputs.json',
    '--ticks', '260', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const drainSnap = records.find((r) => r.type === 'snapshot' && r.shades[0]?.state === 'drain');
  assert(drainSnap, 'Shade never entered drain state');
  const drainEv = records.find((r) => r.type === 'event' && r.name === 'fuel_drain');
  assert(drainEv && drainEv.data.lantern_id === 'L1' && drainEv.data.shade_id === 'S1', 'Missing fuel_drain event');
  const chaseSnap = records.find((r) => r.type === 'snapshot' && r.tick > drainSnap.tick && r.shades[0]?.state === 'chase');
  assert(chaseSnap, 'Draining shade did not switch to chase when player entered <=6m');
  const refuelEv = records.find((r) => r.type === 'event' && r.name === 'refuel');
  assert(refuelEv && refuelEv.data.fuel >= 30, 'Did not refuel L1 >= 30');
  return `drain@snap${drainSnap.tick}, fuel_drain@${drainEv.tick}(fuel=${drainEv.data.fuel}), aggro@snap${chaseSnap.tick}, refuel->${refuelEv.data.fuel}`;
});

runCheck('P3-04', 'Phase 3 Feature', 'Pulse hitting draining shade awards total +15 score (not +5) & stuns 120t', () => {
  const out = resolve(outDir, 'p3_s06.jsonl');
  const res = runHeadless([
    '--seed', '306', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s06_pulse_drain.scenario.json',
    '--inputs', 'tests/scenarios/p3_s06_pulse_drain.inputs.json',
    '--ticks', '40', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const pulseEv = records.find((r) => r.type === 'event' && r.name === 'pulse');
  assert(pulseEv && pulseEv.data.stunned_ids.includes('S1'), 'Pulse did not stun S1');
  const end = records.at(-1);
  assert(end.score === 15, `Expected total +15 for pulsing draining shade, got ${end.score}`);
  const snap20 = records.find((r) => r.type === 'snapshot' && r.tick === 20);
  assert(snap20.shades[0].state === 'stunned', 'Draining shade not stunned');
  return `pulse@tick=${pulseEv.tick} on drain shade -> score=15, state=stunned`;
});

runCheck('P3-05', 'Phase 3 Feature', 'Dawn survival win (>= ceil(0.6*5)=3/5) -> dawn_survived + exact lantern/flame score', () => {
  const out = resolve(outDir, 'p3_s04.jsonl');
  const res = runHeadless([
    '--seed', '304', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s04_dawn_win.scenario.json',
    '--ticks', '150', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 20, 1, 5);
  const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
  const end = records.at(-1);
  assert(over && over.data.result === 'won' && over.data.reason === 'dawn_survived', `Bad game_over: ${JSON.stringify(over)}`);
  // 120 ticks = 2s decay -> fuels 78, 48, 18 -> (50+78)+(50+48)+(50+18) + 2*50 = 394
  assert(end.state === 'won' && end.ticks === 120 && end.score === 394, `Bad end: ${JSON.stringify(end)}`);
  return `won(dawn_survived)@120, 3/5 lit, score=394 (exact dawn bonus)`;
});

runCheck('P3-06', 'Phase 3 Feature', 'Dynamic carry capacity (10 + 2*successful_lights) collects 14/14 when successful_lights=2', () => {
  const out = resolve(outDir, 'p3_s05.jsonl');
  const res = runHeadless([
    '--seed', '305', '--night', '1',
    '--scenario', 'tests/scenarios/p3_s05_capacity.scenario.json',
    '--ticks', '20', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Exit ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 10, 1, 5);
  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  assert(snap10.player.capacity === 14 && snap10.player.carried === 14 && snap10.motes_active === 1, `Bad capacity pickup: ${JSON.stringify(snap10.player)}`);
  return `capacity=14, carried=14/14, motes_left=1`;
});

// ── DETERMINISM ACROSS ALL 3 NIGHTS ──
runCheck('DET', 'Determinism', 'Identical SHA-256 across 2 runs for Nights 1, 2, and 3 (Contract v1.2)', () => {
  const summaries = [];
  for (const [night, lanterns] of [[1, 5], [2, 6], [3, 7]]) {
    const outA = resolve(outDir, `det_n${night}_a.jsonl`);
    const outB = resolve(outDir, `det_n${night}_b.jsonl`);
    const base = ['--seed', String(1337 + night), '--night', String(night), '--ticks', '1300', '--snapshot-every', '50'];
    const resA = runHeadless([...base, '--out', outA]);
    const resB = runHeadless([...base, '--out', outB]);
    assert(resA.status === 0 && resB.status === 0, `Night ${night} determinism run failed`);
    const rawA = readFileSync(outA, 'utf8');
    const rawB = readFileSync(outB, 'utf8');
    const hA = sha256(rawA);
    const hB = sha256(rawB);
    assert(hA === hB, `Night ${night} hash mismatch`);
    const { records } = parseJsonl(outA);
    validateJsonlV12(records, 50, night, lanterns);
    summaries.push(`N${night}=${hA.slice(0, 10)}`);
  }
  return summaries.join(', ');
});

// ── FULL NIGHT 3 PERFORMANCE BENCHMARK (18,000 TICKS = 300s <= 30s) ──
runCheck('PERF', 'Performance', 'Full Night 3 headless (18,000 ticks = 300s v1.2) finishes in <= 30s', () => {
  const out = resolve(outDir, 'perf_night3_18000.jsonl');
  const perfScenario = resolve(outDir, 'perf_night3.scenario.json');
  writeFileSync(
    perfScenario,
    JSON.stringify({
      player: { pos: [0, 0, -20], flames: 999 },
      lanterns: [{ id: 'L1', lit: true, fuel: 100 }],
      random_motes: true,
      random_shades: true,
      random_drifters: true,
      wind_enabled: true,
    }),
    'utf8',
  );
  const t0 = performance.now();
  const res = runHeadless([
    '--seed', '999', '--night', '3',
    '--scenario', perfScenario,
    '--ticks', '18000', '--snapshot-every', '60', '--out', out,
  ]);
  const elapsedMs = performance.now() - t0;
  assert(res.status === 0, `Perf run failed: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlV12(records, 60, 3, 7);
  const end = records.at(-1);
  assert(end.ticks === 18000, `Expected full 18000 ticks, got ${end.ticks}`);
  assert(elapsedMs <= 30000, `Too slow: ${elapsedMs.toFixed(0)}ms > 30000ms`);
  return `18,000 ticks completed in ${elapsedMs.toFixed(0)} ms (limit: 30,000 ms)`;
});

// ── ERROR CODES ──
runCheck('ERR', 'Error Handling', 'Invalid v1.2 inputs/scenario/JSON -> exit 2; bad night -> non-zero', () => {
  const badIn = runHeadless([
    '--seed', '1', '--night', '1',
    '--inputs', 'tests/scenarios/invalid_inputs_ticks.json',
    '--ticks', '10', '--out', resolve(outDir, 'bad1.jsonl'),
  ]);
  assert(badIn.status === 2 && badIn.stderr.trim().length > 0, `bad_inputs exit=${badIn.status}`);

  const badScen = runHeadless([
    '--seed', '1', '--night', '1',
    '--scenario', 'tests/scenarios/invalid_scenario_type.json',
    '--ticks', '10', '--out', resolve(outDir, 'bad2.jsonl'),
  ]);
  assert(badScen.status === 2 && badScen.stderr.trim().length > 0, `bad_scenario exit=${badScen.status}`);

  const badFuelPath = resolve(outDir, 'bad_fuel.scenario.json');
  writeFileSync(badFuelPath, JSON.stringify({ lanterns: [{ id: 'L1', lit: true, fuel: 150 }] }), 'utf8');
  const badFuel = runHeadless([
    '--seed', '1', '--night', '1',
    '--scenario', badFuelPath,
    '--ticks', '10', '--out', resolve(outDir, 'bad_fuel.jsonl'),
  ]);
  assert(badFuel.status === 2 && badFuel.stderr.trim().length > 0, `bad_fuel exit=${badFuel.status}`);

  const badJsonPath = resolve(outDir, 'malformed.json');
  writeFileSync(badJsonPath, '{ not valid json', 'utf8');
  const badJson = runHeadless([
    '--seed', '1', '--night', '1',
    '--inputs', badJsonPath,
    '--ticks', '10', '--out', resolve(outDir, 'bad3.jsonl'),
  ]);
  assert(badJson.status === 2 && badJson.stderr.trim().length > 0, `malformed_json exit=${badJson.status}`);

  const badNight = runHeadless([
    '--seed', '1', '--night', '4',
    '--ticks', '10', '--out', resolve(outDir, 'bad4.jsonl'),
  ]);
  assert(badNight.status !== 0 && badNight.stderr.trim().length > 0, `bad_night exit=${badNight.status}`);

  return 'bad_inputs=2, bad_scenario=2, bad_fuel=2, malformed_json=2, bad_night=1';
});

// Write generated Phase 3 proof report
const proofDir = resolve(root, 'docs/proof/phase-3');
mkdirSync(proofDir, { recursive: true });
const reportLines = [
  '# Phase 3 — Báo cáo Kiểm chứng Test Contract v1.2 (Tự động)',
  '',
  `- **Lệnh chạy:** \`npm run verify:contract\``,
  `- **Headless cmd:** \`${contract.headless_cmd}\``,
  `- **Contract version:** \`${contract.contract_version}\``,
  `- **Node.js:** \`${process.version}\` (${process.platform}/${process.arch})`,
  '',
  '| Mã | Nhóm | Kịch bản kiểm chứng | Kết quả | Chi tiết đo được |',
  '|---|---|---|---|---|',
  ...checks.map((c) => `| ${c.id} | ${c.category} | ${c.description} | **${c.status}** | ${c.detail} |`),
  '',
];
writeFileSync(resolve(proofDir, 'contract-report.md'), reportLines.join('\n'), 'utf8');

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
console.log(`\nAll ${checks.length} Phase 3 contract checks passed! Report written to docs/proof/phase-3/contract-report.md`);
