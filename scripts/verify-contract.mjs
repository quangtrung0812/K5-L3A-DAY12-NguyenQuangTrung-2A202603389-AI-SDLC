import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, 'game.contract.json'), 'utf8'));
const [cmdBin, ...cmdBaseArgs] = contract.headless_cmd.split(/\s+/);
const outDir = resolve(root, 'tmp/verify-phase1');
mkdirSync(outDir, { recursive: true });

function runHeadless(extraArgs) {
  const result = spawnSync(cmdBin, [...cmdBaseArgs, ...extraArgs], {
    cwd: root,
    encoding: 'utf8',
  });
  return result;
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
  if (!cond) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

function validateJsonlStructure(records, snapshotEvery) {
  assert(records.length >= 2, 'JSONL must contain at least tick 0 snapshot and end record');
  assert(records[0].type === 'snapshot' && records[0].tick === 0, 'First record must be snapshot at tick 0');
  const last = records[records.length - 1];
  assert(last.type === 'end', 'Last record must be end');
  assert(['playing', 'won', 'lost'].includes(last.state), `Invalid end state: ${last.state}`);

  for (const r of records) {
    if (r.type === 'snapshot') {
      assert(r.tick % snapshotEvery === 0, `Snapshot tick ${r.tick} not divisible by ${snapshotEvery}`);
      assert(r.sim_tick === r.tick, `sim_tick (${r.sim_tick}) must equal tick (${r.tick}) in Phase 1`);
      assert(Array.isArray(r.lanterns) && r.lanterns.length === 5, 'Snapshot must contain 5 lanterns');
      assert(Array.isArray(r.motes) && r.motes.length === r.motes_active, 'motes array must match motes_active');
    }
  }
}

const checks = [];

function runCheck(id, description, fn) {
  try {
    const detail = fn();
    checks.push({ id, description, status: 'PASS', detail });
    console.log(`[PASS] ${id}: ${description} — ${detail}`);
  } catch (err) {
    checks.push({ id, description, status: 'FAIL', detail: err.message });
    console.error(`[FAIL] ${id}: ${description} — ${err.message}`);
    process.exitCode = 1;
  }
}

// 1. S01: Move, camera yaw, pickup cap
runCheck('S01', 'Move + camera yaw + mote pickup & carry capacity', () => {
  const out = resolve(outDir, 's01.jsonl');
  const res = runHeadless([
    '--seed', '101', '--night', '1',
    '--scenario', 'tests/scenarios/s01_move_pickup.scenario.json',
    '--inputs', 'tests/scenarios/s01_move_pickup.inputs.json',
    '--ticks', '200', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 20);
  const picked = records.filter((r) => r.type === 'event' && r.name === 'mote_picked');
  assert(picked.length === 5, `Expected 5 motes picked (carry cap), got ${picked.length}`);
  const snap180 = records.find((r) => r.type === 'snapshot' && r.tick === 180);
  assert(snap180.player.pos[0] === 6 && snap180.player.pos[2] === 12, `Unexpected pos: ${JSON.stringify(snap180.player.pos)}`);
  assert(snap180.player.carried === 5 && snap180.motes_active === 1, 'Carry cap not respected');
  return `pos=[6,0,12], carried=5/5, motes_left=1, score=${records.at(-1).score}`;
});

// 2. S02: Light last lantern and win
runCheck('S02', 'Deposit + light 5th lantern -> win (all_lit) with bonus score', () => {
  const out = resolve(outDir, 's02.jsonl');
  const res = runHeadless([
    '--seed', '102', '--night', '1',
    '--scenario', 'tests/scenarios/s02_light_and_win.scenario.json',
    '--inputs', 'tests/scenarios/s02_light_and_win.inputs.json',
    '--ticks', '300', '--snapshot-every', '20', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 20);
  const end = records.at(-1);
  assert(end.state === 'won' && end.ticks === 101, `Expected won at tick 101, got ${JSON.stringify(end)}`);
  const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
  assert(over.data.result === 'won' && over.data.reason === 'all_lit', 'Wrong game_over payload');
  assert(end.score === 860, `Expected score 860 (20 motes + 100 lantern + 118*5 time + 3*50 flames), got ${end.score}`);
  return `won at tick=${end.ticks}, score=${end.score}`;
});

// 3. S03: Shade chases, hits twice with invuln, drops motes, loses (no_flames)
runCheck('S03', 'Shade chase + hit + drop ratio + invuln + loss (no_flames)', () => {
  const out = resolve(outDir, 's03.jsonl');
  const res = runHeadless([
    '--seed', '103', '--night', '1',
    '--scenario', 'tests/scenarios/s03_shade_hit_lose.scenario.json',
    '--ticks', '300', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 10);
  const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert(hits.length === 2, `Expected 2 hits, got ${hits.length}`);
  assert(hits[1].tick - hits[0].tick >= 90, `Invuln violated: gap ${hits[1].tick - hits[0].tick} ticks`);
  assert(hits[0].data.dropped === 2 && hits[1].data.dropped === 1, 'Unexpected dropped counts');
  const end = records.at(-1);
  assert(end.state === 'lost', `Expected lost, got ${end.state}`);
  return `hits at ticks ${hits[0].tick} & ${hits[1].tick} (gap=${hits[1].tick - hits[0].tick}), lost(no_flames)`;
});

// 4. S04: Pulse push & stun
runCheck('S04', 'Pulse pushes shade by 6m, stuns for 3s, awards stun score', () => {
  const out = resolve(outDir, 's04.jsonl');
  const res = runHeadless([
    '--seed', '104', '--night', '1',
    '--scenario', 'tests/scenarios/s04_pulse_stun.scenario.json',
    '--inputs', 'tests/scenarios/s04_pulse_stun.inputs.json',
    '--ticks', '210', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 10);
  const pulse = records.find((r) => r.type === 'event' && r.name === 'pulse');
  assert(pulse && pulse.tick === 6 && pulse.data.stunned_ids[0] === 'S1', 'Missing or wrong pulse event');
  const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
  const snap200 = records.find((r) => r.type === 'snapshot' && r.tick === 200);
  assert(snap10.shades[0].state === 'stunned' && snap10.shades[0].pos[0] > 10, 'Shade not pushed/stunned');
  assert(snap200.shades[0].state === 'chase', 'Shade did not recover from stun');
  return `pulse@tick=6, shade x=${snap10.shades[0].pos[0]}m (stunned), recovered@tick=200`;
});

// 5. S05: Lit lantern safe_radius protects player
runCheck('S05', 'Lit lantern safe_radius keeps shade strictly outside 5.5m', () => {
  const out = resolve(outDir, 's05.jsonl');
  const res = runHeadless([
    '--seed', '105', '--night', '1',
    '--scenario', 'tests/scenarios/s05_safe_radius.scenario.json',
    '--ticks', '300', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 10);
  const hits = records.filter((r) => r.type === 'event' && r.name === 'player_hit');
  assert(hits.length === 0, 'Player should not be hit inside lit lantern safe zone');
  const minDist = Math.min(
    ...records
      .filter((r) => r.type === 'snapshot')
      .map((s) => Math.hypot(s.shades[0].pos[0], s.shades[0].pos[2])),
  );
  assert(minDist > contract.tuning.safe_radius, `Shade entered safe_radius: minDist=${minDist}`);
  return `minDist=${minDist.toFixed(3)}m > safe_radius=${contract.tuning.safe_radius}m, hits=0`;
});

// 6. S06: Dawn timeout
runCheck('S06', 'Dawn timeout ends game at exact tick when time_left_s hits 0', () => {
  const out = resolve(outDir, 's06.jsonl');
  const res = runHeadless([
    '--seed', '106', '--night', '1',
    '--scenario', 'tests/scenarios/s06_dawn_timeout.scenario.json',
    '--ticks', '200', '--snapshot-every', '10', '--out', out,
  ]);
  assert(res.status === 0, `Expected exit 0, got ${res.status}: ${res.stderr}`);
  const { records } = parseJsonl(out);
  validateJsonlStructure(records, 10);
  const end = records.at(-1);
  const over = records.find((r) => r.type === 'event' && r.name === 'game_over');
  assert(end.state === 'lost' && end.ticks === 120, `Expected lost at tick 120, got ${JSON.stringify(end)}`);
  assert(over.data.reason === 'dawn', `Expected dawn reason, got ${over.data.reason}`);
  return `lost(dawn) at exact tick=${end.ticks}`;
});

// 7. Determinism on default Night 1 run (random_motes + random_shades enabled, exercises shade_spawned too)
runCheck('DET', 'Determinism check: two Night 1 runs with seed=1337 produce identical SHA-256', () => {
  const outA = resolve(outDir, 'det_a.jsonl');
  const outB = resolve(outDir, 'det_b.jsonl');
  const argsBase = ['--seed', '1337', '--night', '1', '--ticks', '600', '--snapshot-every', '20'];
  const resA = runHeadless([...argsBase, '--out', outA]);
  const resB = runHeadless([...argsBase, '--out', outB]);
  assert(resA.status === 0 && resB.status === 0, 'Determinism runs failed');
  const rawA = readFileSync(outA, 'utf8');
  const rawB = readFileSync(outB, 'utf8');
  const hashA = sha256(rawA);
  const hashB = sha256(rawB);
  assert(hashA === hashB, `Hashes differ: ${hashA} vs ${hashB}`);
  const { records } = parseJsonl(outA);
  validateJsonlStructure(records, 20);
  return `SHA-256=${hashA.slice(0, 16)}... (byte-identical, ${records.length} JSONL lines)`;
});

// 8. Error exit code 2 on invalid inputs/scenario & non-zero on missing CLI value
runCheck('ERR', 'Invalid inputs/scenario files exit with code 2; missing flag exits non-zero', () => {
  const badIn = runHeadless([
    '--seed', '1', '--night', '1',
    '--inputs', 'tests/scenarios/invalid_inputs_ticks.json',
    '--ticks', '10', '--out', resolve(outDir, 'bad1.jsonl'),
  ]);
  assert(badIn.status === 2 && badIn.stderr.trim().length > 0, `Expected exit 2 for bad inputs, got ${badIn.status}`);

  const badScen = runHeadless([
    '--seed', '1', '--night', '1',
    '--scenario', 'tests/scenarios/invalid_scenario_type.json',
    '--ticks', '10', '--out', resolve(outDir, 'bad2.jsonl'),
  ]);
  assert(badScen.status === 2 && badScen.stderr.trim().length > 0, `Expected exit 2 for bad scenario, got ${badScen.status}`);

  const badJsonPath = resolve(outDir, 'malformed.json');
  writeFileSync(badJsonPath, '{ not valid json', 'utf8');
  const badJson = runHeadless([
    '--seed', '1', '--night', '1',
    '--inputs', badJsonPath,
    '--ticks', '10', '--out', resolve(outDir, 'bad3.jsonl'),
  ]);
  assert(badJson.status === 2 && badJson.stderr.trim().length > 0, `Expected exit 2 for malformed JSON, got ${badJson.status}`);

  const missingVal = runHeadless([
    '--seed', '1', '--night', '1',
    '--ticks', '10', '--out', resolve(outDir, 'bad4.jsonl'),
    '--scenario',
  ]);
  assert(missingVal.status !== 0 && missingVal.stderr.trim().length > 0, `Expected non-zero for dangling --scenario, got ${missingVal.status}`);

  return 'bad_inputs -> exit 2, bad_scenario -> exit 2, malformed_json -> exit 2, missing_arg -> exit 1';
});

// Write generated proof report
const proofDir = resolve(root, 'docs/proof/phase-1');
mkdirSync(proofDir, { recursive: true });
const reportLines = [
  '# Phase 1 — Báo cáo Kiểm chứng Test Contract v1.0 (Tự động)',
  '',
  `- **Lệnh chạy:** \`npm run verify:contract\``,
  `- **Headless cmd:** \`${contract.headless_cmd}\``,
  `- **Node.js:** \`${process.version}\` (${process.platform}/${process.arch})`,
  '',
  '| Mã | Kịch bản kiểm chứng | Kết quả | Chi tiết đo được |',
  '|---|---|---|---|',
  ...checks.map((c) => `| ${c.id} | ${c.description} | **${c.status}** | ${c.detail} |`),
  '',
];
writeFileSync(resolve(proofDir, 'contract-report.md'), reportLines.join('\n'), 'utf8');

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}
console.log(`\nAll ${checks.length} contract checks passed! Report written to docs/proof/phase-1/contract-report.md`);
