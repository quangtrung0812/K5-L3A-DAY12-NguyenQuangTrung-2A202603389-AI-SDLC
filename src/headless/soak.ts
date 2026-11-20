import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDefaultInput, LanternIslandSim, round3 } from '../sim/engine.js';
import { SeededRng } from '../sim/prng.js';
import { TICK_RATE } from '../sim/tuning.js';
import type { NightNumber } from '../sim/types.js';

interface SoakArgs {
  seed: number;
  nights: number;
  out: string;
}

function parseArgs(argv: string[]): SoakArgs {
  let seed = 7;
  let nights = 10;
  let out = 'soak.json';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--seed') {
      seed = Number.parseInt(argv[++i] ?? '', 10);
    } else if (arg === '--nights') {
      nights = Number.parseInt(argv[++i] ?? '', 10);
    } else if (arg === '--out') {
      out = argv[++i] ?? '';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(seed)) throw new Error('Invalid --seed');
  if (!Number.isInteger(nights) || nights < 1) throw new Error('Invalid --nights (must be >= 1)');
  if (!out) throw new Error('Missing --out');
  return { seed, nights, out };
}

function getRssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tStart = performance.now();
  const results: string[] = [];
  let crashes = 0;
  let memStartMb = 0;

  for (let i = 0; i < args.nights; i++) {
    const night = ((i % 3) + 1) as NightNumber;
    const nightSeed = args.seed + i;
    try {
      let sim: LanternIslandSim | null = new LanternIslandSim({ seed: nightSeed, night });
      if (i === 0) {
        // mem_start_mb: RSS immediately after loading the first Night
        memStartMb = getRssMb();
      }

      const inputRng = new SeededRng((nightSeed ^ 0x5a5a5a5a) >>> 0);
      const maxTicks = sim.map.durationS * TICK_RATE;
      let moveX = 0;
      let moveZ = 0;
      let camYaw = 0;
      const input = createDefaultInput();

      for (let t = 0; t < maxTicks; t++) {
        if (t % 30 === 0) {
          const angle = inputRng.next() * Math.PI * 2;
          moveX = round3(Math.cos(angle));
          moveZ = round3(Math.sin(angle));
          camYaw = round3(inputRng.next() * 360);
        }
        input.move[0] = moveX;
        input.move[1] = moveZ;
        input.cam_yaw_deg = camYaw;
        input.jump = inputRng.next() < 0.05;
        input.dash = inputRng.next() < 0.03;
        input.pulse = inputRng.next() < 0.02;
        input.interact = inputRng.next() < 0.1;

        sim.step(input);
        if (sim.state === 'won' || sim.state === 'lost') {
          break;
        }
      }

      results.push(sim.state === 'won' ? 'won' : 'lost');
      // Release night state cleanly before next night
      sim = null;
    } catch (err) {
      crashes += 1;
      results.push('crash');
      process.stderr.write(
        `Soak night ${i + 1} (night=${night}, seed=${nightSeed}) crashed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // Trigger optional GC if exposed (--expose-gc), then sample RSS after final night reset
  const maybeGc = (globalThis as unknown as { gc?: () => void }).gc;
  if (typeof maybeGc === 'function') maybeGc();
  const memEndMb = getRssMb();
  const durationS = Math.round(((performance.now() - tStart) / 1000) * 100) / 100;

  const report = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS,
  };

  const outPath = resolve(process.cwd(), args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));

  if (crashes > 0) {
    process.exit(1);
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`Soak error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
